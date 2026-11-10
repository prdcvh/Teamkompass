/**
 * Reife-Kompass (SCRUM-190): Reifestand als Prozent der erwarteten Erwachsenengröße nach Khamis & Roche.
 *
 * QUELLE
 *   Khamis HJ, Roche AF. Predicting adult stature without using skeletal age: the Khamis-Roche method.
 *   Pediatrics 1994;94(4):504–507. Korrektur (Erratum): Pediatrics 1995;95(3):457.
 *   Modell: erwartete Erwachsenengröße (Zoll) = β0 + β1 · Größe (Zoll) + β2 · Gewicht (Pfund) + β3 · Mittelelterngröße
 *   (Zoll), Mittelelterngröße = (Mutter + Vater) / 2. Koeffizienten je Geschlecht und je halbem Lebensjahr (4,0–17,5).
 *   Entwickelt an 223 Jungen und 210 Mädchen der Fels Longitudinal Study (weiße US-Kinder) – für andere
 *   Bevölkerungsgruppen eine Schätzung (Fehler ca. ±5 cm, 90-%-Bereich).
 *
 * KOEFFIZIENTEN (Stand des Erratums 1995)
 *   Das Original war für uns nicht abrufbar (Verlagsseite gesperrt). Die Tabelle unten stammt aus zwei voneinander
 *   unabhängigen Abschriften, die in allen 224 Werten übereinstimmen:
 *   - UW MSK Radiology Web Lab, „Adult Stature Predictor“ (M. L. Richardson, http://uwmsk.org/stature.html),
 *     Gewichts-Spalte laut Quelltext am 20.04.2007 „as in errata … Pediatrics 1995;95:457“ korrigiert;
 *   - calcvita.com „Khamis-Roche Height Prediction Calculator“ (Tabelle „erratum-corrected coefficients“).
 *   Intercept, Größe und Mittelelterngröße stimmen außerdem mit dem R-Paket matuR (CRAN 0.0.1.0) überein; dort steht
 *   die Gewichts-Spalte noch um den Faktor 10 zu klein (der Fehler, den das Erratum behebt). Gegenprobe: die
 *   Beispielrechnung „Player A/B“ aus Cumming et al. (Bio-Banding, Sport for Life 2017) wird mit dieser Tabelle exakt
 *   getroffen (184,7 cm / 93,4 %), mit der unkorrigierten nicht (siehe maturity.spec.ts).
 *
 * EINHEITEN
 *   Die App speichert cm und kg: 1 Zoll = 2,54 cm, 1 Pfund = 0,45359237 kg (exakte Definitionen). Gerechnet wird
 *   ungerundet; erst das Ergebnis wird für die Anzeige gerundet.
 *
 * ALTER
 *   Dezimalalter am Messtag (Tage seit Geburt / 365,25). Koeffizientenzeile = nächstes halbe Jahr (wie im UW-Rechner
 *   und in matuR, z. B. 13,2 → 13,0; 13,3 → 13,5). Angezeigt wird der Reifestand nur für 12- bis 15-Jährige
 *   (PO-Entscheidung 02.11.2026, wie die Premier League): Dezimalalter ≥ 12 und < 16.
 *
 * EINORDNUNG (PO-Entscheidung 02.11.2026)
 *   unter 85 % = spät entwickelt, 85–95 % = im Schnitt, über 95 % = früh entwickelt – geprüft am auf eine
 *   Nachkommastelle gerundeten Prozentwert (so, wie er angezeigt wird). Fachliche Prüfung der Grenzen: SCRUM-251.
 */
import type { ConsentStatus } from '../player/player';
import { isIsoDate } from '../shared/dates';
import { type Measurement, sortedMeasurements } from './measurement';

export type MaturitySex = 'm' | 'f';

/** [Alter, β0 (Intercept), β1 (Größe, Zoll), β2 (Gewicht, Pfund), β3 (Mittelelterngröße, Zoll)] */
type CoefficientRow = readonly [number, number, number, number, number];

