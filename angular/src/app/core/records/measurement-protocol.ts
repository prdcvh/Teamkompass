/**
 * Messassistent (SCRUM-253): Wiederholungsmessungen, Auswahlregel für den verwendeten Wert und Qualitätskennzeichen.
 * Reine Rechenfunktionen ohne Angular.
 *
 * Fachliche Grenzwerte: Methodenversion 1.0, docs/reife-kompass-methoden.md §6 (SCRUM-251), sofern nicht als
 * "eigener Vorschlagswert" markiert.
 *
 * Einheiten: Längen immer in cm, Gewicht immer in kg – genau so, wie sie eingegeben und gespeichert werden. Es gibt
 * keine Umrechnung zwischen Einheiten. Der Sitzkasten wird genau an einer Stelle abgezogen ({@link sittingNet}), und
 * zwar immer aus den gespeicherten Rohwerten (abgelesene Gesamthöhe + Kastenhöhe), nie aus einem bereits bereinigten
 * Wert. Toleranzen werden in Zehnteln (mm bzw. 100 g) als ganze Zahlen verglichen, damit Kommazahlen-Rundung nicht
 * über "dritte Messung ja/nein" entscheidet.
 */

/** Methodenversion, nach der eine Messung erfasst wurde (wird je Messung gespeichert). */
export const MEASUREMENT_PROTOCOL = '1.0';

/** Methodenversion 1.0 §6: Größe – ab 0,4 cm (4 mm) Unterschied eine dritte Messung. Angabe in Zehnteln (mm). */
export const HEIGHT_TOLERANCE_TENTHS = 4;
/** Methodenversion 1.0 §6: Gewicht – ab 0,4 kg Unterschied eine dritte Messung. Angabe in Zehnteln (100 g). */
export const WEIGHT_TOLERANCE_TENTHS = 4;
/** Methodenversion 1.0 §6: Sitzhöhe – ab 0,4 cm (4 mm) Unterschied eine dritte Messung. Angabe in Zehnteln (mm). */
export const SITTING_TOLERANCE_TENTHS = 4;
/** Methodenversion 1.0 §6: Größe wird mindestens zweimal gemessen. Gewicht und Sitzhöhe dürfen einmal gemessen sein. */
export const HEIGHT_MIN_READINGS = 2;
/** Höchstens so viele Wiederholungen je Wert. */
export const MAX_READINGS = 3;

/** Harte Eingabegrenzen (darunter/darüber kann es kein Messwert in cm bzw. kg sein, z. B. Größe in Metern eingegeben). */
export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 250;
export const MIN_WEIGHT_KG = 1;
export const MAX_WEIGHT_KG = 250;
export const MIN_SITTING_CM = 30;
export const MAX_SITTING_CM = 150;
export const MAX_BOX_CM = 100;

/** EIGENER VORSCHLAGSWERT (nicht aus SCRUM-251): plausibler Bereich für Jugendspieler; außerhalb "prüfen". */
export const PLAUSIBLE_HEIGHT_CM: readonly [number, number] = [100, 210];
/** EIGENER VORSCHLAGSWERT: plausibler Gewichtsbereich für Jugendspieler; außerhalb "prüfen". */
export const PLAUSIBLE_WEIGHT_KG: readonly [number, number] = [20, 150];
/** EIGENER VORSCHLAGSWERT: Anteil Sitzhöhe an der Größe (Sitzhöhenindex); außerhalb "prüfen" (z. B. Sitzkasten vergessen). */
export const PLAUSIBLE_SITTING_RATIO: readonly [number, number] = [0.45, 0.6];
/** Methodenversion 1.0 §6: ab 0,4 cm kleiner als die vorige Messung "prüfen" (Kinder schrumpfen nicht). In Zehnteln. */
export const HEIGHT_DROP_TENTHS = 4;
/** EIGENER VORSCHLAGSWERT, gleicher Wert wie in SCRUM-254: mehr als 20 cm/Jahr gegenüber der vorigen Messung = Ausreißer. */
export const OUTLIER_RATE_CM_PER_YEAR = 20;
/** EIGENER VORSCHLAGSWERT: bei weniger als 30 Tagen Abstand gilt ein Zuwachs ab 2 cm als Ausreißer (keine Rate). */
export const SHORT_INTERVAL_DAYS = 30;
export const SHORT_INTERVAL_JUMP_CM = 2;

