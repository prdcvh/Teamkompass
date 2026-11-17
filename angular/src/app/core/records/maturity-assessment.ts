/**
 * Erklärung der Reifeeinordnung (SCRUM-256): Datengrundlage, Unsicherheit und widersprüchliche Hinweise. Reine
 * Rechenfunktionen ohne Angular; nichts davon wird gespeichert.
 *
 * Diese Datei ändert keine Zahl des Rechners (maturity.ts, Methodenversion 1.0). Sie entscheidet nur, ob die
 * Einordnung „früh / im Schnitt / spät“ (PO, 02.11.2026; bis SCRUM-386 weiter gültig, PO 17.11.2026 Option D) als
 * belastbar angezeigt wird oder als „nicht eingeordnet“ bzw. „Einordnung unsicher – prüfen“ mit den konkreten Ursachen.
 *
 * Regeln:
 * - Veraltet (Methodenversion 1.0 §6): Der jüngste Reifewert ist älter als 90 Tage → Wert bleibt mit Datum sichtbar,
 *   aber ohne Einordnung.
 * - Widersprüche: Es wird nie abgestimmt, gemittelt oder „die Mehrheit“ genommen. Jeder Hinweis, der dem jüngsten
 *   Wert widerspricht, führt zu „Einordnung unsicher – prüfen“ und wird einzeln genannt.
 * - Keine Prozent-Sicherheit: Die Fehlerbreite der Formel wird nur als Studienangabe genannt (9 von 10 Kindern der
 *   Studiengruppe), nie als Wahrscheinlichkeit für diesen Spieler.
 * - Keine automatische Einordnung der Wachstumsspitze (vor / um / nach PHV), kein Moore-Modell (§2, §5, §6).
 */
import { formatDate } from '../shared/dates';
import { analyzeGrowth } from './growth-velocity';
import {
  EARLY_ABOVE_PERCENT,
  LATE_BELOW_PERCENT,
  MATURITY_BAND_LABELS,
  MATURITY_MAX_AGE_EXCLUSIVE,
  MATURITY_METHOD_VERSION,
  MATURITY_MIN_AGE,
  type MaturityBand,
  type MaturityInputs,
  type MaturityPoint,
  type MaturitySex,
  decimalAge,
  maturityAt,
  missingMaturityInputs,
  percentText,
  roundPercent,
} from './maturity';
import { type Measurement, measurementQuality, sortedMeasurements } from './measurement';
import { FLAG_TEXT, type MeasurementQuality } from './measurement-protocol';

/** Methodenversion 1.0 §6: Reifewert älter als so viele Tage → „veraltet“, keine Einordnung. */
export const MATURITY_STALE_DAYS = 90;

/**
 * EIGENER VORSCHLAGSWERT (SCRUM-256, nicht aus SCRUM-251): Sinkt der Reifestand gegenüber dem vorigen Wert um so viele
 * Prozentpunkte oder mehr, ist das ein Widerspruch (bei normalem Wachstum steigt er). Kleinere Rückgänge entstehen
 * durch den Wechsel der Tabellenzeile am Vierteljahr (bis ca. 1 Prozentpunkt, Methodendokument §3.4).
 */
export const PAH_DROP_CHECK_POINTS = 1.5;

/**
 * 90-%-Fehlergrenze der geschätzten Erwachsenengröße laut Khamis & Roche (über den UW-Rechner, Methodendokument §3.5):
 * Jungen ±5,3 cm, Mädchen ±4,3 cm. Gilt für die Fels-Studiengruppe, ist kein Konfidenzintervall für ein Kind.
 */
export const ADULT_HEIGHT_ERROR_90_CM: Readonly<Record<MaturitySex, number>> = { m: 5.3, f: 4.3 };

export type MaturityAssessmentStatus = 'not-calculated' | 'stale' | 'uncertain' | 'classified';

