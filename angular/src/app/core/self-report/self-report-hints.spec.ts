import { type TeamEvent } from '../events/event';
import type { SelfReport, WellnessEntry } from './self-report';
import { LIGHTER_HINT, RISK_FACTORS, decayedContribution, deviationStrength, exertionPairs, lighterHint, wellnessRisk, wellnessStatus, wellnessStrength, wellnessTier } from './self-report-hints';

/** Risikowert mit Abklingzeit (SCRUM-177) aus den Spielerangaben (SCRUM-138) und Befindensanzeige gegen den eigenen Normalwert. */
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

  describe('Risikowert mit Abklingzeit', () => {
    const entry = (date: string, values: [number, number, number, number]): WellnessEntry => ({ eventId: date, date, fatigue: values[0], sleep: values[1], soreness: values[2], stress: values[3], updatedAt: null });
    const fine = [4, 4, 4, 4] as [number, number, number, number];
    const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

    it('Stärke: normal und besser = 0, sehr schlecht = 1', () => {
      expect([7, 5, 4, 3, 2, 1].map(wellnessStrength)).toEqual([0, 0, 0, 1 / 3, 2 / 3, 1]);
      expect([0, 1, 2, 3, 4, 7].map(deviationStrength)).toEqual([0, 0, 1 / 3, 2 / 3, 1, 1]);
    });

    it('ein Signal zählt heute voll und klingt mit der Abklingzeit ab (Halbwertszeit 0,69 · τ)', () => {
      const { weight, tau } = RISK_FACTORS.soreness;
      expect(decayedContribution('soreness', 1, day(10), day(10))).toBeCloseTo(weight, 10);
      expect(decayedContribution('soreness', 1, day(10), day(11))).toBeCloseTo(weight * Math.exp(-1 / tau), 10);
      // nach τ Tagen noch 1/e, nach 0,69 · τ ≈ 2 Tagen etwa die Hälfte
      expect(decayedContribution('soreness', 1, day(10), day(13))).toBeCloseTo(weight / Math.E, 10);
      expect(decayedContribution('soreness', 1, day(10), day(12))).toBeCloseTo(0.51, 2);
      const scores = [10, 11, 12, 13, 14, 17].map((today) => wellnessRisk([entry(day(10), [4, 4, 1, 4])], [], day(today)).score);
      expect(scores).toEqual([1, 0.72, 0.51, 0.37, 0.26, 0.1]);
      expect(scores.every((score, i) => i === 0 || score < scores[i - 1])).toBe(true);
    });

    it('Stufe wechselt bei festen Beispielwerten: ein starker Muskelkater erst Beobachten, nach 3 Tagen wieder Unauffällig', () => {
      const sore = [entry(day(10), [4, 4, 1, 4])];
      expect(wellnessRisk(sore, [], day(10))).toMatchObject({ score: 1, tier: 'beobachten', level: 'Beobachten' });
      expect(wellnessRisk(sore, [], day(11)).tier).toBe('unauffaellig');
      expect(wellnessRisk(sore, [], day(13)).tier).toBe('unauffaellig');
    });

    it('mehrere Signale addieren sich über Faktoren und über Tage', () => {
      const single = wellnessRisk([entry(day(10), [4, 4, 2, 4])], [], day(10)).score; // 1,0 · 2/3
      const two = wellnessRisk([entry(day(10), [3, 4, 2, 4])], [], day(10)).score; // + 1,0 · 1/3
      expect(single).toBe(0.67);
      expect(two).toBe(1);
      // drei Tage hintereinander leicht schlecht (alle Fragen 3) ergeben zusammen mehr als jeder Tag allein
      const days = [entry(day(8), [3, 3, 3, 3]), entry(day(9), [3, 3, 3, 3]), entry(day(10), [3, 3, 3, 3])];
      const oneDay = wellnessRisk(days.slice(2), [], day(10));
      const threeDays = wellnessRisk(days, [], day(10));
      expect(oneDay).toMatchObject({ score: 1.17, tier: 'beobachten' });
      expect(threeDays.score).toBeGreaterThan(oneDay.score);
      expect(threeDays).toMatchObject({ score: 2.65, tier: 'anpassen', level: 'Anpassen' });
      // Beiträge je Faktor, größter zuerst
      expect(threeDays.contributions.map((item) => item.factor)).toEqual(['fatigue', 'soreness', 'stress', 'sleep']);
    });

    it('Abweichung Spieler ↔ Trainer: nur „härter“ ab 2 Stufen zählt und klingt ab', () => {
      const harder = setup([7]); // Trainer 4, Spieler 7: Differenz 3
      expect(wellnessRisk([], harder, '2026-10-01')).toMatchObject({ score: 0.53, tier: 'unauffaellig' }); // 0,8 · 2/3
      expect(wellnessRisk([], harder, '2026-10-06').score).toBe(0.2); // 0,8 · 2/3 · e^(−1)
      expect(wellnessRisk([], setup([5, 3, 2]), '2026-10-03').score).toBe(0);
      expect(wellnessRisk([], setup([6, 6, 6]), '2026-10-03').contributions).toEqual([{ factor: 'deviation', label: RISK_FACTORS.deviation.label, value: 0.66 }]);
    });

    it('Zukunft, sehr alte und fehlende Antworten zählen nicht; ohne Daten Unauffällig', () => {
      expect(wellnessRisk([], [], day(10))).toEqual({ hasData: false, basis: 'none', score: 0, tier: 'unauffaellig', level: 'Unauffällig', contributions: [] });
      expect(wellnessRisk([entry(day(11), [1, 1, 1, 1])], [], day(10)).score).toBe(0);
      expect(wellnessRisk([entry('2026-09-01', [1, 1, 1, 1])], [], day(10)).score).toBe(0);
      expect(wellnessRisk([{ ...entry(day(10), fine), fatigue: null, soreness: 1 }], [], day(10)).score).toBe(1);
    });

    it('basis: Befinden, nur Anstrengung, beides oder keine Daten im Auswertungsfenster', () => {
      const pairs = setup([6]); // Termin am 01.10.
      const wellness = [entry(day(1), fine)];
      expect(wellnessRisk(wellness, pairs, day(2))).toMatchObject({ hasData: true, basis: 'both' });
      expect(wellnessRisk(wellness, [], day(2))).toMatchObject({ hasData: true, basis: 'wellness' });
      expect(wellnessRisk([], pairs, day(2))).toMatchObject({ hasData: true, basis: 'exertion' });
      // Ein Spielertermin mit gleichem Wert ist ebenfalls vergleichbar (Entwarnung möglich), aber nicht älter als 21 Tage.
      expect(wellnessRisk(wellness, pairs, day(30))).toMatchObject({ hasData: false, basis: 'none' });
      expect(wellnessRisk([{ ...entry(day(1), fine), fatigue: null, sleep: null, soreness: null, stress: null }], [], day(2)).hasData).toBe(false);
    });

    it('Stufen an den Schwellen', () => {
      expect([0, 0.99, 1, 1.99, 2, 5].map(wellnessTier)).toEqual(['unauffaellig', 'unauffaellig', 'beobachten', 'beobachten', 'anpassen', 'anpassen']);
    });
  });

  describe('Leichter-Info', () => {
    it('3 von 5 Terminen ≥ 2 Stufen darunter: Info', () => {
      expect(lighterHint(setup([2, 2, 5, 1, 4]))).toBe(LIGHTER_HINT);
    });

    it('nur 2 von 5, nur 1 Stufe oder „härter“: keine Info', () => {
      expect(lighterHint(setup([2, 2, 5, 5, 4]))).toBeNull();
      expect(lighterHint(setup([3, 3, 3, 3, 3]))).toBeNull();
      expect(lighterHint(setup([7, 7, 7, 7, 7]))).toBeNull();
      expect(lighterHint([])).toBeNull();
    });

    it('zählt nur die letzten 5 Termine mit Spielerangabe', () => {
      expect(lighterHint(setup([1, 1, 1, 4, 4, 5, 4, 4]))).toBeNull();
      expect(lighterHint(setup([2, null, 2, null, null, 4, 2, 4]))).toBe(LIGHTER_HINT);
    });
  });

  describe('Befinden gegen den eigenen Normalwert', () => {
    const entry = (date: string, sum: [number, number, number, number]): WellnessEntry => ({ eventId: date, date, fatigue: sum[0], sleep: sum[1], soreness: sum[2], stress: sum[3], updatedAt: null });
    /** 6 Antworten zwischen 05.10. und 25.10. mit den Summen 20/20/22/22/21/21 (Schnitt 21, Standardabweichung ≈ 0,8). */
    const normal = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19', '2026-10-25'].map((date, i) => entry(date, i < 2 ? [5, 5, 5, 5] : i < 4 ? [6, 6, 5, 5] : [6, 5, 5, 5]));
    const TODAY = '2026-10-30';

    it('jüngste Summe und eigener Normalwert (Schnitt der 28 Tage davor)', () => {
      const status = wellnessStatus([...normal, entry('2026-10-29', [4, 4, 5, 5])], TODAY);
      expect(status).toEqual({ current: 18, baseline: 21, answers: 6 });
    });

    it('frühestens ab 6 Antworten in den 4 Wochen davor', () => {
      const status = wellnessStatus([...normal.slice(1), entry('2026-10-29', [1, 1, 1, 1])], TODAY);
      expect(status).toMatchObject({ current: 4, baseline: null, answers: 5 });
      // Ältere Antworten (mehr als 28 Tage vor der jüngsten) zählen nicht mit.
      const old = entry('2026-09-20', [5, 5, 5, 5]);
      expect(wellnessStatus([old, ...normal.slice(1), entry('2026-10-29', [1, 1, 1, 1])], TODAY).baseline).toBeNull();
    });

    it('unvollständige Antworten und alte Antworten ergeben keinen aktuellen Wert', () => {
      const partial: WellnessEntry = { ...entry('2026-10-29', [1, 1, 1, 1]), sleep: null };
      expect(wellnessStatus([...normal, partial], TODAY)).toMatchObject({ current: 21 });
      expect(wellnessStatus([...normal, entry('2026-10-20', [1, 1, 1, 1])], '2026-11-20').current).toBeNull();
    });
  });
});