/**
 * Messqualität – gleiche Werte und Bedeutung wie `MeasurementQuality` in SCRUM-254 (growth-velocity.ts):
 * - `undocumented`: Bestandsmessung von vor dem Messassistenten (im Dokument fehlt `quality`),
 * - `verified`: nach Protokoll gemessen, unauffällig,
 * - `flagged`: zur Prüfung markiert (Wiederholungen streuen zu stark oder ein Wert ist unplausibel).
 */
export type MeasurementQuality = 'undocumented' | 'verified' | 'flagged';

export const QUALITY_TEXT: Readonly<Record<MeasurementQuality, string>> = {
  undocumented: 'Messqualität nicht dokumentiert',
  verified: 'Messung geprüft',
  flagged: 'Messung prüfen',
};

export type MeasurementFlag =
  | 'height-spread'
  | 'weight-spread'
  | 'sitting-spread'
  | 'height-range'
  | 'weight-range'
  | 'sitting-ratio'
  | 'height-drop'
  | 'height-jump';

export const FLAG_TEXT: Readonly<Record<MeasurementFlag, string>> = {
  'height-spread': 'Größe: Auch nach der 3. Messung liegen keine zwei Werte innerhalb von 0,4 cm. Verwendet wird der mittlere Wert.',
  'weight-spread': 'Gewicht: Auch nach der 3. Messung liegen keine zwei Werte innerhalb von 0,4 kg. Verwendet wird der mittlere Wert.',
  'sitting-spread': 'Sitzhöhe: Auch nach der 3. Messung liegen keine zwei Werte innerhalb von 0,4 cm. Verwendet wird der mittlere Wert.',
  'height-range': `Größe außerhalb von ${PLAUSIBLE_HEIGHT_CM[0]}–${PLAUSIBLE_HEIGHT_CM[1]} cm – ungewöhnlich für Jugendspieler.`,
  'weight-range': `Gewicht außerhalb von ${PLAUSIBLE_WEIGHT_KG[0]}–${PLAUSIBLE_WEIGHT_KG[1]} kg – ungewöhnlich für Jugendspieler.`,
  'sitting-ratio': 'Sitzhöhe passt nicht zur Größe (unter 45 % oder über 60 %). Sitzkasten richtig berücksichtigt?',
  'height-drop': 'Größe mindestens 0,4 cm kleiner als bei der vorigen Messung.',
  'height-jump': 'Größe deutlich höher als bei der vorigen Messung (mehr als 20 cm pro Jahr).',
};

/** Ergebnis einer Messreihe (Größe, Gewicht oder Sitzhöhe). */
export interface SeriesResult {
  /** Gültige Rohwerte in Eingabereihenfolge. */
  readonly readings: readonly number[];
  /** Verwendeter Wert (Median); null, solange die Reihe nicht vollständig ist. */
  readonly value: number | null;
  /** Noch eine Messung nötig (zweite bei der Größe, dritte bei Abweichung ab Toleranz). */
  readonly needs: 'none' | 'second' | 'third';
  /** Nach drei Messungen liegen keine zwei Werte innerhalb der Toleranz. */
  readonly spread: boolean;
  /** Größter Abstand zwischen zwei Rohwerten. */
  readonly range: number;
}

/** Zehntel als ganze Zahl (mm bei cm, 100 g bei kg), damit 0,1 + 0,3 nicht 0,39999 ergibt. */
function tenths(value: number): number {
  return Math.round(value * 10);
}

function differsTenths(a: number, b: number): number {
  return Math.abs(tenths(a) - tenths(b));
}