/** Text des Status, wenn keine Einordnung gezeigt wird. */
export const ASSESSMENT_STATUS_TEXT: Readonly<Record<Exclude<MaturityAssessmentStatus, 'classified'>, string>> = {
  'not-calculated': 'nicht eingeordnet',
  stale: 'nicht eingeordnet – Messung veraltet',
  uncertain: 'Einordnung unsicher – prüfen',
};

export interface MaturityDataBasis {
  /** Messungen mit Größe (für die Wachstumskurve). */
  readonly heightCount: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  /** Messungen, aus denen ein Reifewert entsteht (Größe + Gewicht, Alter 12–15). */
  readonly usableCount: number;
  /** Messqualität der Messungen mit Größe. */
  readonly quality: Readonly<Record<MeasurementQuality, number>>;
  /** Alter des jüngsten Reifewerts in Tagen; null ohne Wert. */
  readonly latestAgeDays: number | null;
  /** Fehlende Angaben in einfachen Worten (wie `missingMaturityInputs`). */
  readonly missing: readonly string[];
  /** Messungen, die nicht zählen, und warum (außerhalb des Altersbereichs, ohne Gewicht). */
  readonly notCounted: readonly string[];
  /** Eingabestand der Angaben für die Berechnung (JJJJ-MM-TT) oder '' (unbekannt / nichts gespeichert). */
  readonly inputsDate: string;
  readonly methodVersion: string;
}

export interface MaturityRange {
  readonly lowPercent: number;
  readonly highPercent: number;
  /** Einordnungsgrenzen (85, 95), die in diesem Bereich liegen. */
  readonly boundaries: readonly number[];
  readonly errorCm: number;
}