/** Jungen, 4,0–17,5 Jahre (Khamis & Roche 1994, Gewicht nach Erratum 1995). */
const BOYS: readonly CoefficientRow[] = [
  [4.0, -10.2567, 1.23812, -0.087235, 0.50286],
  [4.5, -10.719, 1.15964, -0.074454, 0.52887],
  [5.0, -11.0213, 1.10674, -0.064778, 0.53919],
  [5.5, -11.1556, 1.0748, -0.05776, 0.53691],
  [6.0, -11.1138, 1.05923, -0.052947, 0.52513],
  [6.5, -11.0221, 1.05542, -0.049892, 0.50692],
  [7.0, -10.9984, 1.05877, -0.048144, 0.48538],
  [7.5, -11.0214, 1.06467, -0.047256, 0.46361],
  [8.0, -11.0696, 1.06853, -0.046778, 0.44469],
  [8.5, -11.122, 1.06572, -0.046261, 0.43171],
  [9.0, -11.1571, 1.05166, -0.045254, 0.42776],
  [9.5, -11.1405, 1.02174, -0.043311, 0.43593],
  [10.0, -11.038, 0.97135, -0.039981, 0.45932],
  [10.5, -10.8286, 0.89589, -0.034814, 0.50101],
  [11.0, -10.4917, 0.81239, -0.02905, 0.54781],
  [11.5, -10.0065, 0.74134, -0.024167, 0.58409],
  [12.0, -9.3522, 0.68325, -0.020076, 0.60927],
  [12.5, -8.6055, 0.63869, -0.016681, 0.62279],
  [13.0, -7.8632, 0.60818, -0.013895, 0.62407],
  [13.5, -7.1348, 0.59228, -0.011624, 0.61253],
  [14.0, -6.4299, 0.59151, -0.009776, 0.58762],
  [14.5, -5.7578, 0.60643, -0.008261, 0.54875],
  [15.0, -5.1282, 0.63757, -0.006988, 0.49536],
  [15.5, -4.5092, 0.68548, -0.005863, 0.42687],
  [16.0, -3.9292, 0.75069, -0.004795, 0.34271],
  [16.5, -3.4873, 0.83375, -0.003695, 0.24231],
  [17.0, -3.283, 0.9352, -0.00247, 0.1251],
  [17.5, -3.4156, 1.05558, -0.001027, -0.0095],
];

/** Mädchen, 4,0–17,5 Jahre (Khamis & Roche 1994, Gewicht nach Erratum 1995). */
const GIRLS: readonly CoefficientRow[] = [
  [4.0, -8.1325, 1.24768, -0.19435, 0.44774],
  [4.5, -6.47656, 1.22177, -0.18519, 0.41381],
  [5.0, -5.13582, 1.19932, -0.1753, 0.38467],
  [5.5, -4.13791, 1.1788, -0.16484, 0.36039],
  [6.0, -3.51039, 1.15866, -0.154, 0.34105],
  [6.5, -3.14322, 1.13737, -0.14294, 0.32672],
  [7.0, -2.87645, 1.11342, -0.13184, 0.31748],
  [7.5, -2.66291, 1.08525, -0.12086, 0.3134],
  [8.0, -2.45559, 1.05135, -0.11019, 0.31457],
  [8.5, -2.20728, 1.01018, -0.09999, 0.32105],
  [9.0, -1.87098, 0.9602, -0.09044, 0.33291],
  [9.5, -1.0633, 0.89989, -0.08171, 0.35025],
  [10.0, 0.33468, 0.82771, -0.07397, 0.37312],
  [10.5, 1.97366, 0.74213, -0.06739, 0.40161],
  [11.0, 3.50436, 0.67173, -0.06136, 0.42042],
  [11.5, 4.57747, 0.6415, -0.05518, 0.41686],
  [12.0, 4.84365, 0.64452, -0.04894, 0.3949],
  [12.5, 4.27869, 0.67386, -0.04272, 0.3585],
  [13.0, 3.21417, 0.7226, -0.03661, 0.31163],
  [13.5, 1.83456, 0.78383, -0.03067, 0.25826],
  [14.0, 0.32425, 0.85062, -0.025, 0.20235],
  [14.5, -1.13224, 0.91605, -0.01967, 0.14787],
  [15.0, -2.35055, 0.97319, -0.01477, 0.0988],
  [15.5, -3.10326, 1.01514, -0.01037, 0.05909],
  [16.0, -3.17885, 1.03496, -0.00655, 0.03272],
  [16.5, -2.41657, 1.02573, -0.0034, 0.02364],
  [17.0, -0.65579, 0.98054, -0.001, 0.03584],
  [17.5, 2.26429, 0.89246, 0.00057, 0.07327],
];

export const KHAMIS_ROCHE_COEFFICIENTS: Readonly<Record<MaturitySex, readonly CoefficientRow[]>> = { m: BOYS, f: GIRLS };

export const CM_PER_INCH = 2.54;
export const KG_PER_POUND = 0.45359237;

