/**
 * Spielformen (SCRUM-187): 3:3, 5:5, 7:7, 9:9 und 11:11 mit den passenden Formationen. Die Formationen bestehen wie beim
 * 11er-Spiel aus Zonen des Taktikboards (Anzahl je Zone). Beschlossen vom PO am 02.11.2026: 3:3 ohne Torwart (vier
 * Minitore), sonst immer mit Torwart; 11:11 wie bisher.
 */
import { FORMATION_PRESETS, type Preset } from './pitch';

export const GAME_FORMATS = ['3:3', '5:5', '7:7', '9:9', '11:11'] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

/** Gilt, solange weder Team noch Spiel eine Spielform festlegen – so bleiben bestehende 11er-Aufstellungen unverändert. */
export const DEFAULT_GAME_FORMAT: GameFormat = '11:11';

export function isGameFormat(value: unknown): value is GameFormat {
  return typeof value === 'string' && (GAME_FORMATS as readonly string[]).includes(value);
}

export interface GameFormatInfo {
  /** Spieler je Mannschaft auf dem Feld (inkl. Torwart, falls es einen gibt). */
  readonly players: number;
  readonly goalkeeper: boolean;
  readonly presets: readonly Preset[];
  /** Kleine Spielformen: Hinweis auf gleichmäßige Einsatzzeit (nur Text, kein automatisches Durchwechseln). */
  readonly rotationHint: boolean;
}

export const GAME_FORMAT_INFO: Readonly<Record<GameFormat, GameFormatInfo>> = {
  '3:3': {
    players: 3,
    goalkeeper: false,
    rotationHint: true,
    presets: [
      { IV: 1, LA: 1, RA: 1 }, // 1-2
      { LV: 1, RV: 1, ST: 1 }, // 2-1
    ],
  },
  '5:5': {
    players: 5,
    goalkeeper: true,
    rotationHint: true,
    presets: [
      { TW: 1, IV: 1, LM: 1, RM: 1, ST: 1 }, // 1-2-1 (Raute)
      { TW: 1, LV: 1, RV: 1, LA: 1, RA: 1 }, // 2-2
    ],
  },
  '7:7': {
    players: 7,
    goalkeeper: true,
    rotationHint: false,
    presets: [
      { TW: 1, LV: 1, RV: 1, LM: 1, ZM: 1, RM: 1, ST: 1 }, // 2-3-1
      { TW: 1, LV: 1, IV: 1, RV: 1, ZM: 2, ST: 1 }, // 3-2-1
    ],
  },
  '9:9': {
    players: 9,
    goalkeeper: true,
    rotationHint: false,
    presets: [
      { TW: 1, LV: 1, IV: 1, RV: 1, ZM: 3, ST: 2 }, // 3-3-2
      { TW: 1, LV: 1, IV: 1, RV: 1, ZM: 2, LA: 1, ST: 1, RA: 1 }, // 3-2-3
    ],
  },
  '11:11': { players: 11, goalkeeper: true, rotationHint: false, presets: FORMATION_PRESETS },
};

export function gameFormatInfo(format: GameFormat): GameFormatInfo {
  return GAME_FORMAT_INFO[format];
}

export const ROTATION_HINT =
  'Bei kleinen Spielformen sollen alle Kinder ähnlich viel spielen. Wechselt regelmäßig durch und achtet darauf, dass jedes Kind ungefähr gleich lange auf dem Feld steht.';