/** Auf zwei Nachkommastellen, um Kommazahlen-Reste zu vermeiden (z. B. Mittelwert 150,25). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Median: 1 Wert = der Wert, 2 Werte = Mittelwert, 3 Werte = der mittlere. */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round2(sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Auswahlregel (Methodenversion 1.0 §6): Weichen die ersten beiden Werte um die Toleranz oder mehr voneinander ab,
 * wird eine dritte Messung verlangt. Verwendet wird der Median aller Wiederholungen. Liegen nach drei Messungen keine
 * zwei Werte innerhalb der Toleranz, wird trotzdem der Median verwendet und die Reihe als "prüfen" markiert – nichts
 * wird verworfen oder still korrigiert, die Rohwerte bleiben erhalten.
 */
export function evaluateSeries(readings: readonly number[], toleranceTenths: number, minReadings: number): SeriesResult {
  const values = readings.slice(0, MAX_READINGS);
  const range = values.length ? round2(Math.max(...values) - Math.min(...values)) : 0;
  if (values.length === 0) return { readings: values, value: null, needs: 'none', spread: false, range };
  if (values.length < minReadings) return { readings: values, value: null, needs: 'second', spread: false, range };
  if (values.length === 2 && differsTenths(values[0], values[1]) >= toleranceTenths) {
    return { readings: values, value: null, needs: 'third', spread: false, range };
  }
  const spread =
    values.length === 3 &&
    differsTenths(values[0], values[1]) >= toleranceTenths &&
    differsTenths(values[0], values[2]) >= toleranceTenths &&
    differsTenths(values[1], values[2]) >= toleranceTenths;
  return { readings: values, value: median(values), needs: 'none', spread, range };
}

/** Sitzhöhe ohne Sitzkasten: abgelesene Gesamthöhe minus Kastenhöhe (0 = bereits bereinigt eingegeben). */
export function sittingNet(reading: number, boxCm: number): number {
  return round2(reading - boxCm);
}

/** Beinlänge = Größe − Sitzhöhe, nur aus gültigen Werten (beide vorhanden, Sitzhöhe kleiner als Größe). */
export function legLengthCm(heightCm: number | null | undefined, sittingCm: number | null | undefined): number | null {
  if (!heightCm || !sittingCm || !(heightCm > 0) || !(sittingCm > 0) || sittingCm >= heightCm) return null;
  return round2(heightCm - sittingCm);
}

/** Dezimalalter (Jahre) am Messtag; ungültige Daten oder Messtag vor der Geburt → null. */
export function decimalAgeAt(birthdate: string, date: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(birthdate) || !iso.test(date)) return null;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${birthdate}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days >= 0 ? days / 365.25 : null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Vergleichsmessung für die Ausreißerprüfung: die jüngste frühere Messung mit Größe. */
export interface PreviousHeight {
  readonly date: string;
  readonly height: number;
}

/** Ausreißer gegenüber der vorigen Messung (Rückgang ab 0,4 cm oder unplausibel starker Zuwachs). */
export function heightTrendFlag(date: string, height: number, previous: PreviousHeight | null): MeasurementFlag | null {
  if (!previous || previous.date >= date) return null;
  const diff = height - previous.height;
  if (tenths(previous.height) - tenths(height) >= HEIGHT_DROP_TENTHS) return 'height-drop';
  const days = daysBetween(previous.date, date);
  if (days < SHORT_INTERVAL_DAYS) return diff >= SHORT_INTERVAL_JUMP_CM ? 'height-jump' : null;
  return (diff / days) * 365.25 > OUTLIER_RATE_CM_PER_YEAR ? 'height-jump' : null;
}

/** Plausibilitäts-Kennzeichen aus den verwendeten Werten (ohne Vergleich mit anderen Messungen). */
export function rangeFlags(height: number | null, weight: number | null, sitting: number | null): MeasurementFlag[] {
  const flags: MeasurementFlag[] = [];
  if (height !== null && (height < PLAUSIBLE_HEIGHT_CM[0] || height > PLAUSIBLE_HEIGHT_CM[1])) flags.push('height-range');
  if (weight !== null && (weight < PLAUSIBLE_WEIGHT_KG[0] || weight > PLAUSIBLE_WEIGHT_KG[1])) flags.push('weight-range');
  if (height !== null && sitting !== null) {
    const ratio = sitting / height;
    if (ratio < PLAUSIBLE_SITTING_RATIO[0] || ratio > PLAUSIBLE_SITTING_RATIO[1]) flags.push('sitting-ratio');
  }
  return flags;
}

/** Zahl mit Komma und höchstens zwei Nachkommastellen (150,25). */
export function decimalText(value: number, digits = 2): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor).replace('.', ',');
}
