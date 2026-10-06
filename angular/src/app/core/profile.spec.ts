import { type TeamEvent } from './event';
import {
  type EventRating,
  attendanceCount,
  availability,
  countsForStats,
  gameStats,
  gradeToPercent,
  gradedEvents,
  numberLabel,
  profileFigures,
  skillAverages,
  trendChart,
} from './profile';
import { BLANK_RATING, type Rating } from './rating';

describe('profile (Auswertungen)', () => {
  const TODAY = '2026-10-10';
  const event = (id: string, date: string, overrides: Partial<TeamEvent> = {}): TeamEvent => ({
    id, type: 'Training', title: `Event ${id}`, date, intensity: 2, location: '', trainingFocus: 'Umschalten', opponent: '',
    goalsFor: null, goalsAgainst: null, matchDuration: null, notes: '', ...overrides,
  });
  const game = (id: string, date: string, duration = 90) => event(id, date, { type: 'Spiel', matchDuration: duration, trainingFocus: '' });
  const rated = (grade: number, overrides: Partial<Rating> = {}): Rating => ({
    ...BLANK_RATING, attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...overrides,
  });
  const att = (attendance: Rating['attendance'], overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, attendance, ...overrides });

  describe('gradedEvents / Schnitt', () => {
    it('nimmt nur benotete Events, älteste zuerst; „Fehlt“, „Nicht im Kader“ und offene Teilnoten zählen nicht', () => {
      const items: EventRating[] = [
        { event: event('b', '2026-10-05'), rating: rated(2) },
        { event: event('a', '2026-10-01'), rating: rated(3) },
        { event: event('c', '2026-10-06'), rating: att('absent') },
        { event: event('d', '2026-10-07'), rating: att('excluded') },
        { event: event('e', '2026-10-08'), rating: { ...rated(2), tactics: null } },
        { event: event('f', '2026-10-09'), rating: null },
      ];
      const graded = gradedEvents(items);
      expect(graded.map((entry) => entry.event.id)).toEqual(['a', 'b']);
      expect(profileFigures(items, TODAY).average).toBe(2.5);
    });

    it('rechnet Spiel- und Training-Schnitt getrennt', () => {
      const items: EventRating[] = [
        { event: event('t1', '2026-10-01'), rating: rated(3) },
        { event: event('t2', '2026-10-02'), rating: rated(2) },
        { event: game('g1', '2026-10-03'), rating: rated(1) },
      ];
      const figures = profileFigures(items, TODAY);
      expect(figures.trainingAverage).toBe(2.5);
      expect(figures.gameAverage).toBe(1);
      expect(figures.ratedEvents).toBe(3);
      expect(figures.average).toBe(2);
    });

    it('ohne Bewertungen sind alle Werte leer', () => {
      const figures = profileFigures([], TODAY);
      expect(figures).toMatchObject({ average: null, trend: null, development: null, best: null, ratedEvents: 0, recentIntensity: null });
      expect(figures.games).toMatchObject({ games: 0, appearanceRate: 0, scorersPerGame: null, minutesPerScorer: null });
    });
  });

  describe('Trend, Entwicklung, Bestes Event', () => {
    const items: EventRating[] = [
      { event: event('a', '2026-10-01', { intensity: 1 }), rating: rated(4) },
      { event: event('b', '2026-10-02', { intensity: 3 }), rating: rated(3) },
      { event: event('c', '2026-10-03', { intensity: 3 }), rating: rated(2) },
      { event: game('d', '2026-10-04'), rating: rated(1) },
    ];

    it('Trend = vorletzte minus letzte Note (positiv = besser), Entwicklung = erste minus letzte', () => {
      const figures = profileFigures(items, TODAY);
      expect(figures.trend).toBe(1);
      expect(figures.development).toBe(3);
      expect(figures.best?.event.id).toBe('d');
      expect(figures.recentIntensity).toBe(2.7);
    });

    it('Trend und Entwicklung brauchen mindestens zwei benotete Events', () => {
      const one = profileFigures([items[0]], TODAY);
      expect(one.trend).toBeNull();
      expect(one.development).toBeNull();
    });

    it('formatiert mit Komma und Vorzeichen', () => {
      expect(numberLabel(2.3)).toBe('2,3');
      expect(numberLabel(1.5, { signed: true })).toBe('+1,5');
      expect(numberLabel(-0.5, { signed: true })).toBe('-0,5');
      expect(numberLabel(0, { signed: true })).toBe('0');
      expect(numberLabel(null)).toBe('–');
    });
  });

  describe('Kompetenzprofil', () => {
    it('Schnitt je Teilnote, leere Teilnoten werden übersprungen', () => {
      const items: EventRating[] = [
        { event: event('a', '2026-10-01'), rating: { ...rated(2), effort: 1, technique: 2, tactics: 3, comprehension: 4 } },
        { event: event('b', '2026-10-02'), rating: { ...rated(2), effort: 3, technique: 4, tactics: 3, comprehension: 4 } },
      ];
      const skills = skillAverages(gradedEvents(items));
      expect(skills.map((skill) => [skill.label, skill.value])).toEqual([
        ['Einsatz', 2], ['Fehlerquote', 3], ['Entscheidungsfindung', 3], ['Lernfähigkeit', 4],
      ]);
      expect(skillAverages([]).every((skill) => skill.value === null)).toBe(true);
    });

    it('Balkenbreite: Note 1 = 100 %, Note 6 = 0 %', () => {
      expect(gradeToPercent(1)).toBe(100);
      expect(gradeToPercent(3.5)).toBe(50);
      expect(gradeToPercent(6)).toBe(0);
      expect(gradeToPercent(null)).toBe(0);
      expect(gradeToPercent(9)).toBe(0);
    });
  });

  describe('Verfügbarkeit (SCRUM-20: keine Zukunft, kein „Offen“)', () => {
    const items: EventRating[] = [
      { event: event('p1', '2026-10-01'), rating: att('present') },
      { event: event('p2', '2026-10-02'), rating: att('present') },
      { event: event('l1', '2026-10-03'), rating: att('limited') },
      { event: event('a1', '2026-10-04'), rating: att('absent') },
      { event: event('open', '2026-10-05'), rating: att('open') },
      { event: event('none', '2026-10-06'), rating: null },
      { event: event('future', '2026-10-20'), rating: att('absent') },
      { event: event('today', TODAY), rating: att('present') },
    ];

    it('zählt weder zukünftige noch offene noch unbewertete Events', () => {
      expect(availability(items, TODAY)).toEqual([
        { label: 'Anwesend', percent: 60, display: '3/5' },
        { label: 'Teilweise', percent: 20, display: '1/5' },
        { label: 'Fehlt', percent: 20, display: '1/5' },
        { label: 'Nicht im Kader', percent: 0, display: '0/5' },
      ]);
    });

    it('ohne zählende Events keine Division durch null', () => {
      expect(availability([], TODAY).map((row) => row.display)).toEqual(['0/1', '0/1', '0/1', '0/1']);
    });

    it('countsForStats: Datum heute zählt, Zukunft und „Offen“ nicht', () => {
      expect(countsForStats(event('x', TODAY), att('present'), TODAY)).toBe(true);
      expect(countsForStats(event('x', '2026-10-11'), att('present'), TODAY)).toBe(false);
      expect(countsForStats(event('x', '2026-10-01'), att('open'), TODAY)).toBe(false);
      expect(countsForStats(event('x', '2026-10-01'), null, TODAY)).toBe(false);
      expect(countsForStats(event('x', ''), att('present'), TODAY)).toBe(false);
    });

    it('Teilnahmen zählen „Anwesend“ und „Teilweise“ ohne Datumsgrenze', () => {
      expect(attendanceCount(items)).toBe(4); // p1, p2, l1, today
    });
  });

  describe('Spielstatistik', () => {
    const items: EventRating[] = [
      { event: game('g1', '2026-10-01', 90), rating: att('present', { minutes: 90, goals: 2, assists: 1 }) },
      { event: game('g2', '2026-10-02', 80), rating: att('limited', { minutes: 30, goals: 0, assists: 1 }) },
      { event: game('g3', '2026-10-03', 90), rating: att('absent') },
      { event: game('g4', '2026-10-04', 90), rating: att('excluded') },
      { event: game('g5', '2026-10-05', 90), rating: att('open') },
      { event: game('g6', '2026-12-01', 90), rating: att('present', { minutes: 90, goals: 5 }) },
      { event: event('t1', '2026-10-06'), rating: att('present', { minutes: 60, goals: 9 }) },
    ];

    it('zählt nur vergangene Spiele mit gesetzter Anwesenheit; „Nicht im Kader“ zählt nicht, „Fehlt“ nur als mögliche Zeit', () => {
      const stats = gameStats(items, TODAY);
      expect(stats.games).toBe(3); // g1, g2, g3
      expect(stats.appearances).toBe(2);
      expect(stats.minutes).toBe(120);
      expect(stats.possibleMinutes).toBe(260); // 90 + 80 + 90
      expect(stats.goals).toBe(2);
      expect(stats.assists).toBe(2);
      expect(stats.appearanceRate).toBe(46); // 120 / 260
      expect(stats.scorersPerGame).toBe(2); // 4 Scorerpunkte / 2 Einsätze
      expect(stats.minutesPerGame).toBe(60);
      expect(stats.minutesPerScorer).toBe(30);
    });

    it('Einsatz zählt auch mit Minuten ohne gesetzte Anwesenheitsart „Anwesend“', () => {
      const only: EventRating[] = [{ event: game('g', '2026-10-01'), rating: att('limited', { minutes: 0 }) }];
      expect(gameStats(only, TODAY).appearances).toBe(1);
    });

    it('Spiele ohne Daten geben leere Quoten statt NaN', () => {
      expect(gameStats([], TODAY)).toMatchObject({ games: 0, appearanceRate: 0, scorersPerGame: null, minutesPerGame: 0, minutesPerScorer: null });
    });
  });

  describe('Verlaufsdiagramm', () => {
    it('legt Note 1 oben und Note 6 unten und die ältesten Events links', () => {
      const items: EventRating[] = [
        { event: event('a', '2026-10-01'), rating: rated(1) },
        { event: event('b', '2026-10-02'), rating: rated(6) },
      ];
      const chart = trendChart(gradedEvents(items));
      expect(chart.grid.map((line) => line.grade)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(chart.points[0].y).toBeLessThan(chart.points[1].y);
      expect(chart.points[0].x).toBeLessThan(chart.points[1].x);
      expect(chart.points[0].label).toBe('10-01');
      expect(chart.path.startsWith('M ')).toBe(true);
      expect(chart.points[1].title).toContain('Note 6,0');
    });

    it('ein einzelner Punkt steht links, ohne Daten gibt es keinen Pfad', () => {
      const single = trendChart(gradedEvents([{ event: event('a', '2026-10-01'), rating: rated(2) }]));
      expect(single.points).toHaveLength(1);
      expect(single.points[0].x).toBe(54);
      expect(trendChart([]).path).toBe('');
    });
  });
});
