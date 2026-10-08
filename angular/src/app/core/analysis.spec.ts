import { type TeamEvent } from './event';
import {
  birthQuarterCounts,
  eventTeamGrade,
  positionCoverage,
  teamStats,
  teamTrend,
  thinPositions,
  trainingFocusCounts,
} from './analysis';
import { type Player } from './player';
import { type Rating, BLANK_RATING } from './rating';

const rating = (grade: number, extra: Partial<Rating> = {}): Rating => ({
  ...BLANK_RATING,
  attendance: 'present',
  effort: grade,
  technique: grade,
  tactics: grade,
  comprehension: grade,
  ...extra,
});

const event = (id: string, extra: Partial<TeamEvent> = {}): TeamEvent => ({
  id,
  type: 'Training',
  title: id,
  date: '2026-10-01',
  intensity: 2,
  location: '',
  trainingFocus: 'Eigener Ballbesitz',
  opponent: '',
  goalsFor: null,
  goalsAgainst: null,
  matchDuration: null,
  notes: '',
  ...extra,
});

const player = (id: string, birthdate: string, positions: string[]): Player => ({
  id,
  name: id,
  positions,
  number: 1,
  birthdate,
  status: 'Fit',
  injuryUntil: '',
  consentStatus: 'pending',
  consentDate: '',
});

const ratings = (entries: Record<string, Record<string, Rating>>) => new Map(Object.entries(entries).map(([id, byPlayer]) => [id, new Map(Object.entries(byPlayer))]));

describe('Teamanalyse', () => {
  it('Eventnote: Mittel der Gesamtnoten, „Fehlt“ und fehlende Teilnoten zählen nicht', () => {
    const map = new Map<string, Rating>([
      ['a', rating(2)],
      ['b', rating(3)],
      ['c', rating(1, { attendance: 'absent' })],
      ['d', { ...BLANK_RATING, attendance: 'present', effort: 1 }],
    ]);
    expect(eventTeamGrade(map)).toBe(2.5);
    expect(eventTeamGrade(new Map())).toBeNull();
    expect(eventTeamGrade(undefined)).toBeNull();
  });

  it('Kennzahlen: Bilanz ohne Zukunftsspiele, Teamnote, Teilnahmequote, Intensität', () => {
    const events = [
      event('e1', { type: 'Spiel', date: '2026-10-01', goalsFor: 3, goalsAgainst: 1, intensity: 3 }),
      event('e2', { type: 'Spiel', date: '2099-01-01', goalsFor: 0, goalsAgainst: 0, intensity: 1 }),
      event('e3', { date: '2026-10-02', intensity: 2 }),
    ];
    const byEvent = ratings({
      e1: { a: rating(2), b: rating(4, { attendance: 'limited' }), c: rating(1, { attendance: 'absent' }) },
      e3: { a: rating(2), x: { ...BLANK_RATING, attendance: 'excluded' } },
    });
    const stats = teamStats(events, byEvent, '2026-10-05');
    expect(stats.games).toBe(2);
    expect(stats.record).toEqual({ wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1 });
    expect(stats.avgGrade).toBe(2.5); // e1: 3, e3: 2 → Mittel 2,5
    expect(stats.attendanceRate).toBe(75); // present, limited, absent, present = 3 von 4; excluded zählt nicht
    expect(stats.avgIntensity).toBe(2);
  });

  it('Kennzahlen ohne Daten', () => {
    const stats = teamStats([], new Map(), '2026-10-05');
    expect(stats).toMatchObject({ games: 0, avgGrade: null, attendanceRate: 0, avgIntensity: null });
  });

  it('Geburtsquartale: Q1 = Januar–März, ungültige Daten fehlen', () => {
    const players = [
      player('a', '2012-01-15', []),
      player('b', '2012-03-31', []),
      player('c', '2012-04-01', []),
      player('d', '2012-12-24', []),
      player('e', '', []),
      player('f', 'kaputt', []),
    ];
    expect(birthQuarterCounts(players)).toEqual({ Q1: 2, Q2: 1, Q3: 0, Q4: 1 });
  });

  it('Positionsabdeckung: mehrere Positionen je Spieler, sortiert, Lücken', () => {
    const players = [player('a', '', ['IV', 'LV']), player('b', '', ['IV']), player('c', '', ['TW']), player('d', '', ['ST', 'IV'])];
    const coverage = positionCoverage(players);
    expect(coverage).toEqual([['IV', 3], ['LV', 1], ['ST', 1], ['TW', 1]]);
    expect(thinPositions(coverage)).toEqual(['LV', 'ST', 'TW']);
    expect(thinPositions(coverage, 2)).toEqual(['LV', 'ST']);
  });

  it('Trainingsfokus: nur Trainings, leere Angabe zählt als Eigener Ballbesitz', () => {
    const events = [
      event('a'),
      event('b', { trainingFocus: '' }),
      event('c', { trainingFocus: 'Umschalten' }),
      event('d', { type: 'Spiel', trainingFocus: '' }),
    ];
    expect(trainingFocusCounts(events)).toEqual({ 'Eigener Ballbesitz': 2, 'Gegnerischer Ballbesitz': 0, Umschalten: 1 });
  });

  it('Teamverlauf: nur Events mit Note, älteste zuerst, Typ bleibt erhalten', () => {
    const events = [event('spät', { date: '2026-10-09', type: 'Spiel' }), event('früh', { date: '2026-10-02' }), event('leer', { date: '2026-10-05' })];
    const chart = teamTrend(events, ratings({ spät: { a: rating(1) }, früh: { a: rating(3) } }));
    expect(chart.points.map((point) => point.label)).toEqual(['10-02', '10-09']);
    expect(chart.points.map((point) => point.kind)).toEqual(['Training', 'Spiel']);
    expect(chart.points[0].title).toContain('Ø Note 3');
    expect(chart.path.startsWith('M ')).toBe(true);
  });
});
