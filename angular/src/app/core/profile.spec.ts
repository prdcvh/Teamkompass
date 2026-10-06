import { type TeamEvent } from './event';
import {
  availability,
  averageGrade,
  evaluationsFor,
  gameStats,
  gradeToPercent,
  gradedEvaluations,
  historyRows,
  insightCards,
  skillAverages,
  trendChart,
  trendPoints,
} from './profile';
import { type Rating, BLANK_RATING } from './rating';

const TODAY = '2026-10-10';

function event(id: string, date: string, overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id,
    type: 'Training',
    title: `Event ${id}`,
    date,
    intensity: 2,
    location: '',
    trainingFocus: '',
    opponent: '',
    goalsFor: null,
    goalsAgainst: null,
    matchDuration: null,
    notes: '',
    ...overrides,
  };
}

function game(id: string, date: string, overrides: Partial<TeamEvent> = {}): TeamEvent {
  return event(id, date, { type: 'Spiel', matchDuration: 90, ...overrides });
}

function rating(overrides: Partial<Rating> = {}): Rating {
  return { ...BLANK_RATING, ...overrides };
}

const graded = (grade: number, overrides: Partial<Rating> = {}) =>
  rating({ attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade, ...overrides });

describe('Profil: Verlauf, Schnitt und Kompetenzprofil', () => {
  const events = [
    event('e3', '2026-10-07', { notes: 'Event-Notiz' }),
    game('e1', '2026-10-01', { goalsFor: 3, goalsAgainst: 1, intensity: 3 }),
    event('e2', '2026-10-04'),
    event('e4', '2026-10-08'),
  ];
  const ratings = new Map<string, Rating>([
    ['e1', graded(2, { note: 'Starkes Spiel' })],
    ['e2', graded(4)],
    ['e3', graded(3)],
    ['e4', rating({ attendance: 'absent' })],
  ]);
  const evaluations = evaluationsFor(events, ratings);

  it('nimmt nur benotete Events und sortiert sie älteste zuerst', () => {
    const result = gradedEvaluations(evaluations);
    expect(result.map((item) => item.event.id)).toEqual(['e1', 'e2', 'e3']);
    expect(trendPoints(result)).toEqual([
      { label: '10-01', grade: 2 },
      { label: '10-04', grade: 4 },
      { label: '10-07', grade: 3 },
    ]);
  });

  it('lässt Events ohne Bewertungsdokument und unvollständige Noten aus', () => {
    const result = gradedEvaluations(
      evaluationsFor([event('a', '2026-10-01'), event('b', '2026-10-02')], new Map([['b', rating({ attendance: 'present', effort: 2 })]])),
    );
    expect(result).toEqual([]);
  });

  it('berechnet Notenschnitt, Kompetenzprofil und Balkenlänge', () => {
    const result = gradedEvaluations(evaluations);
    expect(averageGrade(result)).toBe(3);
    expect(averageGrade([])).toBeNull();
    expect(skillAverages(result).map((item) => [item.label, item.value])).toEqual([
      ['Einsatz', 3],
      ['Fehlerquote', 3],
      ['Entscheidungsfindung', 3],
      ['Lernfähigkeit', 3],
    ]);
    expect(skillAverages([]).every((item) => item.value === null)).toBe(true);
    expect([gradeToPercent(1), gradeToPercent(3.5), gradeToPercent(6), gradeToPercent(null)]).toEqual([100, 50, 0, 0]);
  });

  it('zeigt die Historie neueste zuerst mit Rückmeldung vor Event-Notiz und Ergebnis nur für gespielte Spiele', () => {
    const rows = historyRows(gradedEvaluations(evaluations), TODAY);
    expect(rows.map((row) => row.eventId)).toEqual(['e3', 'e2', 'e1']);
    expect(rows[0]).toMatchObject({ note: 'Event-Notiz', date: '07.10.2026', grade: '3,0', intensity: '2 · mittel' });
    expect(rows[1].note).toBe('Keine Notiz');
    expect(rows[2]).toMatchObject({ note: 'Starkes Spiel', result: '3:1', intensity: '3 · hoch', type: 'Spiel' });
    // Ein Ergebnis in der Zukunft ist kein Ergebnis (vorab angelegtes Spiel).
    expect(historyRows(gradedEvaluations(evaluations), '2026-09-30')[2].result).toBe('');
  });
});

