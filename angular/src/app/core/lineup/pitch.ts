/**
 * Spielfeld des Taktikboards: 14 feste Positionszonen, Bänder von hinten nach vorn und die Formations-Vorlagen
 * (wie Alt-App app.js: PITCH_ZONES, PITCH_BANDS, FORMATION_PRESETS).
 */
import { type Player, parsePositions } from '../player/player';

/** 14 feste Positionszonen (Mittelpunkt und Breite in Prozent des Spielfelds). */
export const PITCH_ZONES = {
  TW: { x: 50, y: 92, width: 16 },
  LV: { x: 17, y: 68, width: 20 },
  IV: { x: 50, y: 70, width: 54 },
  LIB: { x: 50, y: 79, width: 22 },
  RV: { x: 83, y: 68, width: 20 },
  DM: { x: 50, y: 54, width: 42 },
  ZM: { x: 50, y: 46, width: 60 },
  LM: { x: 17, y: 46, width: 20 },
  RM: { x: 83, y: 46, width: 20 },
  OM: { x: 50, y: 30, width: 66 },
  LA: { x: 19, y: 20, width: 24 },
  HS: { x: 50, y: 18, width: 30 },
  ST: { x: 50, y: 14, width: 46 },
  RA: { x: 81, y: 20, width: 24 },
} as const;

export type Zone = keyof typeof PITCH_ZONES;
export const ZONES = Object.keys(PITCH_ZONES) as Zone[];

/** Bänder von hinten nach vorn; die Formationsbezeichnung entsteht immer aus der Summe je Band. */
export const PITCH_BANDS: readonly (readonly Zone[])[] = [
  ['LV', 'IV', 'LIB', 'RV'],
  ['DM'],
  ['LM', 'ZM', 'RM'],
  ['OM'],
  ['LA', 'HS', 'ST', 'RA'],
];

export type Preset = Readonly<Partial<Record<Zone, number>>>;

/** Formationsvorschläge als Anzahl Spieler je Zone (Torwart immer 1). */
export const FORMATION_PRESETS: readonly Preset[] = [
  { TW: 1, LV: 1, IV: 2, RV: 1, ZM: 3, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 2, OM: 3, ST: 1 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 2, RM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, ZM: 2, OM: 1, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, DM: 1, LM: 1, ZM: 2, RM: 1, ST: 1 },
  { TW: 1, IV: 3, LM: 1, ZM: 3, RM: 1, ST: 2 },
  { TW: 1, IV: 3, LM: 1, ZM: 2, RM: 1, LA: 1, ST: 1, RA: 1 },
  { TW: 1, LV: 1, IV: 3, RV: 1, ZM: 3, ST: 2 },
  { TW: 1, LV: 1, IV: 2, RV: 1, LM: 1, ZM: 3, RM: 1, ST: 1 },
];

export const MAX_ON_PITCH = 11;
/** Spieler mit diesem Status sind für die automatische Aufstellung nicht verfügbar. */
export const UNAVAILABLE_STATUSES: readonly string[] = ['Verletzt', 'Gesperrt', 'Abwesend'];

export function presetName(preset: Preset): string {
  return PITCH_BANDS.map((zones) => zones.reduce((sum, zone) => sum + (preset[zone] ?? 0), 0))
    .filter((count) => count > 0)
    .join('-');
}

/** Steht der Spieler in einer Zone, die nicht zu seinen Positionen gehört? */
export function outOfPosition(player: Player, zone: Zone): boolean {
  return !parsePositions(player.positions).includes(zone);
}
