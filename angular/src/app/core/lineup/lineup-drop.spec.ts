import { type Assignments, emptyAssignments, normalizeLineup } from './lineup';
import { type DropTarget, dropKey, dropPlayer, parseDropKey } from './lineup-drop';

const lineup = (assignments: Record<string, string[]>): Assignments => normalizeLineup({ assignments });
const zone = (name: string, playerId: string | null = null) => ({ kind: 'zone', zone: name, playerId }) as DropTarget;
const bench: DropTarget = { kind: 'bench' };
const full = lineup({ TW: ['tw'], LV: ['lv'], IV: ['iv1', 'iv2'], RV: ['rv'], ZM: ['zm1', 'zm2', 'zm3'], LA: ['la'], ST: ['st'], RA: ['ra'] });
const placed = (result: Assignments | 'voll' | null) => {
  if (result === null || result === 'voll') throw new Error(`keine Aufstellung: ${result}`);
  return Object.fromEntries(Object.entries(result).filter(([, ids]) => ids.length > 0));
};

describe('dropPlayer (Drag & Drop in der Aufstellung)', () => {
  it('stellt einen Bankspieler auf eine leere Position', () => {
    expect(placed(dropPlayer(lineup({ TW: ['tw'] }), 'st', zone('ST')))).toEqual({ TW: ['tw'], ST: ['st'] });
  });

  it('stellt einen Bankspieler als zweiten Spieler in eine besetzte Zone, solange Platz ist', () => {
    expect(placed(dropPlayer(lineup({ IV: ['iv1'] }), 'iv2', zone('IV')))).toEqual({ IV: ['iv1', 'iv2'] });
  });

  it('verschiebt einen Feldspieler auf eine andere Position', () => {
    expect(placed(dropPlayer(lineup({ TW: ['tw'], ZM: ['zm1'] }), 'zm1', zone('OM')))).toEqual({ TW: ['tw'], OM: ['zm1'] });
  });

  it('nimmt einen Feldspieler vom Feld, wenn er auf die Bank gezogen wird', () => {
    expect(placed(dropPlayer(lineup({ TW: ['tw'], ST: ['st'] }), 'st', bench))).toEqual({ TW: ['tw'] });
  });

  it('ändert nichts, wenn ein Bankspieler auf die Bank gezogen wird', () => {
    expect(dropPlayer(lineup({ TW: ['tw'] }), 'st', bench)).toBeNull();
  });

  it('ändert nichts, wenn ein Spieler an seine eigene Position oder auf sich selbst gezogen wird', () => {
    const start = lineup({ IV: ['iv1', 'iv2'] });
    expect(dropPlayer(start, 'iv1', zone('IV'))).toBeNull();
    expect(dropPlayer(start, 'iv1', zone('IV', 'iv1'))).toBeNull();
  });

  it('tauscht Bankspieler und Feldspieler: der verdrängte geht auf die Bank', () => {
    const result = placed(dropPlayer(full, 'bank', zone('ST', 'st')));
    expect(result['ST']).toEqual(['bank']);
    expect(Object.values(result).flat()).not.toContain('st');
    expect(Object.values(result).flat()).toHaveLength(11);
  });

  it('tauscht zwei Feldspieler: der verdrängte geht auf die alte Position', () => {
    const result = placed(dropPlayer(full, 'la', zone('RA', 'ra')));
    expect(result['LA']).toEqual(['ra']);
    expect(result['RA']).toEqual(['la']);
  });

  it('tauscht auch innerhalb einer Zone mit mehreren Spielern nur den getroffenen', () => {
    const result = placed(dropPlayer(full, 'iv1', zone('ZM', 'zm2')));
    expect(result['IV']).toEqual(['iv2', 'zm2']);
    expect(result['ZM']).toEqual(['zm1', 'zm3', 'iv1']);
  });

  it('meldet „voll“, wenn ein Bankspieler auf eine freie Position käme, aber schon alle stehen', () => {
    expect(dropPlayer(full, 'bank', zone('OM'))).toBe('voll');
    expect(dropPlayer(lineup({ TW: ['tw'], ST: ['st'] }), 'bank', zone('OM'), 2)).toBe('voll');
  });

  it('tauscht bei vollem Feld mit dem einzigen Spieler der Zone, auch wenn nicht genau auf ihn gezogen wurde', () => {
    const result = placed(dropPlayer(full, 'bank', zone('TW')));
    expect(result['TW']).toEqual(['bank']);
    expect(Object.values(result).flat()).not.toContain('tw');
  });

  it('meldet „voll“ bei vollem Feld und einer Zone mit mehreren Spielern (unklar, wer gehen soll)', () => {
    expect(dropPlayer(full, 'bank', zone('IV'))).toBe('voll');
  });

  it('stellt den Spieler auf die Position, wenn der getroffene Spieler gar nicht (mehr) dort steht', () => {
    expect(placed(dropPlayer(emptyAssignments(), 'st', zone('ST', 'weg')))).toEqual({ ST: ['st'] });
  });
});

describe('dropKey / parseDropKey', () => {
  it('wandelt Ziele hin und zurück', () => {
    for (const target of [bench, zone('IV'), zone('ST', 'abc'), zone('TW', 'id:mit:doppelpunkt')]) {
      expect(parseDropKey(dropKey(target))).toEqual(target);
    }
    expect(dropKey(zone('IV', 'x'))).toBe('player:IV:x');
  });

  it('erkennt alles andere nicht als Ziel', () => {
    for (const key of [null, undefined, '', 'zone', 'zone:XX', 'player:IV', 'player:IV:', 'zone:IV:x', 'foo:IV']) {
      expect(parseDropKey(key)).toBeNull();
    }
  });
});
