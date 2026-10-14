import { type Candidate, assignFormationSlots, assignmentsFromPreview, eligibleCandidates, formationOptions, formationPreview, suggestedLineup } from './formation-assignment';
import { lineupIsEmpty, onPitchCount } from './lineup';
import { FORMATION_PRESETS, MAX_ON_PITCH, ZONES } from './pitch';
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

describe('Automatische Aufstellung', () => {
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
});
