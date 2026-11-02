import { type TeamEvent } from '../events/event';
import type { SelfReport, WellnessEntry } from './self-report';
import { HARDER_HINT, LIGHTER_HINT, WELLNESS_HINT, deviationHint, exertionPairs, wellnessStatus } from './self-report-hints';

/** Hinweise aus den Spielerangaben (SCRUM-138): Abweichung 3 von 5 Terminen ≥ 2 Stufen, Befinden gegen den eigenen Normalwert. */
describe('self-report-hints', () => {
  const event = (n: number, exertion: number): TeamEvent =>
    ({ id: `e${n}`, type: 'Training', title: 'T', date: `2026-10-${String(n).padStart(2, '0')}`, exertion, intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: '18:00', durationMinutes: 90, locationCoords: null, notes: '' }) as TeamEvent;
  /** Termine 1…n mit Trainerwert 4 und den angegebenen Spielerwerten (null = keine Angabe). */
  const setup = (values: readonly (number | null)[]) => {
    const events = values.map((_, index) => event(index + 1, 4));
    const reports = new Map<string, SelfReport>();
    values.forEach((value, index) => {
      if (value !== null) reports.set(`e${index + 1}`, { eventId: `e${index + 1}`, date: events[index].date, exertion: value, updatedAt: null });
    });
    return exertionPairs(events, reports);
  };

  describe('Abweichung Spieler ↔ Trainer', () => {
    it('3 von 5 Terminen ≥ 2 Stufen darüber: härter als geplant', () => {
      expect(deviationHint(setup([6, 4, 7, 5, 6]))).toBe(HARDER_HINT);
      expect(deviationHint(setup([10, 6, 6, 6]))).toBe(HARDER_HINT);
    });

    it('3 von 5 Terminen ≥ 2 Stufen darunter: leichter als geplant', () => {
      expect(deviationHint(setup([2, 2, 5, 1, 4]))).toBe(LIGHTER_HINT);
    });

    it('nur 2 von 5 oder nur 1 Stufe: kein Hinweis', () => {
      expect(deviationHint(setup([6, 6, 5, 5, 4]))).toBeNull();
      expect(deviationHint(setup([5, 5, 5, 5, 5]))).toBeNull();
      expect(deviationHint(setup([6, 2, 6, 2, 4]))).toBeNull();
      expect(deviationHint([])).toBeNull();
    });

    it('zählt nur die letzten 5 Termine mit Spielerangabe', () => {
      // Termine 1–3 deutlich härter, die jüngsten 5 Angaben (4–8) nicht mehr.
      expect(deviationHint(setup([7, 7, 7, 4, 4, 5, 4, 4]))).toBeNull();
      // Termine ohne Angabe zählen nicht mit: 3 der letzten 5 Angaben deutlich härter.
      expect(deviationHint(setup([6, null, 6, null, null, 4, 6, 4]))).toBe(HARDER_HINT);
    });

    it('vergleicht mit dem Trainerwert aus der Eventliste', () => {
      expect(setup([6])[0]).toMatchObject({ trainer: 4, player: 6 });
    });
  });

  describe('Befinden gegen den eigenen Normalwert', () => {
    const entry = (date: string, sum: [number, number, number, number]): WellnessEntry => ({ eventId: date, date, fatigue: sum[0], sleep: sum[1], soreness: sum[2], stress: sum[3], updatedAt: null });
    /** 6 Antworten zwischen 05.10. und 25.10. mit den Summen 20/20/22/22/21/21 (Schnitt 21, Standardabweichung ≈ 0,8). */
    const normal = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19', '2026-10-25'].map((date, i) => entry(date, i < 2 ? [5, 5, 5, 5] : i < 4 ? [6, 6, 5, 5] : [6, 5, 5, 5]));
    const TODAY = '2026-10-30';

    it('deutlich darunter (≥ 3 Punkte und ≥ 1 Standardabweichung): Hinweis', () => {
      const status = wellnessStatus([...normal, entry('2026-10-29', [4, 4, 5, 5])], TODAY);
      expect(status).toEqual({ current: 18, baseline: 21, answers: 6, hint: WELLNESS_HINT });
    });

    it('nur 2 Punkte darunter: kein Hinweis', () => {
      expect(wellnessStatus([...normal, entry('2026-10-29', [5, 4, 5, 5])], TODAY).hint).toBeNull();
    });

    it('bei stark schwankenden Antworten braucht es mehr als 3 Punkte (eine Standardabweichung)', () => {
      const wild = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19', '2026-10-25'].map((date, i) => entry(date, i % 2 ? [7, 7, 7, 7] : [4, 4, 4, 4]));
      // Schnitt 22, Standardabweichung 6: 4 Punkte darunter reichen nicht, 7 schon.
      expect(wellnessStatus([...wild, entry('2026-10-29', [5, 5, 4, 4])], TODAY).hint).toBeNull();
      expect(wellnessStatus([...wild, entry('2026-10-29', [4, 4, 4, 3])], TODAY).hint).toBe(WELLNESS_HINT);
    });

    it('frühestens ab 6 Antworten in den 4 Wochen davor', () => {
      const status = wellnessStatus([...normal.slice(1), entry('2026-10-29', [1, 1, 1, 1])], TODAY);
      expect(status).toMatchObject({ current: 4, baseline: null, answers: 5, hint: null });
      // Ältere Antworten (mehr als 28 Tage vor der jüngsten) zählen nicht mit.
      const old = entry('2026-09-20', [5, 5, 5, 5]);
      expect(wellnessStatus([old, ...normal.slice(1), entry('2026-10-29', [1, 1, 1, 1])], TODAY).baseline).toBeNull();
    });

    it('unvollständige Antworten und alte Antworten ergeben keinen aktuellen Wert', () => {
      const partial: WellnessEntry = { ...entry('2026-10-29', [1, 1, 1, 1]), sleep: null };
      expect(wellnessStatus([...normal, partial], TODAY)).toMatchObject({ current: 21, hint: null });
      expect(wellnessStatus([...normal, entry('2026-10-20', [1, 1, 1, 1])], '2026-11-20').current).toBeNull();
    });
  });
});
