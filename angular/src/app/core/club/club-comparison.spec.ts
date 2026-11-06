import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import { type PlayerData, itemsFor } from '../team/team';
import {
  CLUB_COMPARISON_VERSION,
  type ClubComparisonEntry,
  type ComparisonPlayer,
  cohortComparison,
  comparisonFromDoc,
  comparisonFromTeam,
  comparisonKey,
  keyPlayers,
  mainFocus,
} from './club-comparison';

const event = (id: string, extra: Partial<TeamEvent> = {}): TeamEvent => ({
  id,
  type: 'Training',
  title: id,
  date: '2026-10-01',
  intensity: 2,
  exertion: 6,
  location: '',
  trainingFocus: 'Umschalten',
  opponent: '',
  goalsFor: null,
  goalsAgainst: null,
  matchDuration: null,
  startTime: null,
  durationMinutes: null,
  locationCoords: null,
  notes: '',
  ...extra,
}) as TeamEvent;

const rating = (grade: number | null, extra: Partial<Rating> = {}): Rating => ({
  ...BLANK_RATING,
  attendance: 'present',
  effort: grade,
  technique: grade,
  tactics: grade,
  comprehension: grade,
  ...extra,
});

const player = (id: string, name: string, birthdate: string, extra: Partial<Player> = {}): Player =>
  ({ id, name, number: 1, positions: ['ZM'], birthdate, status: 'Verletzt', injuryUntil: '2026-12-01', notes: 'privat', consentStatus: 'granted', ...extra }) as unknown as Player;

