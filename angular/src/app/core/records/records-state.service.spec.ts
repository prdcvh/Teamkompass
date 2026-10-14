import { TestBed } from '@angular/core/testing';
import { EventsService } from '../events.service';
import { SessionService } from '../session.service';
import { SyncService } from '../sync.service';
import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { emptyAbsenceDraft } from './absence';
import { emptyMeasurementDraft } from './measurement';
import { emptyPlanDraft } from './plan';

describe('RecordsStateService', () => {
  let firebase: FakeFirebase;

  async function setup(role?: 'trainer' | 'player' | 'medical') {
    const context = await setupRecords(role);
    firebase = context.firebase;
    return context;
  }

  const absenceDraft = (overrides = {}) => ({ ...emptyAbsenceDraft(), reason: 'Urlaub', from: '2026-10-04', to: '2026-10-10', ...overrides });

  it('lädt Förderpläne, Abwesenheiten und Messwerte in Echtzeit', async () => {
    const { plans, absences, measurements } = await setup();
    expect(plans.plans().map((plan) => [plan.id, plan.focus, plan.status])).toEqual([['dp1', 'Orientierung', 'In Arbeit']]);
    expect(absences.absences().map((absence) => absence.label)).toEqual(['Schule']);
    expect(measurements.measurements().map((entry) => [entry.height, entry.weight])).toEqual([[150, 40]]);
    expect(firebase.calls).toEqual(expect.arrayContaining(['watchPlayerRecords:p1:developmentPlans', 'watchPlayerRecords:p1:absences', 'watchPlayerRecords:p1:measurements']));
  });

  it('Medizin liest, schreibt aber nichts', async () => {
    const { state, plans, absences, measurements } = await setup('medical');
    expect(state.canWrite()).toBe(false);
    expect(plans.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' }).focus).toContain('Nur Trainer');
    expect(absences.saveAbsence(absenceDraft()).reason).toContain('Nur Trainer');
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10'), height: '150' }).date).toContain('Nur Trainer');
    expect(await plans.deletePlan('dp1')).toBe(false);
    expect(await absences.deleteAbsence('ab1')).toBe(false);
    expect(await measurements.deleteMeasurement('me1')).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('savePlayerRecord') || call.startsWith('deletePlayerRecord'))).toBe(false);
  });

  it('meldet Lade- und Speicherfehler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { state, plans } = await setup();
    firebase.records.savePlayerRecordError = { code: 'unavailable' };
    plans.savePlan({ ...emptyPlanDraft(), focus: 'a', goal: 'b' });
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(TestBed.inject(SyncService).detail()).toContain('Förderplan konnte nicht gespeichert werden');
    firebase.records.savePlayerRecordError = null;

    state.stop();
    firebase.records.watchPlayerRecordsError = { code: 'permission-denied' };
    state.start('p1');
    await vi.waitFor(() => expect(state.error()).toContain('Die Zusatzdaten konnten nicht geladen werden'));
    firebase.records.watchPlayerRecordsError = null;
    state.retry();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(state.ready()).toBe(true);
    });
  });

  it('verwirft Daten und Abos beim Abmelden', async () => {
    const { state, plans } = await setup();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(state.playerId()).toBeNull();
    expect(plans.plans()).toEqual([]);
    expect(firebase.records.recordWatchers).toBe(0);
  });

  it('ein Löschfehler lässt den Eintrag stehen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { measurements } = await setup();
    firebase.records.deletePlayerRecordError = { code: 'unavailable' };
    expect(await measurements.deleteMeasurement('me1')).toBe(false);
    expect(measurements.measurements()).toHaveLength(1);
    expect(TestBed.inject(SyncService).state()).toBe('error');
  });

  it('der EventsService ist für den Abgleich geladen', async () => {
    await setup();
    expect(TestBed.inject(EventsService).events()).toHaveLength(3);
  });

  it('Spieler lesen Zusatzdaten nur gefiltert auf die eigene playerId', async () => {
    await setup('player');
    for (const kind of ['developmentPlans', 'absences', 'measurements']) expect(firebase.calls).toContain(`ownOnly:p1:${kind}`);
  });

  it('der Trainer liest ungefiltert', async () => {
    await setup('trainer');
    expect(firebase.calls.filter((call) => call.startsWith('ownOnly'))).toEqual([]);
  });

  it('Medizin liest nur Abwesenheiten und Messwerte, keine Förderpläne', async () => {
    const { plans, absences } = await setup('medical');
    expect(firebase.calls.filter((call) => call.startsWith('watchPlayerRecords')).sort()).toEqual([
      'watchPlayerRecords:p1:absences',
      'watchPlayerRecords:p1:measurements',
    ]);
    expect(plans.plans()).toEqual([]);
    expect(absences.absences()).toHaveLength(1);
  });
});
