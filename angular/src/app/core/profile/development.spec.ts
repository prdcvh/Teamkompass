import { describe, expect, it } from 'vitest';
import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import { type DevelopmentPeriod, developmentPeriod, developmentSummary, lastStep, lastStepLabel, spanText } from './development';
import { type EventRating, gradedEvents, plotChart, profileFigures, trendChart } from './profile';
import { profileReportHtml } from './profile-report';
import { buildSeasonReport } from './season-report';
import { seasonReportsHtml } from './season-report-html';

/** Feste Daten (SCRUM-265): jede Erwartung ist von Hand nachgerechnet. */
const TODAY = '2026-10-20';
const event = (id: string, date: string): TeamEvent => ({ id, type: 'Training', title: `Termin ${id}`, date, intensity: 2, exertion: 5 }) as TeamEvent;
const rated = (grade: number, overrides: Partial<Rating> = {}): Rating => ({
  ...BLANK_RATING,
  attendance: 'present',
  effort: grade,
  technique: grade,
  tactics: grade,
  comprehension: grade,
  ...overrides,
});
const series = (entries: readonly [string, number, Partial<Rating>?][]): EventRating[] =>
  entries.map(([date, grade, overrides], index) => ({ event: event(`e${index}`, date), rating: rated(grade, overrides) }));
const all = (items: EventRating[]) => developmentPeriod('all', TODAY, gradedEvents(items));
const summary = (items: EventRating[], period: DevelopmentPeriod = all(items)) => developmentSummary(gradedEvents(items), period, TODAY);