describe('Vereinsvergleich: Kurzfassung eines Teams (SCRUM-197)', () => {
  const events = [event('t1'), event('t2', { date: '2026-10-08', exertion: 4, trainingFocus: 'Eigener Ballbesitz' }), event('s1', { type: 'Spiel', date: '2026-10-05', trainingFocus: '' }), event('future', { date: '2027-01-01' })];
  const ratings = new Map([
    ['t1', new Map([['p1', rating(2)], ['p2', rating(null, { attendance: 'absent' })]])],
    ['t2', new Map([['p1', rating(3)], ['p2', rating(4)]])],
    ['s1', new Map([['p1', rating(2, { attendance: 'limited' })], ['p2', rating(null, { attendance: 'excluded' })]])],
  ]);
  const players = [player('p1', 'Ali', '2013-04-01'), player('p2', 'Bea', 'kein Datum')];
  const data: PlayerData[] = players.map((p) => ({ player: p, items: itemsFor(p.id, events, ratings), absences: [], measurements: [] }));

  it('rechnet dieselben Kennzahlen wie die Teamanalyse und enthält keine Gesundheitsdaten', () => {
    const summary = comparisonFromTeam('U13', data, events, ratings, '2026-11-06');
    expect(summary.version).toBe(CLUB_COMPARISON_VERSION);
    expect(summary.team).toEqual({
      playerCount: 2,
      attendanceRate: 80, // 4 von 5 gesetzten Anwesenheiten (ohne „Nicht im Kader“)
      avgExertion: 5.3,
      avgGrade: 2.5,
      trainings: 2,
      games: 1,
      focus: { 'Eigener Ballbesitz': 1, 'Gegnerischer Ballbesitz': 0, Umschalten: 1 },
    });
    expect(summary.players).toEqual([
      { id: 'p1', name: 'Ali', birthYear: 2013, average: 2.3, rated: 3, attendanceRate: 100 },
      { id: 'p2', name: 'Bea', birthYear: null, average: 4, rated: 1, attendanceRate: 50 },
    ]);
    const text = JSON.stringify(summary);
    for (const hidden of ['Verletzt', '2026-12-01', 'privat', 'granted', '2013-04-01']) expect(text).not.toContain(hidden);
  });

  it('ohne gesetzte Anwesenheit steht die Teilnahme auf „unbekannt“ statt 0 %', () => {
    const summary = comparisonFromTeam('U13', [], [], new Map(), '2026-11-06');
    expect(summary.team.attendanceRate).toBeNull();
    expect(summary.team.avgExertion).toBeNull();
    expect(mainFocus(summary.team)).toBeNull();
  });

  it('Dokument hin und zurück ergibt denselben Inhalt; anderes Format → null', () => {
    const summary = comparisonFromTeam('U13', data, events, ratings, '2026-11-06');
    const entry = comparisonFromDoc('A1', { ...summary, updatedAt: { toDate: () => new Date('2026-11-01T10:00:00Z') } });
    expect(entry?.teamId).toBe('A1');
    expect(entry?.updatedAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(comparisonKey(entry!)).toBe(comparisonKey(summary));
    expect(comparisonFromDoc('A1', { ...summary, version: 99 })).toBeNull();
    expect(comparisonFromDoc('A1', null)).toBeNull();
  });

  it('Schlüsselspieler: bester Schnitt zuerst, nur benotete Spieler, höchstens drei', () => {
    const list: ComparisonPlayer[] = [
      { id: 'a', name: 'A', birthYear: 2013, average: 2.5, rated: 4, attendanceRate: 90 },
      { id: 'b', name: 'B', birthYear: 2013, average: null, rated: 0, attendanceRate: 90 },
      { id: 'c', name: 'C', birthYear: 2013, average: 1.8, rated: 4, attendanceRate: 90 },
      { id: 'd', name: 'D', birthYear: 2012, average: 3, rated: 4, attendanceRate: 90 },
      { id: 'e', name: 'E', birthYear: 2012, average: 3.5, rated: 4, attendanceRate: 90 },
    ];
    expect(keyPlayers({ players: list }).map((p) => p.id)).toEqual(['c', 'a', 'd']);
  });

  it('Hauptfokus mit Anteil', () => {
    expect(mainFocus({ focus: { 'Eigener Ballbesitz': 1, 'Gegnerischer Ballbesitz': 3, Umschalten: 0 } })).toEqual({ name: 'Gegnerischer Ballbesitz', share: 75 });
  });
});

describe('Vereinsvergleich: Spieler im Jahrgang des Vereins (SCRUM-197)', () => {
  const p = (id: string, birthYear: number | null, average: number | null, attendanceRate: number | null): ComparisonPlayer => ({ id, name: id, birthYear, average, rated: average === null ? 0 : 3, attendanceRate });
  const entry = (teamId: string, players: ComparisonPlayer[]): ClubComparisonEntry => ({
    teamId,
    version: CLUB_COMPARISON_VERSION,
    teamName: teamId,
    team: { playerCount: players.length, attendanceRate: null, avgExertion: null, avgGrade: null, trainings: 0, games: 0, focus: {} },
    players,
    updatedAt: null,
  });

  it('vergleicht mit allen gleich alten Spielern aller Teams (ohne den Spieler selbst) als grobe Lage', () => {
    const entries = [
      entry('A1', [p('me', 2013, 2.0, 90), p('mate', 2013, 3.0, 70), p('older', 2012, 1.0, 100)]),
      entry('A2', [p('x', 2013, 2.5, 95), p('y', 2013, 1.5, 80), p('z', 2013, null, null)]),
    ];
    const result = cohortComparison('me', 'A1', entries);
    expect(result).toMatchObject({ birthYear: 2013, others: 4, otherTeamPlayers: 3, teams: 2 });
    // Note 2,0 gegen 3,0 / 2,5 / 1,5: besser als 2 von 3.
    expect(result?.grade).toEqual({ value: 2, cohortAverage: 2.3, betterThan: 67, band: 'oben', compared: 3 });
    // Teilnahme 90 % gegen 70 / 95 / 80: höher als 2 von 3.
    expect(result?.attendance).toEqual({ value: 90, cohortAverage: 82, betterThan: 67, band: 'oben', compared: 3 });
  });

  it('Gleichstand zählt halb; schlechtester Wert landet im unteren Drittel', () => {
    const entries = [entry('A1', [p('me', 2013, 3, 50)]), entry('A2', [p('x', 2013, 3, 90), p('y', 2013, 2, 90)])];
    const result = cohortComparison('me', 'A1', entries);
    expect(result?.grade?.betterThan).toBe(25);
    expect(result?.grade?.band).toBe('unten');
    expect(result?.attendance?.band).toBe('unten');
  });

  it('kein Vergleich ohne Jahrgang, ohne eigene Kurzfassung oder ohne gleich alte Spieler in anderen Teams', () => {
    expect(cohortComparison('me', 'A1', [entry('A1', [p('me', null, 2, 90)]), entry('A2', [p('x', 2013, 2, 90)])])).toBeNull();
    expect(cohortComparison('me', 'A1', [entry('A2', [p('x', 2013, 2, 90)])])).toBeNull();
    expect(cohortComparison('me', 'A1', [entry('A1', [p('me', 2013, 2, 90), p('mate', 2013, 3, 90)]), entry('A2', [p('x', 2012, 2, 90)])])).toBeNull();
  });

  it('ohne eigene Note gibt es nur den Teilnahme-Vergleich', () => {
    const result = cohortComparison('me', 'A1', [entry('A1', [p('me', 2013, null, 60)]), entry('A2', [p('x', 2013, 2, 90)])]);
    expect(result?.grade).toBeNull();
    expect(result?.attendance?.betterThan).toBe(0);
  });
});
