import { type TeamEvent } from '../events/event';
import {
  birthQuarterCounts,
  eventTeamGrade,
  positionCoverage,
  teamStats,
  teamTrend,
  thinPositions,
  trainingFocusCounts,
} from './analysis';
import type { Player } from '../player/player';
import { type Rating, BLANK_RATING } from '../ratings/rating';

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
  exertion: 5,
  location: '',
  trainingFocus: 'Eigener Ballbesitz',
  opponent: '',
  goalsFor: null,
  goalsAgainst: null,
  matchDuration: null,
  startTime: null,
  durationMinutes: null,
  locationCoords: null,
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
  injuredSince: '',
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
      event('e1', { type: 'Spiel', date: '2026-10-01', goalsFor: 3, goalsAgainst: 1, exertion: 7 }),
      event('e2', { type: 'Spiel', date: '2099-01-01', goalsFor: 0, goalsAgainst: 0, exertion: 3 }),
      event('e3', { date: '2026-10-02', exertion: 5 }),
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
    expect(stats.avgIntensity).toBe(6); // e1: 7, e3: 5; das kommende e2 zählt nicht
  });

  it('Kennzahlen: kommende Events (vorbelegtes „Fehlt“, Intensität, Noten) ändern nichts', () => {
    const past = [
      event('p1', { date: '2026-10-01', exertion: 4 }),
      event('p2', { type: 'Spiel', date: '2026-10-03', exertion: 6, goalsFor: 2, goalsAgainst: 2 }),
    ];
    const pastRatings = {
      p1: { a: rating(2), b: rating(3, { attendance: 'absent' }) },
      p2: { a: rating(3, { attendance: 'limited' }), b: rating(2) },
    };
    const before = teamStats(past, ratings(pastRatings), '2026-10-05');
    expect(before).toMatchObject({ avgIntensity: 5, attendanceRate: 75, avgGrade: 2.3 }); // Noten: p1 2, p2 2,5

    const future = [
      event('f1', { date: '2026-10-06', exertion: 10 }),
      event('f2', { type: 'Spiel', date: '2026-12-24', exertion: 1 }),
    ];
    const withFuture = ratings({
      ...pastRatings,
      // Verletzter Spieler: „Fehlt“ automatisch für kommende Termine vorbelegt; dazu eine (versehentliche) Note.
      f1: { a: rating(6, { attendance: 'absent' }), b: rating(6, { attendance: 'absent' }) },
      f2: { a: rating(1, { attendance: 'absent' }), b: rating(5) },
    });
    const after = teamStats([...past, ...future], withFuture, '2026-10-05');
    expect(after.avgIntensity).toBe(before.avgIntensity);
    expect(after.attendanceRate).toBe(before.attendanceRate);
    expect(after.avgGrade).toBe(before.avgGrade);
    expect(after.record).toEqual(before.record);
  });

  it('Kennzahlen: ein Event von heute zählt mit, eines von morgen nicht', () => {
    const events = [event('heute', { date: '2026-10-05', exertion: 8 }), event('morgen', { date: '2026-10-06', exertion: 2 })];
    const byEvent = ratings({ heute: { a: rating(2) }, morgen: { a: rating(2, { attendance: 'absent' }) } });
    const stats = teamStats(events, byEvent, '2026-10-05');
    expect(stats.avgIntensity).toBe(8);
    expect(stats.attendanceRate).toBe(100);
    // Am nächsten Tag zählt das Event von gestern („morgen“) mit.
    expect(teamStats(events, byEvent, '2026-10-06')).toMatchObject({ avgIntensity: 5, attendanceRate: 50 });
  });

  it('Teilnahmequote: „Offen“ (noch nicht gesetzt) verwässert die Quote nicht', () => {
    const events = [event('e1', { date: '2026-10-01' })];
    const byEvent = ratings({ e1: { a: rating(2), b: { ...BLANK_RATING, attendance: 'open' } } });
    expect(teamStats(events, byEvent, '2026-10-05').attendanceRate).toBe(100);
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
    expect(trainingFocusCounts(events, '2026-10-01')).toEqual({ 'Eigener Ballbesitz': 2, 'Gegnerischer Ballbesitz': 0, Umschalten: 1 });
  });

  it('Trainingsfokus: vergangene und heutige Trainings zählen, kommende nicht (SCRUM-163)', () => {
    const events = [
      event('vorgestern', { date: '2026-09-29', trainingFocus: 'Umschalten' }),
      event('heute', { date: '2026-10-01', trainingFocus: '' }),
      event('morgen', { date: '2026-10-02' }),
      event('spiel-vergangen', { type: 'Spiel', date: '2026-09-28', trainingFocus: '' }),
    ];
    expect(trainingFocusCounts(events, '2026-10-01')).toEqual({ 'Eigener Ballbesitz': 1, 'Gegnerischer Ballbesitz': 0, Umschalten: 1 });
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