/** Anzeige nur für 12- bis 15-Jährige (PO, 02.11.2026): Dezimalalter ≥ 12 und < 16. */
export const MATURITY_MIN_AGE = 12;
export const MATURITY_MAX_AGE_EXCLUSIVE = 16;

/** Grenzen der Einordnung (PO, 02.11.2026): unter 85 % spät, 85–95 % im Schnitt, über 95 % früh. */
export const LATE_BELOW_PERCENT = 85;
export const EARLY_ABOVE_PERCENT = 95;

/** Erlaubte Größe eines Elternteils (cm); gleiche Grenzen in firestore.rules (maturity). */
export const MIN_PARENT_HEIGHT_CM = 100;
export const MAX_PARENT_HEIGHT_CM = 250;

/** Dezimalalter (Jahre) am Tag `date`; ungültige Daten → null. */
export function decimalAge(birthdate: string, date: string): number | null {
  if (!isIsoDate(birthdate) || !isIsoDate(date)) return null;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${birthdate}T00:00:00Z`)) / 86_400_000;
  return days < 0 ? null : days / 365.25;
}

/** Koeffizientenzeile zum nächsten halben Jahr; außerhalb 4,0–17,5 → null. */
export function coefficientsFor(sex: MaturitySex, age: number): CoefficientRow | null {
  if (!Number.isFinite(age)) return null;
  const halfYear = Math.round(age * 2) / 2;
  return KHAMIS_ROCHE_COEFFICIENTS[sex].find((row) => row[0] === halfYear) ?? null;
}

/**
 * Erwartete Erwachsenengröße (cm) nach Khamis & Roche. Eingaben in cm/kg, gerechnet in Zoll/Pfund wie im Original.
 * null, wenn das Alter außerhalb der Tabelle (4,0–17,5) liegt oder ein Wert fehlt.
 */
export function predictedAdultHeightCm(sex: MaturitySex, age: number, heightCm: number, weightKg: number, midParentCm: number): number | null {
  const row = coefficientsFor(sex, age);
  if (!row || !(heightCm > 0) || !(weightKg > 0) || !(midParentCm > 0)) return null;
  const [, b0, bHeight, bWeight, bMidParent] = row;
  const inches = b0 + bHeight * (heightCm / CM_PER_INCH) + bWeight * (weightKg / KG_PER_POUND) + bMidParent * (midParentCm / CM_PER_INCH);
  return inches * CM_PER_INCH;
}

export type MaturityBand = 'late' | 'average' | 'early';

export const MATURITY_BAND_LABELS: Readonly<Record<MaturityBand, string>> = {
  late: 'spät entwickelt',
  average: 'im Schnitt',
  early: 'früh entwickelt',
};

/** Prozentwert auf eine Nachkommastelle (so wird er angezeigt und eingeordnet). */
export function roundPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}

/** Einordnung am gerundeten Prozentwert: < 85 spät, 85–95 im Schnitt, > 95 früh. */
export function maturityBand(percent: number): MaturityBand {
  const rounded = roundPercent(percent);
  if (rounded < LATE_BELOW_PERCENT) return 'late';
  if (rounded > EARLY_ABOVE_PERCENT) return 'early';
  return 'average';
}

/** Angaben für die Berechnung (Dokument `players/{id}/maturity/parents`). */
export interface MaturityInputs {
  /** Geschlecht für die Koeffizienten; null = nicht angegeben (dann kein Wert). */
  readonly sex: MaturitySex | null;
  /** Eltern sind mit der Speicherung ihrer Größe einverstanden (ohne Häkchen keine Größen). */
  readonly parentsConsent: boolean;
  /** cm; null = nicht erfasst. */
  readonly motherHeight: number | null;
  readonly fatherHeight: number | null;
  /**
   * Nachweis des Einverständnisses der Eltern (SCRUM-252): Tag (JJJJ-MM-TT), an dem ein Trainer das Häkchen gesetzt
   * hat, und wer (E-Mail zur Anzeige, Konto-ID für die Regeln). Leer = nicht dokumentiert (ältere Einträge von vor
   * SCRUM-252 oder kein Häkchen).
   */
  readonly parentsConsentDate?: string;
  readonly parentsConsentBy?: string;
  readonly parentsConsentByUid?: string;
}

export const EMPTY_MATURITY_INPUTS: MaturityInputs = { sex: null, parentsConsent: false, motherHeight: null, fatherHeight: null };

export interface MaturityPoint {
  readonly date: string;
  /** Dezimalalter am Messtag. */
  readonly age: number;
  readonly heightCm: number;
  readonly predictedAdultCm: number;
  /** Ungerundet; Anzeige über {@link roundPercent}. */
  readonly percent: number;
  readonly band: MaturityBand;
}

/**
 * Widerruf (SCRUM-252, Logik aus SCRUM-245): Ist die Einwilligung des Spielers widerrufen, rechnet die App keinen
 * Reifestand mehr – weder im Profil noch im Bio-Banding-Vorschlag. Gelöscht wird dabei nichts (das macht der Trainer
 * von Hand über die Aufgabe „Gesundheitsdaten prüfen und löschen“).
 */
export function maturityStopped(player: { readonly consentStatus?: ConsentStatus } | null | undefined): boolean {
  return player?.consentStatus === 'revoked';
}

/** Text in der Karte, wenn die Berechnung gestoppt ist. */
export const MATURITY_STOPPED_TEXT =
  'Die Einwilligung ist widerrufen. Der Reifestand wird deshalb nicht mehr berechnet und lässt sich nicht ergänzen. Gespeicherte Angaben der Eltern kannst du oben bei der Einwilligung unter „Gesundheitsdaten prüfen und löschen“ löschen.';

/**
 * Die Angaben, mit denen tatsächlich gerechnet werden darf: bei widerrufener Einwilligung keine (dann erscheint kein
 * Wert), sonst die gespeicherten. Jede Ansicht, die einen Reifestand zeigt, rechnet über diese Funktion.
 */
export function maturityInputsForCalculation(inputs: MaturityInputs, player: { readonly consentStatus?: ConsentStatus } | null | undefined): MaturityInputs {
  return maturityStopped(player) ? EMPTY_MATURITY_INPUTS : inputs;
}

/** Ist überhaupt etwas gespeichert (Geschlecht, Häkchen oder eine Größe)? Für die Lösch-Aufgabe beim Widerruf. */
export function hasMaturityData(inputs: MaturityInputs): boolean {
  return !!inputs.sex || inputs.parentsConsent || inputs.motherHeight !== null || inputs.fatherHeight !== null;
}

/** Mittelelterngröße (cm) oder null, wenn die Einwilligung oder eine Größe fehlt. */
export function midParentHeight(inputs: MaturityInputs): number | null {
  if (!inputs.parentsConsent || !inputs.motherHeight || !inputs.fatherHeight) return null;
  return (inputs.motherHeight + inputs.fatherHeight) / 2;
}

/** Alter im Anzeigebereich (12–15 Jahre)? */
export function inMaturityAgeRange(age: number | null): age is number {
  return age !== null && age >= MATURITY_MIN_AGE && age < MATURITY_MAX_AGE_EXCLUSIVE;
}

/** Reifestand an einer Messung; null ohne Geschlecht, Elterngröße, Größe+Gewicht oder außerhalb von 12–15 Jahren. */
export function maturityAt(measurement: Measurement, birthdate: string, inputs: MaturityInputs): MaturityPoint | null {
  const midParent = midParentHeight(inputs);
  const age = decimalAge(birthdate, measurement.date);
  if (!inputs.sex || midParent === null || !inMaturityAgeRange(age) || !measurement.height || !measurement.weight) return null;
  const predicted = predictedAdultHeightCm(inputs.sex, age, measurement.height, measurement.weight, midParent);
  if (predicted === null || !(predicted > 0)) return null;
  const percent = (measurement.height / predicted) * 100;
  return { date: measurement.date, age, heightCm: measurement.height, predictedAdultCm: predicted, percent, band: maturityBand(percent) };
}

/** Verlauf: Reifestand je Messung mit Größe und Gewicht im Alter 12–15, älteste zuerst. */
export function maturityHistory(measurements: readonly Measurement[], birthdate: string, inputs: MaturityInputs): MaturityPoint[] {
  return sortedMeasurements(measurements)
    .map((measurement) => maturityAt(measurement, birthdate, inputs))
    .filter((point): point is MaturityPoint => point !== null);
}

/** Was fehlt für einen Wert? (leere Liste = nichts) – in einfachen Worten für die Anzeige. */
export function missingMaturityInputs(inputs: MaturityInputs, birthdate: string, measurements: readonly Measurement[]): string[] {
  const missing: string[] = [];
  if (!isIsoDate(birthdate)) missing.push('Geburtsdatum');
  if (!inputs.sex) missing.push('Geschlecht für die Berechnung');
  if (!inputs.parentsConsent) missing.push('Einverständnis der Eltern zur Speicherung ihrer Größe');
  else if (!inputs.motherHeight || !inputs.fatherHeight) missing.push('Größe beider Eltern');
  const usable = measurements.some((entry) => entry.height && entry.weight && inMaturityAgeRange(decimalAge(birthdate, entry.date)));
  if (isIsoDate(birthdate) && !usable) missing.push('eine Messung mit Größe und Gewicht im Alter von 12 bis 15 Jahren');
  return missing;
}

/** Elterngröße aus dem Formular: '' → null, sonst Zahl im erlaubten Bereich, sonst NaN. */
export function parseParentHeight(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= MIN_PARENT_HEIGHT_CM && number <= MAX_PARENT_HEIGHT_CM ? number : Number.NaN;
}

/** Dokument → Angaben; unbekannte oder falsche Werte gelten als nicht erfasst. */
export function maturityInputsFromDoc(data: Readonly<Record<string, unknown>> | null): MaturityInputs {
  if (!data) return EMPTY_MATURITY_INPUTS;
  const sex = data['sex'] === 'm' || data['sex'] === 'f' ? data['sex'] : null;
  const parentsConsent = data['parentsConsent'] === true;
  const height = (value: unknown): number | null =>
    parentsConsent && typeof value === 'number' && value >= MIN_PARENT_HEIGHT_CM && value <= MAX_PARENT_HEIGHT_CM ? value : null;
  const text = (value: unknown): string => (parentsConsent && typeof value === 'string' ? value : '');
  return {
    sex,
    parentsConsent,
    motherHeight: height(data['motherHeight']),
    fatherHeight: height(data['fatherHeight']),
    parentsConsentDate: isIsoDate(text(data['parentsConsentDate'])) ? text(data['parentsConsentDate']) : '',
    parentsConsentBy: text(data['parentsConsentBy']),
    parentsConsentByUid: text(data['parentsConsentByUid']),
  };
}

/** Wer trägt gerade ein (für den Nachweis des Einverständnisses der Eltern)? */
export interface MaturityAuthor {
  readonly uid: string;
  readonly email: string;
  /** Heutiger Tag, JJJJ-MM-TT. */
  readonly today: string;
}

/**
 * Angaben aus dem Formular mit dem Nachweis des Einverständnisses (SCRUM-252): War das Häkchen schon gesetzt, bleibt
 * der bisherige Nachweis unverändert; wird es neu gesetzt, tragen sich Tag und Konto des Trainers ein; ohne Häkchen
 * gibt es keinen Nachweis (und keine Größen).
 */
export function withParentsConsentRecord(next: MaturityInputs, previous: MaturityInputs, author: MaturityAuthor): MaturityInputs {
  if (!next.parentsConsent) return { ...next, parentsConsentDate: '', parentsConsentBy: '', parentsConsentByUid: '' };
  if (previous.parentsConsent) {
    return { ...next, parentsConsentDate: previous.parentsConsentDate ?? '', parentsConsentBy: previous.parentsConsentBy ?? '', parentsConsentByUid: previous.parentsConsentByUid ?? '' };
  }
  return { ...next, parentsConsentDate: author.today, parentsConsentBy: author.email, parentsConsentByUid: author.uid };
}

/** Angaben → Dokument. Ohne Einverständnis werden die Größen der Eltern immer geleert (so verlangen es die Regeln). */
export function docFromMaturityInputs(playerId: string, inputs: MaturityInputs, updatedAt: string): Record<string, unknown> {
  return {
    playerId,
    sex: inputs.sex ?? '',
    parentsConsent: inputs.parentsConsent,
    motherHeight: inputs.parentsConsent ? inputs.motherHeight : null,
    fatherHeight: inputs.parentsConsent ? inputs.fatherHeight : null,
    // Nachweis des Einverständnisses (SCRUM-252); ohne Häkchen leer. Leerer Text wird als null gespeichert.
    parentsConsentDate: inputs.parentsConsent && inputs.parentsConsentDate ? inputs.parentsConsentDate : null,
    parentsConsentBy: inputs.parentsConsent && inputs.parentsConsentBy ? inputs.parentsConsentBy : null,
    parentsConsentByUid: inputs.parentsConsent && inputs.parentsConsentByUid ? inputs.parentsConsentByUid : null,
    updatedAt,
  };
}

/** „93,4 %“ */
export function percentText(percent: number): string {
  return `${String(roundPercent(percent)).replace('.', ',')} %`;
}