describe('Entwicklung über die Zeit (SCRUM-265)', () => {
  describe('gleicher Notenabstand, verschiedene Zeiträume', () => {
    // Beide Reihen: 3, 3 → 2, 2 (Unterschied 1,0).
    const days = series([
      ['2026-10-15', 3],
      ['2026-10-16', 3],
      ['2026-10-17', 2],
      ['2026-10-18', 2],
    ]);
    const weeks = series([
      ['2026-08-24', 3],
      ['2026-08-31', 3],
      ['2026-10-05', 2],
      ['2026-10-12', 2],
    ]);
    const months = series([
      ['2025-11-03', 3],
      ['2025-11-10', 3],
      ['2026-10-05', 2],
      ['2026-10-12', 2],
    ]);

    it('innerhalb weniger Tage: zu wenig Daten statt „besser“', () => {
      const result = summary(days);
      expect(result.state).toBe('insufficient');
      expect(result.label).toBe('zu wenig Daten');
      expect(result.change).toBeNull();
      expect(result.hints.join(' ')).toContain('zu dicht');
    });

    it('über Wochen bzw. ein Jahr: besser, aber mit unterschiedlichem, ausgewiesenem Abstand', () => {
      const short = summary(weeks);
      const long = summary(months);
      expect(short.state).toBe('better');
      expect(long.state).toBe('better');
      expect(short.label).toBe('besser (+1,0)');
      // Gruppenmitte 27.08. → 08.10. = 42 Tage; 06.11.2025 → 08.10.2026 = 336 Tage.
      expect(short.separationDays).toBe(42);
      expect(long.separationDays).toBe(336);
      expect(short.detail).toContain('Abstand 6 Wochen');
      expect(long.detail).toContain('Abstand 11 Monate');
      expect(short.detail).not.toBe(long.detail);
    });

    it('Lücke über 6 Wochen wird ausgewiesen', () => {
      expect(summary(months).hints.join(' ')).toContain('Lücke ohne Bewertung: 11 Monate (10.11.2025 – 05.10.2026)');
    });

    it('die Kachel „Letzte Änderung“ nennt den Zeitabstand', () => {
      const quick = lastStep(gradedEvents(series([['2026-10-01', 3], ['2026-10-04', 2]])));
      const slow = lastStep(gradedEvents(series([['2026-01-01', 3], ['2026-10-04', 2]])));
      expect(quick).toEqual({ change: 1, days: 3, scaleChanged: false });
      expect(lastStepLabel(quick, 'grades')).toBe('+1 nach 3 Tagen');
      expect(lastStepLabel(slow, 'grades')).toBe('+1 nach 9 Monaten');
      expect(lastStepLabel(quick, 'levels')).toBe('besser nach 3 Tagen');
      expect(lastStepLabel(lastStep(gradedEvents(series([['2026-10-04', 3], ['2026-10-04', 3]]))), 'grades')).toBe('0 am selben Tag');
      expect(lastStepLabel(null, 'grades')).toBe('–');
    });
  });

  describe('Mindestdaten, Unsicherheit, veraltete Daten', () => {
    it('ohne Bewertung im Zeitraum: keine Aussage', () => {
      const result = summary([], developmentPeriod('season', TODAY));
      expect(result.state).toBe('none');
      expect(result.hints[0]).toContain('keine benotete Bewertung');
    });

    it('weniger als 4 Bewertungen: zu wenig Daten, auch über lange Zeit', () => {
      const result = summary(series([['2026-01-05', 4], ['2026-05-05', 3], ['2026-10-05', 1]]));
      expect(result.state).toBe('insufficient');
      expect(result.hints.join(' ')).toContain('mindestens 4 Bewertungen');
    });

    it('kleiner Unterschied unter einer halben Note: stabil – nicht sicher unterscheidbar', () => {
      // 2,7 → 2,3 (Unterschied 0,33), Streuung klein → Unsicherheit = Mindestwert 0,5.
      const result = summary(series([['2026-08-03', 3], ['2026-08-10', 2.5], ['2026-08-17', 2.5], ['2026-09-28', 2.5], ['2026-10-05', 2], ['2026-10-12', 2.5]]));
      expect(result.state).toBe('stable');
      expect(result.label).toBe('stabil');
      expect(result.uncertainty).toBe(0.5);
      expect(result.detail).toContain('nicht sicher unterscheidbar');
    });

    it('großer Unterschied, aber stark streuende Bewertungen: stabil (Unsicherheit aus Wiederholungen geschätzt)', () => {
      // Anfang 1, 5, 1 (Schnitt 2,33, Varianz 5,33), Ende 1, 1, 1 → Unterschied 1,33; 2 × √(5,33/3) = 2,67.
      const result = summary(series([['2026-08-03', 1], ['2026-08-10', 5], ['2026-08-17', 1], ['2026-09-28', 1], ['2026-10-05', 1], ['2026-10-12', 1]]));
      expect(result.change).toBe(1.3);
      expect(result.uncertainty).toBe(2.7);
      expect(result.state).toBe('stable');
    });

    it('verschlechtert sich deutlich: schlechter mit Betrag', () => {
      const result = summary(series([['2026-08-03', 2], ['2026-08-10', 2], ['2026-10-05', 3.5], ['2026-10-12', 3.5]]));
      expect(result.state).toBe('worse');
      expect(result.label).toBe('schlechter (−1,5)');
      expect(result.baseline).toBe(2);
      expect(result.current).toBe(3.5);
    });

    it('letzte Bewertung länger als 6 Wochen her: keine aktuellen Daten statt „besser“', () => {
      const result = summary(series([['2026-05-04', 4], ['2026-05-11', 4], ['2026-06-29', 2], ['2026-07-06', 2]]));
      expect(result.state).toBe('stale');
      expect(result.label).toBe('keine aktuellen Daten');
      expect(result.detail.startsWith('Bis 06.07.2026:')).toBe(true);
      expect(result.hints.join(' ')).toContain('zur aktuellen Entwicklung gibt es keine Daten');
    });

    it('Anzahl und Dichte der Bewertungen stehen in den Hinweisen', () => {
      const result = summary(series([['2026-08-24', 3], ['2026-08-31', 3], ['2026-10-05', 2], ['2026-10-12', 2]]));
      expect(result.hints[0]).toBe('4 Bewertungen über 7 Wochen (24.08.2026 – 12.10.2026), im Schnitt alle 16 Tage.');
    });

    it('Kompetenzstufen: Richtung ohne scheinbar genaue Zahl', () => {
      const levels = { scale: 'levels' as const };
      const result = summary(series([['2026-08-24', 4.5, levels], ['2026-08-31', 4.5, levels], ['2026-10-05', 1.5, levels], ['2026-10-12', 1.5, levels]]));
      expect(result.scale).toBe('levels');
      expect(result.label).toBe('besser');
      expect(result.detail).toContain('Ausgangswert „lernt es noch“ → zuletzt „kann es sicher“');
    });
  });

  describe('Skalenwechsel', () => {
    const items = series([
      ['2026-07-06', 5],
      ['2026-07-13', 5],
      ['2026-07-20', 5],
      ['2026-08-03', 3, { scale: 'levels' }],
      ['2026-08-10', 3, { scale: 'levels' }],
      ['2026-10-05', 3, { scale: 'levels' }],
      ['2026-10-12', 3, { scale: 'levels' }],
    ]);

    it('vergleicht nur ab dem letzten Wechsel und nennt die früheren Bewertungen', () => {
      const result = summary(items);
      expect(result.scaleChangedAt).toBe('2026-08-03');
      expect(result.count).toBe(4);
      // Schulnote 5 gegen Stufe „kann es“ (3) wäre „besser“ – verglichen wird aber nur „kann es“ mit „kann es“.
      expect(result.state).toBe('stable');
      expect(result.hints.join(' ')).toContain('Bewertungsskala am 03.08.2026 gewechselt (vorher Schulnoten): 3 frühere Bewertungen werden nicht mit den neuen verglichen.');
    });

    it('Diagramm unterbricht die Linie und markiert den Wechsel', () => {
      const chart = trendChart(gradedEvents(items));
      expect(chart.markers).toHaveLength(1);
      expect(chart.markers[0].label).toBe('Skala gewechselt');
      expect(chart.markers[0].x).toBeGreaterThan(chart.points[2].x);
      expect(chart.markers[0].x).toBeLessThan(chart.points[3].x);
      // Drei Linienstücke: Schulnoten | Stufen bis 10.08. | (Lücke 8 Wochen, gestrichelt) Stufen ab 05.10.
      expect(chart.path.match(/M /g)).toHaveLength(3);
      expect(chart.gaps).toHaveLength(1);
    });

    it('„Letzte Änderung“ über einen Skalenwechsel hinweg ist kein Vergleich', () => {
      expect(lastStepLabel(lastStep(gradedEvents(items.slice(2, 4))), 'levels')).toBe('Skala gewechselt');
    });
  });

  describe('Zeitachse im Diagramm', () => {
    it('gleiche Kalenderabstände ergeben gleiche X-Abstände', () => {
      const chart = trendChart(gradedEvents(series([['2026-10-01', 3], ['2026-10-08', 2], ['2026-10-15', 2], ['2026-11-12', 1]])));
      const [a, b, c, d] = chart.points.map((point) => point.x);
      expect(chart.timeScaled).toBe(true);
      expect(b - a).toBeCloseTo(c - b, 6);
      // 28 Tage sind viermal so breit wie 7 Tage.
      expect(d - c).toBeCloseTo(4 * (b - a), 6);
    });

    it('die Achse reicht über den ganzen Beobachtungszeitraum', () => {
      const period = { from: '2026-07-01', to: '2026-10-20' };
      const chart = trendChart(gradedEvents(series([['2026-06-20', 6], ['2026-07-01', 3], ['2026-10-20', 2]])), 'grades', period);
      // Die Bewertung vor dem Zeitraum fällt weg; Beginn ganz links (54), Ende ganz rechts (760 − 24).
      expect(chart.points.map((point) => point.x)).toEqual([54, 736]);
      expect(chart.from).toBe('2026-07-01');
      expect(chart.to).toBe('2026-10-20');
      expect(chart.ticks.map((tick) => tick.label)).toEqual(['Jul 26', 'Aug', 'Sep', 'Okt']);
    });

    it('kurzer Zeitraum: Achse alle 14 Tage', () => {
      const period = developmentPeriod('12w', TODAY);
      const chart = trendChart(gradedEvents(series([['2026-10-01', 3]])), 'grades', period);
      expect(chart.ticks[0].label).toBe('29.07.');
      expect(chart.ticks).toHaveLength(6);
    });

    it('sehr kurzer Zeitraum: Anfang und Ende beschriftet; dichte Werte überlappen nicht', () => {
      const chart = trendChart(gradedEvents(series([['2026-10-10', 2.6], ['2026-10-11', 2.6], ['2026-10-13', 2.6]])));
      expect(chart.ticks.map((tick) => tick.label)).toEqual(['10.10.', '13.10.']);
      // Abstand 1 Tag von 3 = 227 Einheiten: alle beschriftet; dichter als 44 Einheiten nur der letzte.
      expect(chart.points.map((point) => point.showValue)).toEqual([true, true, true]);
      const dense = trendChart(gradedEvents(series([['2026-10-10', 2.6], ['2026-10-13', 2.6]])), 'grades', { from: '2026-07-01', to: '2026-11-23' });
      expect(dense.points.map((point) => point.showValue)).toEqual([false, true]);
    });

    it('Lücken über 6 Wochen werden gestrichelt statt durchgezogen', () => {
      const chart = trendChart(gradedEvents(series([['2026-05-01', 3], ['2026-05-08', 3], ['2026-09-01', 2], ['2026-09-08', 2]])));
      expect(chart.gaps).toHaveLength(1);
      expect(chart.gaps[0].x1).toBe(chart.points[1].x);
      expect(chart.path.match(/M /g)).toHaveLength(2);
    });

    it('ohne Datum bleiben die Punkte gleichmäßig verteilt (wie bisher)', () => {
      const chart = plotChart([
        { grade: 2, label: 'a', title: 'a' },
        { grade: 3, label: 'b', title: 'b' },
        { grade: 4, label: 'c', title: 'c' },
      ]);
      expect(chart.timeScaled).toBe(false);
      expect(chart.points.map((point) => point.x)).toEqual([54, 395, 736]);
      expect(chart.ticks.map((tick) => tick.label)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Zeiträume', () => {
    it('12 Wochen, Saison, 12 Monate und alles', () => {
      expect(developmentPeriod('12w', TODAY)).toMatchObject({ from: '2026-07-29', to: TODAY });
      expect(developmentPeriod('season', TODAY)).toMatchObject({ from: '2026-07-01', to: TODAY, label: 'Saison seit 01.07.2026' });
      expect(developmentPeriod('12m', TODAY)).toMatchObject({ from: '2025-10-21', to: TODAY });
      expect(developmentPeriod('all', TODAY, gradedEvents(series([['2025-03-01', 2]])))).toMatchObject({ from: '2025-03-01' });
      expect(spanText(1)).toBe('1 Tag');
      expect(spanText(13)).toBe('13 Tage');
      expect(spanText(119)).toBe('17 Wochen');
      expect(spanText(365)).toBe('12 Monate');
    });
  });

  describe('Profil und Berichte nutzen dieselbe Rechnung', () => {
    const items = series([
      ['2026-06-01', 6],
      ['2026-08-24', 3],
      ['2026-08-31', 3],
      ['2026-10-05', 2],
      ['2026-10-12', 2],
    ]);
    const player = { id: 'p1', name: 'Max', positions: ['ST'], number: 9, birthdate: '2012-02-05', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'granted', consentDate: '' } as Player;
    const expected = developmentSummary(gradedEvents(items), developmentPeriod('season', TODAY), TODAY);

    it('Profilkennzahl = Saison-Entwicklung (die Juni-Bewertung zählt nicht mit)', () => {
      expect(expected.label).toBe('besser (+1,0)');
      expect(expected.count).toBe(4);
      expect(profileFigures(items, TODAY).development).toEqual(expected);
    });

    it('Spielerbericht zeigt dasselbe Ergebnis mit Zeitraum und Hinweisen', () => {
      const html = profileReportHtml({ teamName: 'U14', player, items, absences: [], today: TODAY });
      expect(html).toContain('Entwicklung (Saison seit 01.07.2026)');
      expect(html).toContain('besser (+1,0)');
      expect(html).toContain('4 Bewertungen über 7 Wochen');
    });

    it('Saisonbericht: gleiche Rechnung; zu wenig Daten heißt nicht „verbessert“', () => {
      const report = (from: string) =>
        buildSeasonReport({
          teamName: 'U14',
          teamLabel: 'U14',
          player,
          items,
          plans: [],
          absences: [],
          paths: [],
          progress: {},
          scale: 'grades',
          comment: '',
          includeHealth: false,
          from,
          to: TODAY,
          today: TODAY,
        });
      const season = report('2026-07-01');
      expect(season.development).toEqual(developmentSummary(gradedEvents(items), { key: 'custom', from: '2026-07-01', to: TODAY, label: 'Berichtszeitraum' }, TODAY));
      expect(seasonReportsHtml([season])).toContain('Entwicklung im Zeitraum: besser (+1,0)');
      // Nur Oktober: zwei Bewertungen eine Woche auseinander.
      const october = seasonReportsHtml([report('2026-10-01')]);
      expect(october).toContain('Entwicklung im Zeitraum: zu wenig Daten');
      expect(october).not.toContain('verbessert');
    });
  });
});
