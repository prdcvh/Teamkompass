import type { Player } from '../player/player';
import { type Candidate, assignmentsFromPreview, eligibleCandidates, expandPreset, formationOptions, suggestedLineup } from './formation-assignment';
import { GAME_FORMATS, GAME_FORMAT_INFO, type GameFormat, isGameFormat } from './game-format';
import { docFromEventLineup, emptyAssignments, fitToFormat, formationName, moveToZone, normalizeEventLineups, onPitchCount, zonesForFormat } from './lineup';
import { presetName } from './pitch';

const cand = (id: string, number: number, positions: string[], grade: number | null = 3): Candidate => ({
  player: { id, name: `Spieler ${id}`, positions, number, birthdate: '2016-01-01', status: 'Fit', injuryUntil: '', injuredSince: '', consentStatus: 'pending', consentDate: '' } as Player,
  grade,
  status: 'Fit',
});

/** 12 Kinder, fast alle nur auf einer Position (ST) – bewusst zu wenige passende Positionen für die Formationen. */
const kids = Array.from({ length: 12 }, (_, index) => cand(`k${index}`, index + 1, [index === 0 ? 'TW' : 'ST'], 2 + index / 10));

const NAMES: Record<Exclude<GameFormat, '11:11'>, string[]> = {
  '3:3': ['1-2', '2-1'],
  '5:5': ['1-2-1', '2-2'],
  '7:7': ['2-3-1', '3-2-1'],
  '9:9': ['3-3-2', '3-2-3'],
};

describe('Spielformen (SCRUM-187)', () => {
  it('erkennt nur bekannte Spielformen', () => {
    expect(GAME_FORMATS.every(isGameFormat)).toBe(true);
    expect(isGameFormat('4:4')).toBe(false);
    expect(isGameFormat(undefined)).toBe(false);
  });

  for (const format of GAME_FORMATS.filter((f): f is Exclude<GameFormat, '11:11'> => f !== '11:11')) {
    describe(format, () => {
      const info = GAME_FORMAT_INFO[format];

      it('hat Formationen mit der richtigen Spielerzahl und passenden Namen', () => {
        expect(info.presets.map(presetName)).toEqual(NAMES[format]);
        for (const preset of info.presets) {
          expect(expandPreset(preset)).toHaveLength(info.players);
          expect((preset.TW ?? 0) === 1).toBe(info.goalkeeper);
        }
      });

      it('schlägt eine volle Elf mit der erlaubten Spielerzahl vor, auch ohne passende Positionen', () => {
        const options = formationOptions(eligibleCandidates(kids), format);
        expect(options).toHaveLength(info.presets.length);
        expect(options.filter((option) => option.recommended)).toHaveLength(1);
        for (const option of options) expect(option.preview.filled).toBe(info.players);
        const suggestion = suggestedLineup(eligibleCandidates(kids), format);
        expect(onPitchCount(suggestion)).toBe(info.players);
        const ids = Object.values(suggestion).flat();
        expect(new Set(ids).size).toBe(ids.length);
        expect(formationName(suggestion)).toBe(options.find((option) => option.recommended)!.name);
      });

      it('bevorzugt Spieler, die auf der Position spielen', () => {
        if (!info.goalkeeper) return;
        const suggestion = suggestedLineup(eligibleCandidates(kids), format);
        expect(suggestion.TW).toEqual(['k0']); // der einzige Torwart steht im Tor, obwohl er nicht die beste Note hat
      });

      it('lehnt den Spieler über der Spielerzahl ab', () => {
        let assignments = emptyAssignments();
        for (let index = 0; index < info.players; index += 1) assignments = moveToZone(assignments, `p${index}`, 'ST', info.players) as never;
        expect(moveToZone(assignments, 'extra', 'ST', info.players)).toBe('voll');
        expect(moveToZone(assignments, 'p0', 'IV', info.players)).not.toBe('voll');
      });
    });
  }

  it('3:3 hat keinen Torwart: der Vorschlag setzt niemanden ins Tor', () => {
    expect(suggestedLineup(eligibleCandidates(kids), '3:3').TW).toEqual([]);
  });

  it('11:11 bleibt wie bisher streng nach Positionen', () => {
    const options = formationOptions(eligibleCandidates(kids));
    expect(options).toHaveLength(9);
    expect(options.every((option) => option.preview.filled < option.preview.total)).toBe(true); // nur ein TW und lauter Stürmer
    expect(options.map((option) => option.name)).toEqual(formationOptions(eligibleCandidates(kids), '11:11').map((option) => option.name));
  });

  it('Aufstellung an die Spielform anpassen: Torwart und Überzählige gehen auf die Bank, 11:11 bleibt unverändert', () => {
    const assignments = suggestedLineup(eligibleCandidates(kids), '9:9');
    expect(fitToFormat(assignments, '11:11')).toBe(assignments);
    expect(fitToFormat(assignments, '9:9')).toBe(assignments);
    const five = fitToFormat(assignments, '5:5');
    expect(onPitchCount(five)).toBe(5);
    expect(five.TW).toEqual(assignments.TW);
    const three = fitToFormat(assignments, '3:3');
    expect(onPitchCount(three)).toBe(3);
    expect(three.TW).toEqual([]);
  });

  it('bietet bei kleinen Spielformen nur die genutzten Zonen an, bei 11:11 alle', () => {
    const empty = emptyAssignments();
    expect(zonesForFormat('11:11', empty)).toHaveLength(14);
    expect(zonesForFormat('3:3', empty)).not.toContain('TW');
    expect(zonesForFormat('5:5', empty)).toContain('TW');
    expect(zonesForFormat('5:5', empty).length).toBeLessThan(14);
    expect(zonesForFormat('3:3', moveToZone(empty, 'x', 'DM') as never)).toContain('DM'); // besetzte Zone bleibt sichtbar
  });

  it('speichert die Spielform am Spiel; unbekannte Werte und fehlende Angabe fallen weg', () => {
    const assignments = moveToZone(emptyAssignments(), 'a', 'ST') as never;
    expect(docFromEventLineup(assignments, 'x')['gameFormat']).toBeUndefined();
    const doc = docFromEventLineup(assignments, '2026-11-01T10:00:00Z', '5:5');
    const parsed = normalizeEventLineups({ g1: doc, g2: { ...doc, gameFormat: '4:4' }, g3: { ...doc, gameFormat: undefined } });
    expect(parsed['g1'].gameFormat).toBe('5:5');
    expect(parsed['g2'].gameFormat).toBeUndefined();
    expect(parsed['g3'].gameFormat).toBeUndefined();
  });

  it('Vorschau lässt sich in eine Aufstellung umwandeln', () => {
    const [option] = formationOptions(eligibleCandidates(kids), '7:7');
    expect(onPitchCount(assignmentsFromPreview(option.preview.assigned))).toBe(7);
  });
});