describe('Profil: Anwesenheit und Spielstatistik (SCRUM-20)', () => {
  // Wie der Test der Live-App: Zukunft, „Offen“ und fehlende Bewertungen zählen nicht.
  const events: TeamEvent[] = [];
  const map = new Map<string, Rating>();
  const add = (kind: 'T' | 'S', date: string, attendance: Rating['attendance'] | null, extra: Partial<Rating> = {}) => {
    const id = `e${events.length}`;
    events.push(kind === 'T' ? event(id, date) : game(id, date));
    if (attendance) map.set(id, rating({ attendance, ...extra }));
  };

  beforeAll(() => {
    add('T', '2026-10-07', 'present');
    add('T', '2026-10-08', 'present');
    add('T', '2026-10-09', 'absent');
    add('T', '2026-10-10', 'limited'); // heute zählt
    add('T', '2026-10-06', 'open'); // vergangen, aber noch nicht bewertet
    add('T', '2026-10-05', null); // vergangen, keine Bewertung angelegt
    for (let day = 11; day <= 20; day += 1) add('T', `2026-10-${day}`, 'open'); // im Voraus angelegt
    add('T', '2026-10-12', 'absent'); // zukünftige automatische Abwesenheit
    add('S', '2026-10-04', 'present', { minutes: 90 });
    add('S', '2026-10-03', 'excluded');
    add('S', '2026-10-02', 'present', { minutes: 45 });
    add('S', '2026-10-13', 'open'); // zukünftiges Spiel
    add('S', '2026-10-14', 'present', { minutes: 90 }); // fälschlich schon gesetztes Zukunftsspiel
  });

  it('zählt nur vergangene Events mit gesetzter Anwesenheit', () => {
    const rows = availability(evaluationsFor(events, map), TODAY);
    // Gezählt: 4 Trainings + 3 Spiele (inkl. Nicht im Kader) = 7 Events
    expect(rows.map((row) => [row.label, row.display])).toEqual([
      ['Anwesend', '4/7'],
      ['Teilweise', '1/7'],
      ['Fehlt', '1/7'],
      ['Nicht im Kader', '1/7'],
    ]);
    expect(rows[0].value).toBe(57);
  });

  it('zählt Spiele ohne „Nicht im Kader“ und ohne Zukunft', () => {
    const stats = gameStats(evaluationsFor(events, map), TODAY);
    expect(stats.games).toBe(2);
    expect(stats.possibleMinutes).toBe(180);
    expect(stats.minutes).toBe(135);
    expect(stats.appearances).toBe(2);
    expect(stats.appearanceRate).toBe(75);
    expect(stats.minutesPerGame).toBe(68);
  });

  it('verändert sich nicht, wenn weitere Zukunftsevents angelegt werden', () => {
    const before = JSON.stringify([availability(evaluationsFor(events, map), TODAY), gameStats(evaluationsFor(events, map), TODAY)]);
    const more = [...events, event('far1', '2026-12-01'), game('far2', '2026-12-02')];
    const moreRatings = new Map(map).set('far1', rating({ attendance: 'open' })).set('far2', rating({ attendance: 'present', minutes: 90 }));
    expect(JSON.stringify([availability(evaluationsFor(more, moreRatings), TODAY), gameStats(evaluationsFor(more, moreRatings), TODAY)])).toBe(before);
  });

  it('ohne zählende Events: keine Division durch null', () => {
    const rows = availability([], TODAY);
    expect(rows.map((row) => row.display)).toEqual(['0/1', '0/1', '0/1', '0/1']);
    const stats = gameStats([], TODAY);
    expect(stats).toMatchObject({ games: 0, appearanceRate: 0, scorersPerGame: null, minutesPerScorer: null, minutesPerGame: 0 });
  });

  it('wertet Tore, Vorlagen und Scorer-Kennzahlen aus', () => {
    const list = [game('g1', '2026-10-01'), game('g2', '2026-10-02')];
    const stats = gameStats(
      evaluationsFor(
        list,
        new Map([
          ['g1', rating({ attendance: 'present', minutes: 90, goals: 2, assists: 1 })],
          ['g2', rating({ attendance: 'limited', minutes: 30, goals: 0, assists: 1 })],
        ]),
      ),
      TODAY,
    );
    expect(stats).toMatchObject({ goals: 2, assists: 2, scorers: 4, scorersPerGame: 2, minutesPerGame: 60, minutesPerScorer: 30 });
  });
});

