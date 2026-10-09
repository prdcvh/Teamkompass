import {
  type Candidate,
  FORMATION_PRESETS,
  MAX_ON_PITCH,
  ZONES,
  assignFormationSlots,
  assignmentsFromPreview,
  benchOf,
  docFromLineup,
  eligibleCandidates,
  emptyAssignments,
  expandPreset,
  formationName,
  formationOptions,
  formationPreview,
  lineupGrade,
  lineupIsEmpty,
  moveToZone,
  normalizeLineup,
  onPitchCount,
  outOfPosition,
  presetName,
  removeFromPitch,
  suggestedLineup,
  swapPlayers,
  zoneOf,
} from './lineup';
import { type Player } from './player';

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

describe('Aufstellung', () => {
  it('benennt Formationen aus den Bändern (leere Bänder entfallen)', () => {
    expect(presetName(FORMATION_PRESETS[0])).toBe('4-3-3');
    expect(presetName(FORMATION_PRESETS[1])).toBe('4-2-3-1');
    expect(presetName({ TW: 1, IV: 3, LM: 1, ZM: 3, RM: 1, ST: 2 })).toBe('3-5-2');
    expect(formationName(emptyAssignments())).toBe('Keine Aufstellung');
    const assignments = moveToZone(moveToZone(emptyAssignments(), 'a', 'IV') as never, 'b', 'ST') as never;
    expect(formationName(assignments)).toBe('1-1');
  });

  it('alle Vorlagen haben 11 Spieler und nur bekannte Zonen', () => {
    for (const preset of FORMATION_PRESETS) {
      expect(expandPreset(preset)).toHaveLength(11);
      expect(Object.keys(preset).every((zone) => ZONES.includes(zone as never))).toBe(true);
    }
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

  it('verfügbare Spieler: verletzt/gesperrt/abwesend fehlen, beste Note zuerst, dann Nummer', () => {
    const list = eligibleCandidates([cand('a', 5, [], null), cand('b', 7, [], 2), cand('c', 3, [], 2), cand('d', 1, [], 1, 'Verletzt'), cand('e', 2, [], 1, 'Gesperrt'), cand('f', 4, [], 1, 'Abwesend'), cand('g', 6, [], 3, 'Angeschlagen')]);
    expect(list.map((entry) => entry.player.id)).toEqual(['c', 'b', 'g', 'a']);
  });

  it('besetzt 4-3-3 vollständig mit der besten Elf und lässt Fremdpositionen leer', () => {
    const preview = formationPreview(FORMATION_PRESETS[0], eligibleCandidates(squad));
    expect(preview.filled).toBe(11);
    expect(preview.total).toBe(11);
    const ids = preview.assigned.map((item) => item.candidate?.player.id);
    expect(ids).toContain('st');
    expect(ids).not.toContain('bank'); // schlechtere Note, wird nicht gebraucht
    expect(preview.grade).toBe(2.4); // (2 + 2,5 + 2 + 3 + 2,2 + 2,1 + 2,4 + 3,1 + 2,8 + 1,9 + 2,6) / 11 = 2,42
  });

  it('wählt bei knappem Kader die Besetzung mit den wenigsten offenen Plätzen', () => {
    const small = [cand('a', 1, ['IV'], 1), cand('b', 2, ['IV', 'ST'], 5)];
    const slots = [{ zone: 'IV' as const }, { zone: 'ST' as const }];
    const result = assignFormationSlots(slots, eligibleCandidates(small));
    // a muss IV spielen, b ST: beide Plätze besetzt, obwohl a die bessere Note hat
    expect(result.map((item) => item.candidate?.player.id)).toEqual(['a', 'b']);
  });

  it('lässt Plätze offen, wenn niemand die Position hat', () => {
    const result = assignFormationSlots([{ zone: 'TW' }, { zone: 'ST' }], [cand('a', 1, ['IV'], 2)]);
    expect(result.map((item) => item.candidate)).toEqual([null, null]);
  });

  it('empfiehlt die beste vollständig besetzbare Formation', () => {
    const options = formationOptions(eligibleCandidates(squad));
    expect(options).toHaveLength(FORMATION_PRESETS.length);
    expect(options.filter((option) => option.recommended)).toHaveLength(1);
    const recommended = options.find((option) => option.recommended)!;
    expect(recommended.preview.filled).toBe(recommended.preview.total);
    const complete = options.filter((option) => option.preview.filled === option.preview.total);
    expect(recommended.preview.grade).toBe(Math.min(...complete.map((option) => option.preview.grade as number)));
  });

  it('schlägt für ein leeres Board die empfohlene Formation vor; ohne Noten bleibt es leer', () => {
    const suggestion = suggestedLineup(eligibleCandidates(squad));
    expect(onPitchCount(suggestion)).toBe(11); // vollständig besetzbar, also wird die vollständige Formation gewählt
    expect(onPitchCount(suggestion)).toBeLessThanOrEqual(MAX_ON_PITCH);
    expect(lineupIsEmpty(suggestedLineup(eligibleCandidates([cand('a', 1, ['TW'], null)])))).toBe(true);
  });

  it('Vorlage anwenden: ein Spieler steht höchstens einmal', () => {
    const preview = formationPreview(FORMATION_PRESETS[0], eligibleCandidates(squad));
    const assignments = assignmentsFromPreview(preview.assigned);
    const all = ZONES.flatMap((zone) => assignments[zone]);
    expect(new Set(all).size).toBe(all.length);
    expect(onPitchCount(assignments)).toBe(11);
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

  it('erkennt Spieler außerhalb ihrer Position', () => {
    expect(outOfPosition(player('a', 1, ['IV']), 'IV')).toBe(false);
    expect(outOfPosition(player('a', 1, ['IV']), 'ST')).toBe(true);
  });
});