export interface MaturityAssessment {
  readonly status: MaturityAssessmentStatus;
  /** Jüngster Reifewert (auch wenn veraltet oder unsicher; die Zahl bleibt mit Datum sichtbar). */
  readonly latest: MaturityPoint | null;
  /** Nur bei `classified` gesetzt. */
  readonly band: MaturityBand | null;
  /** Statustext: Einordnung oder „nicht eingeordnet“ / „Einordnung unsicher – prüfen“. */
  readonly statusText: string;
  /** Konkrete Ursachen für `stale`/`uncertain`/`not-calculated`. */
  readonly causes: readonly string[];
  readonly basis: MaturityDataBasis;
  readonly range: MaturityRange | null;
  /** Neuberechnung nach einer Korrektur der verwendeten Messung, sonst ''. */
  readonly recalculation: string;
  /** Verlauf, älteste zuerst, je Punkt mit Messqualität. */
  readonly history: readonly { readonly point: MaturityPoint; readonly quality: MeasurementQuality }[];
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** „etwa 91,7 % der geschätzten Erwachsenengröße (heute 166 cm, geschätzt ca. 181 cm erwachsen)“ */
export function pahSentence(heightCm: number, predictedAdultCm: number): string {
  const cm = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  return `etwa ${percentText((heightCm / predictedAdultCm) * 100)} der geschätzten Erwachsenengröße (heute ${cm(heightCm)} cm, geschätzt ca. ${Math.round(predictedAdultCm)} cm erwachsen)`;
}

/** Bereich des Reifestands, wenn die Erwachsenengröße um die 90-%-Fehlergrenze der Studie daneben läge. */
export function maturityRange(point: MaturityPoint, sex: MaturitySex): MaturityRange {
  const errorCm = ADULT_HEIGHT_ERROR_90_CM[sex];
  const lowPercent = roundPercent((point.heightCm / (point.predictedAdultCm + errorCm)) * 100);
  const highPercent = roundPercent((point.heightCm / (point.predictedAdultCm - errorCm)) * 100);
  const boundaries = [LATE_BELOW_PERCENT, EARLY_ABOVE_PERCENT].filter((limit) => lowPercent <= limit && limit <= highPercent);
  return { lowPercent, highPercent, boundaries, errorCm };
}

/**
 * Erklärung des Reifestands für die Anzeige. `inputs` sind die Angaben, mit denen gerechnet werden darf
 * (`maturityInputsForCalculation`, bei Widerruf leer) – diese Funktion umgeht den Widerruf nicht.
 */
export function assessMaturity(measurements: readonly Measurement[], birthdate: string, inputs: MaturityInputs, today: string): MaturityAssessment {
  const sorted = sortedMeasurements(measurements);
  const withHeight = sorted.filter((entry) => entry.height && entry.height > 0);
  const rows = sorted
    .map((measurement) => ({ measurement, point: maturityAt(measurement, birthdate, inputs) }))
    .filter((row): row is { measurement: Measurement; point: MaturityPoint } => row.point !== null);
  const history = rows.map((row) => ({ point: row.point, quality: measurementQuality(row.measurement) }));
  const last = rows.at(-1) ?? null;
  const previous = rows.at(-2) ?? null;
  const latest = last?.point ?? null;

  const quality: Record<MeasurementQuality, number> = { undocumented: 0, verified: 0, flagged: 0 };
  for (const entry of withHeight) quality[measurementQuality(entry)] += 1;

  const notCounted: string[] = [];
  const beforeRange = sorted.filter((entry) => {
    const age = decimalAge(birthdate, entry.date);
    return entry.height && entry.weight && age !== null && age < MATURITY_MIN_AGE;
  }).length;
  const afterRange = sorted.filter((entry) => {
    const age = decimalAge(birthdate, entry.date);
    return entry.height && entry.weight && age !== null && age >= MATURITY_MAX_AGE_EXCLUSIVE;
  }).length;
  const noWeight = withHeight.filter((entry) => !entry.weight).length;
  if (beforeRange) notCounted.push(`${count(beforeRange, 'Messung', 'Messungen')} vor dem 12. Geburtstag (außerhalb des Altersbereichs 12 bis 15 Jahre)`);
  if (afterRange) notCounted.push(`${count(afterRange, 'Messung', 'Messungen')} ab dem 16. Geburtstag (außerhalb des Altersbereichs 12 bis 15 Jahre)`);
  if (noWeight) notCounted.push(`${count(noWeight, 'Messung', 'Messungen')} ohne Gewicht (die Formel braucht Größe und Gewicht vom selben Tag)`);

  const latestAgeDays = latest ? Math.max(0, daysBetween(latest.date, today)) : null;
  const basis: MaturityDataBasis = {
    heightCount: withHeight.length,
    firstDate: withHeight[0]?.date ?? null,
    lastDate: withHeight.at(-1)?.date ?? null,
    usableCount: rows.length,
    quality,
    latestAgeDays,
    missing: missingMaturityInputs(inputs, birthdate, measurements),
    notCounted,
    inputsDate: inputs.updatedAt ? inputs.updatedAt.slice(0, 10) : '',
    methodVersion: MATURITY_METHOD_VERSION,
  };

  if (!last || !latest || !inputs.sex) {
    const causes = basis.missing.length ? [...basis.missing] : ['keine verwertbare Messung'];
    return { status: 'not-calculated', latest: null, band: null, statusText: ASSESSMENT_STATUS_TEXT['not-calculated'], causes, basis, range: null, recalculation: '', history };
  }

  // Widersprüchliche Hinweise zum jüngsten Wert – jeder einzeln, keine Abstimmung.
  const contradictions: string[] = [];
  if (measurementQuality(last.measurement) === 'flagged') {
    const flags = (last.measurement.flags ?? []).map((flag) => FLAG_TEXT[flag]);
    contradictions.push(`Die Messung vom ${formatDate(latest.date)} ist zur Prüfung markiert${flags.length ? `: ${flags.join(' ')}` : '.'}`);
  }
  const growth = analyzeGrowth(
    withHeight.map((entry) => ({ id: entry.id, date: entry.date, height: entry.height, quality: measurementQuality(entry) })),
    today,
  );
  for (const interval of growth.intervals) {
    if (interval.from.id !== last.measurement.id && interval.to.id !== last.measurement.id) continue;
    if (interval.status === 'negative') {
      contradictions.push(`Die Größe ist zwischen ${formatDate(interval.from.date)} und ${formatDate(interval.to.date)} um mindestens 0,4 cm gesunken – Kinder schrumpfen nicht, eine der Messungen ist vermutlich falsch.`);
    } else if (interval.status === 'outlier') {
      contradictions.push(`Die Größe ist zwischen ${formatDate(interval.from.date)} und ${formatDate(interval.to.date)} unplausibel stark gestiegen (mehr als 20 cm pro Jahr).`);
    }
  }
  if (previous && roundPercent(previous.point.percent) - roundPercent(latest.percent) >= PAH_DROP_CHECK_POINTS) {
    contradictions.push(
      `Der Reifestand ist von ${percentText(previous.point.percent)} (${formatDate(previous.point.date)}) auf ${percentText(latest.percent)} gesunken. Bei normalem Wachstum steigt er – Messungen oder Angaben prüfen.`,
    );
  }
  if (roundPercent(latest.percent) > 100) {
    contradictions.push('Der Wert liegt über 100 %: Der Spieler wäre schon größer als seine geschätzte Erwachsenengröße. Das liegt außerhalb dessen, was die Formel sinnvoll beschreibt.');
  }
  const newerWithoutWeight = withHeight.filter((entry) => entry.date > latest.date && !entry.weight);
  if (newerWithoutWeight.length) {
    contradictions.push(`Es gibt eine neuere Größenmessung (${formatDate(newerWithoutWeight.at(-1)!.date)}) ohne Gewicht. Der Wert beruht deshalb auf der älteren Messung vom ${formatDate(latest.date)}.`);
  }

  const stale = (latestAgeDays ?? 0) > MATURITY_STALE_DAYS;
  const staleCause = `Der jüngste Wert stammt vom ${formatDate(latest.date)} und ist ${latestAgeDays} Tage alt (mehr als ${MATURITY_STALE_DAYS} Tage). In drei Monaten können Jugendliche 2–3 cm wachsen.`;

  const range = maturityRange(latest, inputs.sex);
  const recalculation = recalculationText(last.measurement, birthdate, inputs, latest);

  if (contradictions.length) {
    const causes = stale ? [...contradictions, staleCause] : contradictions;
    return { status: 'uncertain', latest, band: null, statusText: ASSESSMENT_STATUS_TEXT.uncertain, causes, basis, range, recalculation, history };
  }
  if (stale) {
    return { status: 'stale', latest, band: null, statusText: ASSESSMENT_STATUS_TEXT.stale, causes: [staleCause], basis, range, recalculation, history };
  }
  return { status: 'classified', latest, band: latest.band, statusText: MATURITY_BAND_LABELS[latest.band], causes: [], basis, range, recalculation, history };
}

/** Neuberechnung nach einer Korrektur der verwendeten Messung (Änderungsprotokoll aus SCRUM-253). */
function recalculationText(measurement: Measurement, birthdate: string, inputs: MaturityInputs, now: MaturityPoint): string {
  const change = measurement.changes?.at(-1);
  if (!change) return '';
  const before = maturityAt({ ...measurement, height: change.before.height, weight: change.before.weight }, birthdate, inputs);
  const day = formatDate(change.at.slice(0, 10));
  const reason = change.reason ? ` (Grund: ${change.reason})` : '';
  return `Die Messung vom ${formatDate(measurement.date)} wurde am ${day} korrigiert${reason}. Neu berechnet: vorher ${before ? percentText(before.percent) : 'kein Wert'}, jetzt ${percentText(now.percent)}.`;
}

function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}
