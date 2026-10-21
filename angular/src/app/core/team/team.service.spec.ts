import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { injuryRisk } from '../analysis/risk';
import { absenceFromDoc } from '../records/absence';
import { effectiveStatus } from '../records/availability';
import { measurementFromDoc } from '../records/measurement';
import { addDays, todayIso } from '../shared/dates';
import { TeamService } from './team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('TeamService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ben Bauer', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(TeamService);
  }

  const settle = async (team: TeamService) =>
    vi.waitFor(() => {
      TestBed.tick();
      expect(team.ready()).toBe(true);
    });

  it('lädt Bewertungen aller Spieler je Event sowie Abwesenheiten und Messwerte je Spieler', async () => {
    const team = setup();
    team.start();
    await settle(team);
    expect(firebase.calls).toEqual(
      expect.arrayContaining(['watchRatings:e1', 'watchRecentAbsences:p1', 'watchRecentMeasurements:p1', 'watchRecentAbsences:p2', 'watchRecentMeasurements:p2']),
    );
    const data = team.data();
    expect(data.map((entry) => entry.player.name).sort()).toEqual(['Ali Adler', 'Ben Bauer']);
    const ali = data.find((entry) => entry.player.id === 'p1')!;
    expect(ali.items[0].rating?.attendance).toBe('present');
    expect(data.find((entry) => entry.player.id === 'p2')!.items[0].rating).toBeNull();
  });

  it('folgt neuen Spielern und Events und beendet Abos entfernter Events', async () => {
    const team = setup();
    team.start();
    await settle(team);
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Spiel', date: '2026-10-05' });
    firebase.events.emitEvents();
    firebase.players.players.set('p3', { name: 'Cem Cakir', positions: ['TW'], number: 1, birthdate: '2013-01-01' });
    firebase.players.emitPlayers();
    await settle(team);
    expect(firebase.calls).toContain('watchRatings:e2');
    expect(firebase.calls).toContain('watchRecentAbsences:p3');

    const before = firebase.ratings.ratingWatchers;
    firebase.events.events.delete('e2');
    firebase.events.emitEvents();
    TestBed.tick();
    expect(firebase.ratings.ratingWatchers).toBe(before - 1);
    expect(team.data()[0].items.map((item) => item.event.id)).toEqual(['e1']);
  });

  it('startet für andere Rollen als Trainer nichts', () => {
    const team = setup('physio');
    team.start();
    expect(team.active()).toBe(false);
    expect(firebase.calls).not.toContain('watchRatings:e1');
  });

  it('verwirft beim Abmelden alle Abos und Daten', async () => {
    const team = setup();
    team.start();
    await settle(team);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(team.active()).toBe(false);
    expect(team.data()).toEqual([]);
    expect(firebase.ratings.ratingWatchers).toBe(0);
    expect(firebase.records.recordWatchers).toBe(0);
  });

  it('meldet einen Abo-Fehler mit verständlichem Text und kann es erneut versuchen', async () => {
    const team = setup();
    firebase.ratings.watchRatingsError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    team.start();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(team.error()).not.toBe('');
    });
    expect(team.error()).toContain('Teamauswertung');
    expect(team.loading()).toBe(false);
    firebase.ratings.watchRatingsError = null;
    team.retry();
    await settle(team);
    expect(team.error()).toBe('');
  });
  describe('Lesezugriffe und Verfügbarkeit (SCRUM-200)', () => {
    const today = todayIso();
    const day = (offset: number) => addDays(today, offset);
    const absence = (from: number, to: number | null, extra: Record<string, unknown> = {}) => ({
      kind: 'absence',
      label: 'Urlaub',
      detail: '',
      from: day(from),
      to: to === null ? '' : day(to),
      playerId: 'p1',
      ...extra,
    });
    const injury = (from: number, to: number | null) => absence(from, to, { kind: 'injury', label: 'Verletzung' });

    /** Spieler p1 mit Grenzfällen, p2 mit langer Historie. */
    function seed() {
      const records = firebase.records.playerRecords;
      records.set(
        'p1/absences',
        new Map([
          ['ends-today', absence(-5, 0)],
          ['starts-tomorrow', absence(1, 4, { label: 'Sperre' })],
          ['open-injury', injury(-30, null)],
          ['ended-3-days-ago', injury(-20, -3)],
          ['ended-long-ago', injury(-400, -380)],
          ['ended-22-days-ago', absence(-30, -22)],
        ]),
      );
      records.set(
        'p2/absences',
        new Map([
          ['old-1', absence(-900, -880)],
          ['old-2', absence(-700, -690)],
          ['ended-yesterday', absence(-4, -1)],
          ['ended-14-days-ago', absence(-20, -14)],
        ]),
      );
      records.set(
        'p1/measurements',
        new Map([
          ['m-old', { date: day(-400), height: '140', weight: '35' }],
          ['m-89', { date: day(-89), height: '150', weight: '40' }],
          ['m-10', { date: day(-10), height: '151', weight: '41' }],
        ]),
      );
    }

    it('liest Abwesenheiten und Messwerte nur im Fenster der Übersichten, nicht die Historie', async () => {
      const team = setup();
      seed();
      team.start();
      await settle(team);
      const p1 = team.data().find((entry) => entry.player.id === 'p1')!;
      expect(p1.absences.map((item) => item.id).sort()).toEqual(['ended-3-days-ago', 'ends-today', 'open-injury', 'starts-tomorrow']);
      expect(p1.measurements.map((item) => item.id).sort()).toEqual(['m-10', 'm-89']);
      const p2 = team.data().find((entry) => entry.player.id === 'p2')!;
      expect(p2.absences.map((item) => item.id).sort()).toEqual(['ended-14-days-ago', 'ended-yesterday']);
      expect(firebase.calls.filter((call) => call.startsWith('watchPlayerRecords:'))).toEqual([]);
    });

    it('hat genau ein Abo auf die Abwesenheiten je Spieler (kein doppeltes Abo mit der Kaderliste)', async () => {
      const team = setup();
      seed();
      const { SquadAbsencesService } = await import('../records/squad-absences.service');
      TestBed.inject(SquadAbsencesService).start(); // wie die Kaderliste
      team.start();
      await settle(team);
      expect(firebase.calls.filter((call) => call.startsWith('watchRecentAbsences:')).sort()).toEqual(['watchRecentAbsences:p1', 'watchRecentAbsences:p2']);
    });

    it('liest messbar weniger Dokumente als vorher (alle Abwesenheiten zweimal + alle Messwerte)', async () => {
      const team = setup();
      seed();
      const total = (kind: string) => ['p1', 'p2'].reduce((sum, id) => sum + (firebase.records.playerRecords.get(`${id}/${kind}`)?.size ?? 0), 0);
      const before = 2 * total('absences') + total('measurements'); // vorher: TeamService und SquadAbsencesService, je Spieler alles
      team.start();
      await settle(team);
      const after = firebase.records.docsDelivered;
      expect(before).toBe(2 * 10 + 3);
      expect(after).toBe(4 + 2 + 2); // 4 + 2 Abwesenheiten, 2 Messwerte
      expect(after).toBeLessThan(before);
    });

    it('liefert dieselbe Verfügbarkeit und Belastungsampel wie mit der vollen Historie (Grenzfälle)', async () => {
      const team = setup();
      seed();
      team.start();
      await settle(team);
      for (const entry of team.data()) {
        const fullAbsences = [...(firebase.records.playerRecords.get(`${entry.player.id}/absences`) ?? new Map())].map(([id, data]) => absenceFromDoc(id, data));
        const fullMeasurements = [...(firebase.records.playerRecords.get(`${entry.player.id}/measurements`) ?? new Map())].map(([id, data]) => measurementFromDoc(id, data, today));
        for (let offset = -2; offset <= 3; offset += 1) {
          const date = day(offset);
          const now = new Date(`${date}T12:00:00`);
          expect(effectiveStatus(entry.player, entry.absences, date), `${entry.player.id} ${date}`).toBe(effectiveStatus(entry.player, fullAbsences, date));
          expect(injuryRisk(entry.player, entry.items, entry.absences, entry.measurements, now), `${entry.player.id} ${date}`).toEqual(
            injuryRisk(entry.player, entry.items, fullAbsences, fullMeasurements, now),
          );
        }
      }
      const byId = new Map(team.data().map((entry) => [entry.player.id, entry]));
      const p1 = byId.get('p1')!;
      expect(effectiveStatus(p1.player, p1.absences, today)).toBe('Verletzt'); // unbefristete Verletzung
      expect(effectiveStatus(p1.player, p1.absences, day(1))).toBe('Verletzt');
      expect(effectiveStatus(byId.get('p2')!.player, byId.get('p2')!.absences, today)).toBe('Fit');
    });

    it('Abwesenheit endet heute: heute noch abwesend, morgen wieder fit; beginnt morgen: heute noch fit', async () => {
      const team = setup();
      firebase.records.playerRecords.set('p1/absences', new Map([['a', absence(-3, 0)]]));
      firebase.records.playerRecords.set('p2/absences', new Map([['b', absence(1, 5)]]));
      team.start();
      await settle(team);
      const [p1, p2] = ['p1', 'p2'].map((id) => team.data().find((entry) => entry.player.id === id)!);
      expect(effectiveStatus(p1.player, p1.absences, today)).toBe('Abwesend');
      expect(effectiveStatus(p1.player, p1.absences, day(1))).toBe('Fit');
      expect(effectiveStatus(p2.player, p2.absences, today)).toBe('Fit');
      expect(effectiveStatus(p2.player, p2.absences, day(1))).toBe('Abwesend');
    });

    it('übernimmt neu angelegte und gelöschte Abwesenheiten sofort', async () => {
      const team = setup();
      team.start();
      await settle(team);
      await firebase.records.savePlayerRecord('p1', 'absences', 'neu', absence(-1, 2));
      TestBed.tick();
      expect(team.data().find((entry) => entry.player.id === 'p1')!.absences.map((item) => item.id)).toEqual(['neu']);
      await firebase.records.deletePlayerRecord('p1', 'absences', 'neu');
      TestBed.tick();
      expect(team.data().find((entry) => entry.player.id === 'p1')!.absences).toEqual([]);
    });

    it('meldet einen Fehler im Abwesenheits-Abo als Fehler der Teamauswertung', async () => {
      const team = setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      firebase.records.watchPlayerRecordsError = { code: 'permission-denied' };
      team.start();
      await vi.waitFor(() => {
        TestBed.tick();
        expect(team.error()).toContain('Teamauswertung');
      });
      firebase.records.watchPlayerRecordsError = null;
      team.retry();
      await settle(team);
      expect(team.error()).toBe('');
    });
  });
});
