import { TestBed } from '@angular/core/testing';
import { EventsService } from './events.service';
import { FirebaseService } from './firebase.service';
import { ProfileService } from './profile.service';
import { RecordsService } from './records.service';
import { emptyAbsenceDraft, emptyMeasurementDraft, emptyPlanDraft } from './records';
import { SessionService } from './session.service';
import { SquadService } from './squad.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('RecordsService', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'player' | 'medical' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.events.set('e1', { type: 'Training', title: 'Training Mo', date: '2026-10-05' });
    firebase.events.set('e2', { type: 'Training', title: 'Training Mi', date: '2026-10-07' });
    firebase.events.set('e3', { type: 'Training', title: 'Training Fr', date: '2026-10-20' });
    firebase.ratings.set('e2', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, playerId: 'p1' }]]));
    firebase.playerRecords.set('p1/developmentPlans', new Map([['dp1', { focus: 'Orientierung', goal: 'Blick', status: 'In Arbeit', createdAt: '2026-09-01', selfReflection: '' }]]));
    firebase.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'absence', label: 'Schule', from: '2026-09-01', to: '2026-09-02' }]]));
    firebase.playerRecords.set('p1/measurements', new Map([['me1', { date: '2026-07-01', height: '150', weight: '40' }]]));
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    if (role === 'player') session.playerId.set('p1');
    const squad = TestBed.inject(SquadService);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    const profile = TestBed.inject(ProfileService);
    profile.start('p1');
    const records = TestBed.inject(RecordsService);
    records.start('p1');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(records.ready()).toBe(true);
      expect(profile.loading()).toBe(false);
    });
    return { records, profile };
  }

  const absenceDraft = (overrides = {}) => ({ ...emptyAbsenceDraft(), reason: 'Urlaub', from: '2026-10-04', to: '2026-10-10', ...overrides });

  it('lädt Förderpläne, Abwesenheiten und Messwerte in Echtzeit', async () => {
    const { records } = await setup();
    expect(records.plans().map((plan) => [plan.id, plan.focus, plan.status])).toEqual([['dp1', 'Orientierung', 'In Arbeit']]);
    expect(records.absences().map((absence) => absence.label)).toEqual(['Schule']);
    expect(records.measurements().map((entry) => [entry.height, entry.weight])).toEqual([[150, 40]]);
    expect(firebase.calls).toEqual(expect.arrayContaining(['watchPlayerRecords:p1:developmentPlans', 'watchPlayerRecords:p1:absences', 'watchPlayerRecords:p1:measurements']));
  });

  describe('Förderpläne', () => {
    it('legt an, bearbeitet (Selbstreflexion bleibt) und löscht', async () => {
      const { records } = await setup();
      expect(records.savePlan({ ...emptyPlanDraft(), focus: 'Mut', goal: 'Mehr 1 gegen 1' })).toEqual({});
      await vi.waitFor(() => expect([...(firebase.playerRecords.get('p1/developmentPlans')?.keys() ?? [])].some((id) => id.startsWith('dp') && id !== 'dp1')).toBe(true));
      const saved = [...firebase.playerRecords.get('p1/developmentPlans')!.values()].find((data) => data['focus'] === 'Mut')!;
      expect(saved).toMatchObject({ playerId: 'p1', status: 'Offen' });

      firebase.playerRecords.get('p1/developmentPlans')!.set('dp1', { ...firebase.playerRecords.get('p1/developmentPlans')!.get('dp1'), selfReflection: 'Lief gut' });
      expect(records.savePlan({ ...emptyPlanDraft(), id: 'dp1', focus: 'Orientierung neu', goal: 'Blick', status: 'Erreicht' })).toEqual({});
      expect(records.plans().find((plan) => plan.id === 'dp1')).toMatchObject({ focus: 'Orientierung neu', status: 'Erreicht', createdAt: '2026-09-01' });

      expect(await records.deletePlan('dp1')).toBe(true);
      expect(records.plans().some((plan) => plan.id === 'dp1')).toBe(false);
      expect(firebase.playerRecords.get('p1/developmentPlans')?.has('dp1')).toBe(false);
    });

    it('schreibt bei ungültigen Eingaben nichts', async () => {
      const { records } = await setup();
      expect(records.savePlan(emptyPlanDraft())).toMatchObject({ focus: expect.any(String), goal: expect.any(String) });
      expect(firebase.calls.some((call) => call.startsWith('savePlayerRecord'))).toBe(false);
    });
  });

  describe('Abwesenheiten (SCRUM-18)', () => {
    it('belegt Events im Zeitraum vor, die noch unbearbeitet sind, und lässt bewertete in Ruhe', async () => {
      const { records } = await setup();
      expect(records.saveAbsence(absenceDraft())).toEqual({});
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', autoAbsence: true, note: 'Urlaub (bis 10.10.2026)' }));
      expect(firebase.ratings.get('e2')?.get('p1')).toMatchObject({ attendance: 'present', effort: 2 }); // schon bewertet
      expect(firebase.ratings.get('e3')?.get('p1')).toBeUndefined(); // außerhalb des Zeitraums
      expect(firebase.playerRecords.get('p1/absences')?.size).toBe(2);
    });

    it('verkürzt: setzt automatisch gesetzte Einträge zurück, die nicht mehr abgedeckt sind', async () => {
      const { records, profile } = await setup();
      records.saveAbsence(absenceDraft());
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')?.['autoAbsence']).toBe(true));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(profile.items().find((item) => item.event.id === 'e1')?.rating?.autoAbsence).toBe(true);
      });
      const id = records.absences().find((absence) => absence.label === 'Urlaub')!.id;
      records.saveAbsence({ ...absenceDraft(), id, from: '2026-10-06', to: '2026-10-10' }); // e1 (05.10.) liegt jetzt davor
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'open', autoAbsence: false, note: '' }));
    });

    it('gelöscht: setzt automatisch gesetzte Einträge zurück, handgesetzte bleiben', async () => {
      const { records, profile } = await setup();
      records.saveAbsence(absenceDraft({ from: '2026-10-01', to: '2026-10-10' }));
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')?.['autoAbsence']).toBe(true));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(profile.items().find((item) => item.event.id === 'e1')?.rating?.autoAbsence).toBe(true);
      });
      const id = records.absences().find((absence) => absence.label === 'Urlaub')!.id;
      expect(await records.deleteAbsence(id)).toBe(true);
      await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'open', autoAbsence: false }));
      expect(firebase.ratings.get('e2')?.get('p1')).toMatchObject({ attendance: 'present', effort: 2 });
    });

    it('prüft Eingaben (offenes Ende nur bei Verletzung)', async () => {
      const { records } = await setup();
      expect(records.saveAbsence(absenceDraft({ to: '' })).to).toBeTruthy();
      expect(records.saveAbsence(absenceDraft({ reason: 'Verletzung', to: '', detail: 'Zerrung' }))).toEqual({});
      await vi.waitFor(() => expect(firebase.ratings.get('e3')?.get('p1')).toMatchObject({ attendance: 'absent', note: 'Verletzung · Zerrung (Ende offen)' }));
    });

    it('gleicht nicht ab, solange Bewertungen noch laden (keine Überschreibung)', async () => {
      const { records, profile } = await setup();
      profile.stop();
      expect(records.reconcileAbsences('p1', [{ id: 'x', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-01', to: '2026-10-30' }])).toBe(0);
      expect(firebase.calls.some((call) => call.startsWith('saveRating'))).toBe(false);
    });
  });

  describe('Messwerte', () => {
    it('legt an, bearbeitet und löscht; schreibt Werte als Text wie die bisherige App', async () => {
      const { records } = await setup();
      expect(records.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10'), height: '155,5', weight: '' })).toEqual({});
      await vi.waitFor(() => expect(firebase.playerRecords.get('p1/measurements')?.size).toBe(2));
      const saved = [...firebase.playerRecords.get('p1/measurements')!.entries()].find(([, data]) => data['date'] === '2026-10-10')!;
      expect(saved[1]).toMatchObject({ height: '155.5', weight: '', playerId: 'p1' });
      expect(records.measurements().map((entry) => entry.date)).toEqual(['2026-07-01', '2026-10-10']);
      expect(await records.deleteMeasurement('me1')).toBe(true);
      expect(records.measurements()).toHaveLength(1);
    });

    it('prüft Eingaben', async () => {
      const { records } = await setup();
      expect(records.saveMeasurement(emptyMeasurementDraft('2026-10-10')).height).toBeTruthy();
    });
  });

  describe('Rollen', () => {
    it('Medizin liest, schreibt aber nichts', async () => {
      const { records } = await setup('medical');
      expect(records.canWrite()).toBe(false);
      expect(records.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }).focus).toContain('Nur Trainer');
      expect(records.saveAbsence(absenceDraft()).reason).toContain('Nur Trainer');
      expect(records.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10'), height: '150' }).date).toContain('Nur Trainer');
      expect(await records.deletePlan('dp1')).toBe(false);
      expect(await records.deleteAbsence('ab1')).toBe(false);
      expect(await records.deleteMeasurement('me1')).toBe(false);
      expect(firebase.calls.some((call) => call.startsWith('savePlayerRecord') || call.startsWith('deletePlayerRecord'))).toBe(false);
    });

    it('der Spieler schreibt nur seine eigene Selbstreflexion, gekürzt auf 400 Zeichen', async () => {
      const { records } = await setup('player');
      expect(await records.saveSelfReflection('dp1', `  ${'x'.repeat(500)}  `)).toBe(true);
      expect(records.plans()[0].selfReflection).toHaveLength(400);
      expect(records.plans()[0].selfReflectionAt).not.toBe('');
      expect(firebase.calls).toContain('saveSelfReflection:p1:dp1');
      expect(await records.saveSelfReflection('gibt-es-nicht', 'x')).toBe(false);
      // Trainer-Funktionen sind für Spieler gesperrt
      expect(records.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }).focus).toContain('Nur Trainer');
    });

    it('ein Trainer nutzt die Selbstreflexion nicht', async () => {
      const { records } = await setup('trainer');
      expect(await records.saveSelfReflection('dp1', 'x')).toBe(false);
    });

    it('ein Spieler schreibt nicht in das Profil eines anderen Spielers', async () => {
      const { records } = await setup('player');
      TestBed.inject(SessionService).playerId.set('p2');
      expect(await records.saveSelfReflection('dp1', 'x')).toBe(false);
    });
  });

  it('meldet Lade- und Speicherfehler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { records } = await setup();
    firebase.savePlayerRecordError = { code: 'unavailable' };
    records.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' });
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(TestBed.inject(SyncService).detail()).toContain('Förderplan konnte nicht gespeichert werden');
    firebase.savePlayerRecordError = null;

    records.stop();
    firebase.watchPlayerRecordsError = { code: 'permission-denied' };
    records.start('p1');
    await vi.waitFor(() => expect(records.error()).toContain('Die Zusatzdaten konnten nicht geladen werden'));
    firebase.watchPlayerRecordsError = null;
    records.retry();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(records.ready()).toBe(true);
    });
  });

  it('verwirft Daten und Abos beim Abmelden', async () => {
    const { records } = await setup();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(records.playerId()).toBeNull();
    expect(records.plans()).toEqual([]);
    expect(firebase.recordWatchers).toBe(0);
  });

  it('ein Löschfehler lässt den Eintrag stehen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { records } = await setup();
    firebase.deletePlayerRecordError = { code: 'unavailable' };
    expect(await records.deleteMeasurement('me1')).toBe(false);
    expect(records.measurements()).toHaveLength(1);
    expect(TestBed.inject(SyncService).state()).toBe('error');
  });

  it('der EventsService ist für den Abgleich geladen', async () => {
    await setup();
    expect(TestBed.inject(EventsService).events()).toHaveLength(3);
  });
});
