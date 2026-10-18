import { expandPreset } from './formation-assignment';
import { FORMATION_PRESETS, ZONES, outOfPosition } from './pitch';
import type { Player } from '../player/player';

const player = (id: string, number: number, positions: string[]): Player => ({
  id,
  name: `Spieler ${id}`,
  positions,
  number,
  birthdate: '2012-01-01',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'pending',
  consentDate: '',
});

describe('Spielfeld und Formations-Vorlagen', () => {
  it('alle Vorlagen haben 11 Spieler und nur bekannte Zonen', () => {
    for (const preset of FORMATION_PRESETS) {
      expect(expandPreset(preset)).toHaveLength(11);
      expect(Object.keys(preset).every((zone) => ZONES.includes(zone as never))).toBe(true);
    }
  });

  it('erkennt Spieler außerhalb ihrer Position', () => {
    expect(outOfPosition(player('a', 1, ['IV']), 'IV')).toBe(false);
    expect(outOfPosition(player('a', 1, ['IV']), 'ST')).toBe(true);
  });
});
