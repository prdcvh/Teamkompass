/**
 * Bio-Banding (SCRUM-191): Trainingsgruppen nach biologischer Reife statt nach Alter vorschlagen.
 *
 * QUELLE DER BÄNDER
 *   Premier League, „Bio-Banding“ (https://premierleague.com/news/58833) und Cumming et al., Bio-Banding in Sport
 *   (Sport for Life 2017): Spieler werden nach dem Anteil der erwarteten Erwachsenengröße (Khamis-Roche, siehe
 *   maturity.ts) in Bänder gelegt. Üblich sind: unter 85 %, 85–90 %, 90–95 %, über 95 %.
 *
 * ZUORDNUNG (am auf eine Nachkommastelle gerundeten Wert, so wie er im Profil steht; bei 85 und 95 gleiche Grenze
 * wie die Einordnung in maturity.ts)
 *   unter 85 %          → Band 1
 *   85 % bis unter 90 % → Band 2
 *   90 % bis 95 %       → Band 3 (95,0 gehört noch dazu, erst darüber ist „früh entwickelt“)
 *   über 95 %           → Band 4
 *
 * Der Vorschlag ist nur eine Hilfe, der Trainer entscheidet. Er nutzt die jüngste Messung je Spieler (nur Spieler
 * von 12 bis 15 Jahren mit Reifestand); alle anderen bekommen keinen Vorschlag.
 */
import { type MaturityInputs, type MaturityPoint, decimalAge, inMaturityAgeRange, maturityHistory, roundPercent } from './maturity';
import type { Measurement } from './measurement';

export type BioBand = 1 | 2 | 3 | 4;

export interface BioBandInfo {
  readonly band: BioBand;
  readonly label: string;
}

export const BIO_BANDS: readonly BioBandInfo[] = [
  { band: 1, label: 'unter 85 %' },
  { band: 2, label: '85 bis unter 90 %' },
  { band: 3, label: '90 bis 95 %' },
  { band: 4, label: 'über 95 %' },
];

/** Hinweistext für den Trainer: wozu Bio-Banding gut ist. */
export const BIO_BANDING_HINT =
  'Bio-Banding teilt Spieler nach körperlicher Reife statt nach Alter ein. Früh entwickelte Spieler können sich dann nicht mehr auf ihre Kraft verlassen und spielen technischer, spät entwickelte übernehmen mehr Verantwortung. Das ist nur ein Vorschlag aus dem Reifestand, der Trainer entscheidet.';

/** Band zum Prozentwert der erwarteten Erwachsenengröße (geprüft am auf 0,1 gerundeten Wert). */
export function bioBand(percent: number): BioBand {
  const rounded = roundPercent(percent);
  if (rounded < 85) return 1;
  if (rounded < 90) return 2;
  if (rounded <= 95) return 3;
  return 4;
}

export interface BioBandingPlayer {
  readonly id: string;
  readonly name: string;
  readonly birthdate: string;
}

export interface BioBandingData {
  readonly inputs: MaturityInputs;
  readonly measurements: readonly Measurement[];
}

export interface BioBandingMember {
  readonly id: string;
  readonly name: string;
  readonly point: MaturityPoint;
}

export interface BioBandingGroup extends BioBandInfo {
  /** Spieler dieses Bandes, aufsteigend nach Prozent. */
  readonly players: readonly BioBandingMember[];
}

export interface BioBandingSuggestion {
  /** Immer alle vier Bänder, auch leere. */
  readonly groups: readonly BioBandingGroup[];
  /** Spieler ohne Vorschlag (kein Reifestand, außerhalb 12–15 Jahren oder Daten nicht geladen). */
  readonly withoutValue: number;
}

/**
 * Vorschlag für Gruppen. `data` ist null/fehlt für einen Spieler, dessen Angaben nicht geladen werden konnten – er zählt
 * dann zu den Spielern ohne Vorschlag. `today` bestimmt, wer 12 bis 15 Jahre alt ist.
 */
export function suggestBioBanding(players: readonly BioBandingPlayer[], data: ReadonlyMap<string, BioBandingData | null>, today: string): BioBandingSuggestion {
  const members: Record<BioBand, BioBandingMember[]> = { 1: [], 2: [], 3: [], 4: [] };
  let withoutValue = 0;
  for (const player of players) {
    const entry = data.get(player.id);
    const point = entry && inMaturityAgeRange(decimalAge(player.birthdate, today)) ? maturityHistory(entry.measurements, player.birthdate, entry.inputs).at(-1) : undefined;
    if (!point) {
      withoutValue += 1;
      continue;
    }
    members[bioBand(point.percent)].push({ id: player.id, name: player.name, point });
  }
  const groups = BIO_BANDS.map((info) => ({
    ...info,
    players: members[info.band].sort((a, b) => a.point.percent - b.point.percent || a.name.localeCompare(b.name, 'de')),
  }));
  return { groups, withoutValue };
}