describe('Profil: Kennzahlen-Karten', () => {
  it('zeigt Platzhalter, solange nichts bewertet ist', () => {
    const cards = insightCards([], TODAY);
    const value = (label: string) => cards.find((card) => card.label === label)?.value;
    expect(cards).toHaveLength(14);
    expect(value('Notenschnitt')).toBe('–');
    expect(value('Trend')).toBe('–');
    expect(value('Einsatzquote')).toBe('0 %');
    expect(value('Bestes Event')).toBe('–');
  });

  it('berechnet Schnitte, Trend und Entwicklung als Verbesserung (positiv = bessere Note)', () => {
    const list = [event('t1', '2026-10-01'), game('s1', '2026-10-03', { intensity: 3 }), event('t2', '2026-10-05', { intensity: 1 })];
    const cards = insightCards(
      evaluationsFor(
        list,
        new Map([
          ['t1', graded(4)],
          ['s1', graded(3, { minutes: 80, goals: 1 })],
          ['t2', graded(2)],
        ]),
      ),
      TODAY,
    );
    const value = (label: string) => cards.find((card) => card.label === label)?.value;
    expect(value('Notenschnitt')).toBe('3,0');
    expect(value('Spiel-Schnitt')).toBe('3,0');
    expect(value('Training-Schnitt')).toBe('3,0');
    expect(value('Bewertete Events')).toBe('3');
    expect(value('Teilnahmen')).toBe('3');
    expect(value('Trend')).toBe('+1,0');
    expect(value('Entwicklung Saison')).toBe('+2,0');
    expect(value('Ø Intensität zuletzt')).toBe('2,0');
    expect(value('Bestes Event')).toBe('2,0 · Training');
    expect(value('Tore + Vorlagen')).toBe('1 + 0');
  });

  it('zeigt eine Verschlechterung mit Minuszeichen', () => {
    const list = [event('t1', '2026-10-01'), event('t2', '2026-10-05')];
    const cards = insightCards(evaluationsFor(list, new Map([['t1', graded(2)], ['t2', graded(5)]])), TODAY);
    expect(cards.find((card) => card.label === 'Trend')?.value).toBe('−3,0');
  });
});

describe('Profil: Verlaufsdiagramm', () => {
  it('setzt die beste Note nach oben und verteilt die Punkte gleichmäßig', () => {
    const chart = trendChart([
      { label: '10-01', grade: 1 },
      { label: '10-04', grade: 6 },
      { label: '10-07', grade: 3.5 },
    ]);
    expect(chart.grid.map((line) => line.label)).toEqual(['1', '2', '3', '4', '5', '6']);
    const [first, second, third] = chart.points;
    expect(first.y).toBe(chart.grid[0].y);
    expect(second.y).toBe(chart.grid[5].y);
    expect(third.y).toBeGreaterThan(first.y);
    expect(third.y).toBeLessThan(second.y);
    expect(second.x - first.x).toBeCloseTo(third.x - second.x, 0);
    expect(chart.line.startsWith(`M${first.x} ${first.y} L`)).toBe(true);
  });

  it('zeichnet einen einzelnen Punkt in die Mitte ohne Linie und lässt ohne Punkte alles leer', () => {
    const single = trendChart([{ label: '10-01', grade: 2 }], 600, 240);
    expect(single.points[0].x).toBe(307);
    expect(single.line).toBe('');
    const none = trendChart([]);
    expect(none.points).toEqual([]);
    expect(none.line).toBe('');
  });

  it('beschriftet bei vielen Punkten nur jeden n-ten und immer den letzten', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ label: `L${index}`, grade: 3 }));
    const chart = trendChart(many);
    const labelled = chart.points.filter((point) => point.showLabel).map((point) => point.label);
    expect(labelled.length).toBeLessThanOrEqual(8);
    expect(labelled[0]).toBe('L0');
    expect(labelled.at(-1)).toBe('L19');
  });
});
