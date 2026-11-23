import type { Player } from '../player/player';
import { CLUB_OVERVIEW_VERSION, lastAndNext, overviewFromDoc, overviewFromPlayers, overviewKey, playerSummaries, trainersFromMembers } from './club-overview';

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  positions: ['ST'],
  number: 9,
  birthdate: '2012-05-05',
  status: 'Verletzt',
  injuryUntil: '2026-12-01',
  injuredSince: '2026-10-01',
  consentStatus: 'pending',
  consentDate: '',
  ...extra,
});

describe('Vereinsübersicht (SCRUM-183)', () => {
  it('Kurzfassung enthält nur id, Name, Nummer, Positionen – keine Gesundheits- oder Einwilligungsangaben', () => {
    const data = overviewFromPlayers([
      player('p2', 'Zoe', { consentStatus: 'granted' }),
      player('p1', 'Ali'),
      player('p3', 'Bea', { consentStatus: 'revoked' }),
    ]);
    expect(data).toEqual({
      version: CLUB_OVERVIEW_VERSION,
      playerCount: 3,
      consentPending: 1,
      consentRevoked: 1,
      players: [
        { id: 'p1', name: 'Ali', number: 9, positions: ['ST'] },
        { id: 'p3', name: 'Bea', number: 9, positions: ['ST'] },
        { id: 'p2', name: 'Zoe', number: 9, positions: ['ST'] },
      ],
    });
    const text = JSON.stringify(data);
    for (const forbidden of ['Verletzt', 'injury', 'injured', 'status', 'birthdate', '2026-12-01']) expect(text).not.toContain(forbidden);
  });

  it('gleicher Kader → gleicher Schlüssel; Name geändert → anderer Schlüssel', () => {
    const a = overviewFromPlayers([player('p1', 'Ali'), player('p2', 'Bea')]);
    const b = overviewFromPlayers([player('p2', 'Bea'), player('p1', 'Ali', { status: 'Fit' })]);
    expect(overviewKey(a)).toBe(overviewKey(b));
    expect(overviewKey(overviewFromPlayers([player('p1', 'Alina'), player('p2', 'Bea')]))).not.toBe(overviewKey(a));
  });

  it('liest das Dokument robust (falsche Version → null, kaputte Einträge raus)', () => {
    expect(overviewFromDoc(null)).toBeNull();
    expect(overviewFromDoc({ version: 99 })).toBeNull();
    const parsed = overviewFromDoc({
      version: CLUB_OVERVIEW_VERSION,
      playerCount: 1,
      consentPending: -3,
      consentRevoked: 0,
      players: [{ id: 'p1', name: 'Ali', number: 7, positions: ['ST', 3] }, 'kaputt', { name: 'ohne id' }],
      updatedAt: { toDate: () => new Date('2026-11-04T10:00:00Z') },
    })!;
    expect(parsed.players).toEqual([{ id: 'p1', name: 'Ali', number: 7, positions: ['ST'] }]);
    expect(parsed.consentPending).toBe(0);
    expect(parsed.updatedAt?.toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it('Trainer aus den Zugängen (nur Rolle trainer)', () => {
    expect(
      trainersFromMembers([
        { id: 'u2', data: { role: 'trainer', email: 'zz@verein.de' } },
        { id: 'u1', data: { role: 'trainer', email: 'aa@verein.de' } },
        { id: 'u3', data: { role: 'player', playerId: 'p1' } },
        { id: 'u4', data: { role: 'physio', email: 'physio@verein.de' } },
      ]),
    ).toEqual([
      { uid: 'u1', email: 'aa@verein.de' },
      { uid: 'u2', email: 'zz@verein.de' },
    ]);
  });

  it('letzte Aktivität: letzter Termin bis heute, nächster ab morgen', () => {
    const events = [
      { id: 'e1', date: '2026-10-01', title: 'A', type: 'Training' as const },
      { id: 'e3', date: '2026-11-10', title: 'C', type: 'Spiel' as const },
      { id: 'e2', date: '2026-11-04', title: 'B', type: 'Training' as const },
    ];
    expect(lastAndNext(events, '2026-11-04')).toEqual({ last: events[2], next: events[1] });
    expect(lastAndNext([], '2026-11-04')).toEqual({ last: null, next: null });
  });

  it('Kennzahlen je Spieler aus playerStats (Einsätze, Tore, Vorlagen, Ø Note)', () => {
    const entry = (attendance: string, grade: number | null, goals = 0) => ({
      attendance,
      effort: grade,
      technique: grade,
      tactics: grade,
      comprehension: grade,
      minutes: 60,
      goals,
      assists: 1,
    });
    const result = playerSummaries([
      { id: 'p1', data: { playerId: 'p1', version: 1, events: { e1: entry('present', 2, 1), e2: entry('limited', 3), e3: entry('absent', null) } } },
      { id: 'p2', data: { playerId: 'p2', version: 1, events: {} } },
    ]);
    expect(result.get('p1')).toEqual({ appearances: 2, goals: 1, assists: 3, average: 2.5 });
    expect(result.get('p2')).toEqual({ appearances: 0, goals: 0, assists: 0, average: null });
  });
});
