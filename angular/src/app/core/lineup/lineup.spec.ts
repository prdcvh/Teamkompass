import { type Candidate, assignmentsFromPreview, eligibleCandidates, formationPreview } from './formation-assignment';
import { benchOf, docFromLineup, emptyAssignments, formationName, lineupGrade, lineupIsEmpty, moveToZone, normalizeLineup, onPitchCount, removeFromPitch, swapPlayers, zoneOf } from './lineup';
import { FORMATION_PRESETS, ZONES, presetName } from './pitch';
import type { Player } from '../player/player';

const player = (id: string, number: number, positions: string[]): Player => ({
  id,
  name: `Spieler ${id}`,
  positions,
  number,
  birthdate: '2012-01-01',
  status: 'Fit',
  injuryUntil: '',
  consentStatus: 'pending',
  consentDate: '',
});
const cand = (id: string, number: number, positions: string[], grade: number | null = null, status = 'Fit'): Candidate => ({ player: player(id, number, positions), grade, status });

/** Ein Kader, aus dem sich 4-3-3 (Preset 0) komplett besetzen lässt. */
const squad: Candidate[] = [
  cand('tw', 1, ['TW'], 2),
  cand('lv', 2, ['LV'], 2.5),
  cand('iv1', 3, ['IV'], 2),
  cand('iv2', 4, ['IV'], 3),
  cand('rv', 5, ['RV'], 2.2),
  cand('zm1', 6, ['ZM'], 2.1),
  cand('zm2', 7, ['ZM'], 2.4),
  cand('zm3', 8, ['ZM'], 3.1),
  cand('la', 9, ['LA'], 2.8),
  cand('st', 10, ['ST'], 1.9),
  cand('ra', 11, ['RA'], 2.6),
  cand('bank', 12, ['ST', 'IV'], 4),
];

describe('Aufstellung bearbeiten', () => {
  it('benennt Formationen aus den Bändern (leere Bänder entfallen)', () => {
    expect(presetName(FORMATION_PRESETS[0])).toBe('4-3-3');
    expect(presetName(FORMATION_PRESETS[1])).toBe('4-2-3-1');
    expect(presetName({ TW: 1, IV: 3, LM: 1, ZM: 3, RM: 1, ST: 2 })).toBe('3-5-2');
    expect(formationName(emptyAssignments())).toBe('Keine Aufstellung');
    const assignments = moveToZone(moveToZone(emptyAssignments(), 'a', 'IV') as never, 'b', 'ST') as never;
    expect(formationName(assignments)).toBe('1-1');
  });

  it('Dokument ↔ Aufstellung: unbekannte Zonen, fremde und doppelte Spieler fallen weg', () => {
    const doc = { assignments: { TW: ['tw'], IV: ['iv1', 'iv1', 'weg'], FANTASIE: ['x'], ST: 'kaputt' } };
    const lineup = normalizeLineup(doc, new Set(['tw', 'iv1']));
    expect(lineup.TW).toEqual(['tw']);
    expect(lineup.IV).toEqual(['iv1']);
    expect(lineup.ST).toEqual([]);
    expect(Object.keys(lineup)).toEqual(ZONES);
    expect(normalizeLineup(null)).toEqual(emptyAssignments());
    expect(normalizeLineup(docFromLineup(lineup))).toEqual(lineup);
    expect(lineupIsEmpty(lineup)).toBe(false);
    expect(lineupIsEmpty(emptyAssignments())).toBe(true);
  });

  it('Aufstellen: aus der alten Zone entfernen, 12. Spieler wird abgelehnt, Wechsel der Zone geht immer', () => {
    let lineup = assignmentsFromPreview(formationPreview(FORMATION_PRESETS[0], eligibleCandidates(squad)).assigned);
    expect(moveToZone(lineup, 'bank', 'ST')).toBe('voll');
    const moved = moveToZone(lineup, 'st', 'HS');
    expect(moved).not.toBe('voll');
    lineup = moved as never;
    expect(zoneOf(lineup, 'st')).toBe('HS');
    expect(onPitchCount(lineup)).toBe(11);
  });

  it('Vom Feld nehmen und wieder aufstellen', () => {
    let lineup = assignmentsFromPreview(formationPreview(FORMATION_PRESETS[0], eligibleCandidates(squad)).assigned);
    lineup = removeFromPitch(lineup, 'st');
    expect(zoneOf(lineup, 'st')).toBeNull();
    expect(onPitchCount(lineup)).toBe(10);
    const again = moveToZone(lineup, 'bank', 'ST');
    expect(again).not.toBe('voll');
    expect(zoneOf(again as never, 'bank')).toBe('ST');
  });

  it('Tauschen: zwei auf dem Feld tauschen Zonen, von der Bank = Einwechslung', () => {
    const lineup = assignmentsFromPreview(formationPreview(FORMATION_PRESETS[0], eligibleCandidates(squad)).assigned);
    const swapped = swapPlayers(lineup, 'st', 'tw');
    expect(zoneOf(swapped, 'st')).toBe('TW');
    expect(zoneOf(swapped, 'tw')).toBe('ST');
    const substituted = swapPlayers(lineup, 'bank', 'st');
    expect(zoneOf(substituted, 'bank')).toBe('ST');
    expect(zoneOf(substituted, 'st')).toBeNull();
    expect(onPitchCount(substituted)).toBe(11);
    expect(swapPlayers(lineup, 'st', 'st')).toBe(lineup);
  });

  it('Bank: beste Note zuerst, Unbewertete nach Nummer; Mannschaftsnote der Startelf', () => {
    let lineup = emptyAssignments();
    lineup = moveToZone(lineup, 'st', 'ST') as never;
    lineup = moveToZone(lineup, 'tw', 'TW') as never;
    const bench = benchOf(lineup, [...squad, cand('neu2', 20, [], null), cand('neu1', 19, [], null)]);
    expect(bench[0].player.id).toBe('iv1'); // Note 2, vor zm1 (2,1)
    expect(bench.at(-1)?.player.id).toBe('neu2');
    expect(bench.map((entry) => entry.player.id)).not.toContain('st');
    expect(lineupGrade(lineup, squad)).toBe(2); // (1,9 + 2) / 2 = 1,95, auf eine Stelle gerundet 2,0
    expect(lineupGrade(emptyAssignments(), squad)).toBeNull();
  });
});
