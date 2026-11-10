/**
 * Messwerte eines Spielers (`players/{id}/measurements`): Modell, Prüfung, Umwandlung und BMI.
 *
 * Seit SCRUM-253 (Messassistent) trägt eine Messung neben dem verwendeten Wert (`height`, `weight` – daran hängen alle
 * Auswertungen wie bisher) auch Uhrzeit, Messstation, Rohwerte der Wiederholungen, Sitzhöhe, ein Qualitätskennzeichen
 * und ein Änderungsprotokoll. Alle neuen Felder sind optional: Bestandsmessungen ohne diese Felder bleiben gültig und
 * gelten als "Messqualität nicht dokumentiert"; fehlende Rohwerte werden nie erfunden.
 * Regeln und Grenzwerte: measurement-protocol.ts (Methodenversion 1.0, docs/reife-kompass-methoden.md §6).
 */
import { isIsoDate } from '../shared/dates';
import {
  HEIGHT_MIN_READINGS,
  HEIGHT_TOLERANCE_TENTHS,
  MAX_BOX_CM,
  MAX_HEIGHT_CM,
  MAX_READINGS,
  MAX_SITTING_CM,
  MAX_WEIGHT_KG,
  MEASUREMENT_PROTOCOL,
  MIN_HEIGHT_CM,
  MIN_SITTING_CM,
  MIN_WEIGHT_KG,
  type MeasurementFlag,
  type MeasurementQuality,
  type PreviousHeight,
  SITTING_TOLERANCE_TENTHS,
  type SeriesResult,
  WEIGHT_TOLERANCE_TENTHS,
  decimalAgeAt,
  decimalText,
  evaluateSeries,
  heightTrendFlag,
  legLengthCm,
  rangeFlags,
  sittingNet,
} from './measurement-protocol';

export { MAX_HEIGHT_CM, MAX_WEIGHT_KG } from './measurement-protocol';
export type { MeasurementFlag, MeasurementQuality } from './measurement-protocol';

/** Nachträgliche Änderung: wann, warum und welche verwendeten Werte vorher galten. */
export interface MeasurementChange {
  /** Zeitpunkt der Änderung (ISO, UTC). */
  readonly at: string;
  readonly reason: string;
  readonly before: { readonly height: number | null; readonly weight: number | null; readonly sittingHeight: number | null };
}

export interface Measurement {
  readonly id: string;
  readonly date: string;
  /** Verwendeter Wert in cm; null = nicht erfasst. Alle Auswertungen nutzen diesen Wert, nie die Rohwerte. */
  readonly height: number | null;
  /** Verwendeter Wert in kg; null = nicht erfasst. */
  readonly weight: number | null;
  /** Uhrzeit HH:MM (SCRUM-253). */
  readonly time?: string;
  /** Messstation / Messmethode, Freitext (SCRUM-253). */
  readonly station?: string;
  /** Methodenversion des Messassistenten; fehlt bei Bestandsmessungen. */
  readonly protocol?: string;
  /** Rohwerte Größe in cm, in Messreihenfolge. */
  readonly heightReadings?: readonly number[];
  /** Rohwerte Gewicht in kg. */
  readonly weightReadings?: readonly number[];
  /** Rohwerte Sitzhöhe in cm, so wie abgelesen (bei Sitzkasten: Gesamthöhe inkl. Kasten). */
  readonly sittingReadings?: readonly number[];
  /** Höhe des Sitzkastens in cm; 0/fehlt = Rohwerte sind bereits bereinigte Sitzhöhen. */
  readonly sittingBoxCm?: number;
  /** Verwendete, bereinigte Sitzhöhe in cm (ohne Kasten). */
  readonly sittingHeight?: number | null;
  /** Fehlt = `undocumented` (Bestandsmessung). Gleiche Werte wie in SCRUM-254. */
  readonly quality?: MeasurementQuality;
  readonly flags?: readonly MeasurementFlag[];
  readonly changes?: readonly MeasurementChange[];
}

export type SittingMode = 'box' | 'net';

export interface MeasurementDraft {
  readonly id: string | null;
  /** Bestandsmessung bearbeiten: ein Wert je Größe/Gewicht wie bisher, keine Rohwerte (werden nicht erfunden). */
  readonly legacy: boolean;
  readonly date: string;
  readonly time: string;
  readonly station: string;
  /** Größe: bis zu drei Messungen (Text wie eingegeben). */
  readonly height: readonly string[];
  readonly weight: readonly string[];
  readonly sitting: readonly string[];
  /** `box`: abgelesene Gesamthöhe inkl. Sitzkasten; `net`: bereits bereinigte Sitzhöhe. */
  readonly sittingMode: SittingMode;
  readonly boxHeight: string;
  /** Grund einer nachträglichen Änderung (Pflicht beim Bearbeiten). */
  readonly reason: string;
}

export type MeasurementErrors = Partial<Record<'date' | 'time' | 'station' | 'height' | 'weight' | 'sitting' | 'box' | 'reason', string>>;

/** Umgebung für die Prüfung: heute, Geburtsdatum und die übrigen Messungen des Spielers. */
export interface MeasurementContext {
  readonly today: string;
  /** Leer = unbekannt (dann keine Prüfung "vor der Geburt" und kein Alter). */
  readonly birthdate: string;
  /** Übrige Messungen (ohne die gerade bearbeitete). */
  readonly others: readonly Measurement[];
}

export interface MeasurementEvaluation {
  readonly errors: MeasurementErrors;
  readonly height: SeriesResult;
  readonly weight: SeriesResult;
  /** Rohwerte wie abgelesen; `value` ist bereits ohne Sitzkasten. */
  readonly sitting: SeriesResult;
  readonly boxCm: number;
  readonly flags: readonly MeasurementFlag[];
  /** Dezimalalter am Messtag. */
  readonly age: number | null;
  readonly legLength: number | null;
}

const STATION_MAX = 60;
const REASON_MAX = 200;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function blanks(values: readonly string[] = []): string[] {
  return Array.from({ length: MAX_READINGS }, (_, index) => values[index] ?? '');
}

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function emptyMeasurementDraft(today: string, time = '', station = ''): MeasurementDraft {
  return { id: null, legacy: false, date: today, time, station, height: blanks(), weight: blanks(), sitting: blanks(), sittingMode: 'box', boxHeight: '', reason: '' };
}

/**
 * Messung → Formular. Bei Messungen aus dem Messassistenten kommen die Rohwerte zurück ins Formular (nie der bereits
 * bereinigte Wert), damit der Sitzkasten beim erneuten Speichern nicht ein zweites Mal abgezogen wird.
 */
export function draftFromMeasurement(measurement: Measurement): MeasurementDraft {
  const base = { id: measurement.id, date: measurement.date, reason: '' };
  if (!measurement.protocol) {
    return {
      ...base,
      legacy: true,
      time: '',
      station: '',
      height: blanks([numberText(measurement.height)]),
      weight: blanks([numberText(measurement.weight)]),
      sitting: blanks(),
      sittingMode: 'box',
      boxHeight: '',
    };
  }
  const box = measurement.sittingBoxCm ?? 0;
  return {
    ...base,
    legacy: false,
    time: measurement.time ?? '',
    station: measurement.station ?? '',
    height: blanks((measurement.heightReadings ?? []).map(String)),
    weight: blanks((measurement.weightReadings ?? []).map(String)),
    sitting: blanks((measurement.sittingReadings ?? []).map(String)),
    sittingMode: box > 0 || !(measurement.sittingReadings ?? []).length ? 'box' : 'net',
    boxHeight: box > 0 ? String(box) : '',
  };
}

/** Text → Zahl; '' → null; ungültig → NaN. Komma oder Punkt als Dezimaltrenner. */
function parse(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** Rohwerte einer Reihe; `invalid`, wenn ein Wert keine Zahl oder außerhalb der Grenzen ist. */
function readings(values: readonly string[], min: number, max: number): { values: number[]; invalid: boolean } {
  const out: number[] = [];
  let invalid = false;
  for (const value of values.slice(0, MAX_READINGS)) {
    const number = parse(value);
    if (number === null) continue;
    if (Number.isNaN(number) || number < min || number > max) invalid = true;
    else out.push(number);
  }
  return { values: out, invalid };
}

/** Jüngste frühere Messung mit Größe, die nicht selbst zur Prüfung markiert ist. */
export function previousHeight(others: readonly Measurement[], date: string): PreviousHeight | null {
  let best: PreviousHeight | null = null;
  for (const entry of others) {
    if (entry.height === null || entry.quality === 'flagged' || entry.date >= date) continue;
    if (!best || entry.date > best.date) best = { date: entry.date, height: entry.height };
  }
  return best;
}

const NO_SERIES: SeriesResult = { readings: [], value: null, needs: 'none', spread: false, range: 0 };

/**
 * Prüft das Formular vollständig und bildet die verwendeten Werte. Fehler blockieren das Speichern
 * (Null/negativ, außerhalb der Grenzen, Sitzhöhe ≥ Größe, Datum vor Geburt oder in der Zukunft, fehlende Wiederholung).
 * Kennzeichen (`flags`) blockieren nicht, sondern markieren die Messung zur Prüfung.
 */
export function evaluateMeasurement(draft: MeasurementDraft, context: MeasurementContext): MeasurementEvaluation {
  const errors: MeasurementErrors = {};
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  else if (draft.date > context.today) errors.date = 'Das Messdatum liegt in der Zukunft.';
  else if (isIsoDate(context.birthdate) && draft.date < context.birthdate) errors.date = 'Das Messdatum liegt vor dem Geburtsdatum.';

  if (!draft.legacy) {
    if (!TIME.test(draft.time.trim())) errors.time = 'Bitte die Uhrzeit der Messung eingeben (z. B. 17:30).';
    if (draft.station.trim().length > STATION_MAX) errors.station = `Höchstens ${STATION_MAX} Zeichen.`;
  }
  if (draft.id !== null) {
    const reason = draft.reason.trim();
    if (reason.length < 3) errors.reason = 'Bitte kurz angeben, warum die Messung geändert wird.';
    else if (reason.length > REASON_MAX) errors.reason = `Höchstens ${REASON_MAX} Zeichen.`;
  }

  const heightIn = readings(draft.legacy ? draft.height.slice(0, 1) : draft.height, MIN_HEIGHT_CM, MAX_HEIGHT_CM);
  const weightIn = readings(draft.legacy ? draft.weight.slice(0, 1) : draft.weight, MIN_WEIGHT_KG, MAX_WEIGHT_KG);
  const height = evaluateSeries(heightIn.values, HEIGHT_TOLERANCE_TENTHS, draft.legacy ? 1 : HEIGHT_MIN_READINGS);
  const weight = evaluateSeries(weightIn.values, WEIGHT_TOLERANCE_TENTHS, 1);

  if (heightIn.invalid) errors.height = `Bitte jede Größe in cm eingeben (${MIN_HEIGHT_CM} bis ${MAX_HEIGHT_CM}).`;
  else if (height.needs === 'second') errors.height = 'Bitte die Größe ein zweites Mal messen und eintragen.';
  else if (height.needs === 'third') errors.height = 'Die beiden Messungen weichen um 0,4 cm oder mehr ab – bitte ein drittes Mal messen.';
  if (weightIn.invalid) errors.weight = `Bitte jedes Gewicht in kg eingeben (${MIN_WEIGHT_KG} bis ${MAX_WEIGHT_KG}).`;
  else if (weight.needs === 'third') errors.weight = 'Die beiden Messungen weichen um 0,4 kg oder mehr ab – bitte ein drittes Mal wiegen.';
  if (!errors.height && !errors.weight && height.readings.length === 0 && weight.readings.length === 0) {
    errors.height = draft.legacy ? 'Bitte Größe oder Gewicht eingeben.' : 'Bitte die Größe (oder nur das Gewicht) eingeben.';
  }

  // Sitzhöhe: nur im Messassistenten. Rohwerte wie abgelesen; der Kasten wird genau einmal abgezogen (sittingNet).
  let sitting = NO_SERIES;
  let boxCm = 0;
  if (!draft.legacy) {
    const box = draft.sittingMode === 'box' ? parse(draft.boxHeight) : 0;
    const sittingMax = MAX_SITTING_CM + MAX_BOX_CM;
    const sittingIn = readings(draft.sitting, 1, sittingMax);
    if (sittingIn.values.length > 0 || sittingIn.invalid) {
      if (draft.sittingMode === 'box' && (box === null || Number.isNaN(box) || box <= 0 || box > MAX_BOX_CM)) {
        errors.box = `Bitte die Höhe des Sitzkastens in cm eingeben (über 0 bis ${MAX_BOX_CM}).`;
      } else boxCm = box ?? 0;
      sitting = evaluateSeries(sittingIn.values, SITTING_TOLERANCE_TENTHS, 1);
      const nets = sittingIn.values.map((value) => sittingNet(value, boxCm));
      if (sittingIn.invalid) errors.sitting = 'Bitte jede Sitzhöhe als Zahl in cm über 0 eingeben.';
      else if (!errors.box && nets.some((net) => net < MIN_SITTING_CM || net > MAX_SITTING_CM)) {
        errors.sitting =
          draft.sittingMode === 'box'
            ? `Nach Abzug des Sitzkastens muss die Sitzhöhe zwischen ${MIN_SITTING_CM} und ${MAX_SITTING_CM} cm liegen. Gesamthöhe und Kasten prüfen.`
            : `Bitte eine Sitzhöhe von ${MIN_SITTING_CM} bis ${MAX_SITTING_CM} cm eingeben.`;
      } else if (sitting.needs === 'third') errors.sitting = 'Die beiden Messungen weichen um 0,4 cm oder mehr ab – bitte ein drittes Mal messen.';
      else if (height.readings.length === 0) errors.sitting = 'Sitzhöhe nur zusammen mit der Größe.';
      else if (!errors.box && height.value !== null && sitting.value !== null && sittingNet(sitting.value, boxCm) >= height.value) {
        errors.sitting = 'Die Sitzhöhe muss kleiner als die Körpergröße sein. Sitzkasten abgezogen?';
      }
      if (sitting.value !== null) sitting = { ...sitting, value: errors.box ? null : sittingNet(sitting.value, boxCm) };
    }
  }

  const flags: MeasurementFlag[] = [];
  if (!draft.legacy) {
    if (height.spread) flags.push('height-spread');
    if (weight.spread) flags.push('weight-spread');
    if (sitting.spread) flags.push('sitting-spread');
    flags.push(...rangeFlags(height.value, weight.value, errors.sitting || errors.box ? null : sitting.value));
    if (height.value !== null && isIsoDate(draft.date)) {
      const trend = heightTrendFlag(draft.date, height.value, previousHeight(context.others, draft.date));
      if (trend) flags.push(trend);
    }
  }
  const validSitting = errors.sitting || errors.box || sitting.spread ? null : sitting.value;
  return {
    errors,
    height,
    weight,
    sitting,
    boxCm,
    flags,
    age: errors.date ? null : decimalAgeAt(context.birthdate, draft.date),
    legLength: height.spread ? null : legLengthCm(height.value, validSitting),
  };
}

/** Nur die Fehler (für Aufrufer, die das Ergebnis nicht brauchen). */
export function validateMeasurement(draft: MeasurementDraft, context: MeasurementContext): MeasurementErrors {
  return evaluateMeasurement(draft, context).errors;
}

/**
 * Formular → Messung (nur nach fehlerfreier Prüfung aufrufen). `previous` ist die bisherige Fassung beim Bearbeiten:
 * Dann wird die Änderung mit Grund, Zeitpunkt und den vorher verwendeten Werten im Protokoll angehängt.
 */
export function measurementFromDraft(draft: MeasurementDraft, id: string, evaluation: MeasurementEvaluation, previous: Measurement | null, now: string): Measurement {
  const changes = previous
    ? [
        ...(previous.changes ?? []),
        { at: now, reason: draft.reason.trim(), before: { height: previous.height, weight: previous.weight, sittingHeight: previous.sittingHeight ?? null } },
      ]
    : [];
  const history = changes.length ? { changes } : {};
  if (draft.legacy) {
    // Bestandsmessung: bleibt "Messqualität nicht dokumentiert", es werden keine Rohwerte erfunden.
    return { id, date: draft.date, height: evaluation.height.value, weight: evaluation.weight.value, ...history };
  }
  const sitting = evaluation.sitting.readings.length
    ? { sittingReadings: evaluation.sitting.readings, sittingHeight: evaluation.sitting.value, ...(evaluation.boxCm > 0 ? { sittingBoxCm: evaluation.boxCm } : {}) }
    : {};
  const station = draft.station.trim();
  return {
    id,
    date: draft.date,
    height: evaluation.height.value,
    weight: evaluation.weight.value,
    time: draft.time.trim(),
    ...(station ? { station } : {}),
    protocol: MEASUREMENT_PROTOCOL,
    heightReadings: evaluation.height.readings,
    weightReadings: evaluation.weight.readings,
    ...sitting,
    quality: evaluation.flags.length ? 'flagged' : 'verified',
    ...(evaluation.flags.length ? { flags: [...evaluation.flags] } : {}),
    ...history,
  };
}

const QUALITIES: readonly MeasurementQuality[] = ['verified', 'flagged'];
const FLAGS: readonly MeasurementFlag[] = ['height-spread', 'weight-spread', 'sitting-spread', 'height-range', 'weight-range', 'sitting-ratio', 'height-drop', 'height-jump'];

function positive(value: unknown): number | null {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function numberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.map(positive).filter((entry): entry is number => entry !== null).slice(0, MAX_READINGS);
  return list;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function changesFromDoc(value: unknown): MeasurementChange[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: MeasurementChange[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    const before = (data['before'] && typeof data['before'] === 'object' ? data['before'] : {}) as Record<string, unknown>;
    if (typeof data['at'] !== 'string') continue;
    list.push({
      at: data['at'],
      reason: typeof data['reason'] === 'string' ? data['reason'] : '',
      before: { height: positive(before['height']), weight: positive(before['weight']), sittingHeight: positive(before['sittingHeight']) },
    });
  }
  return list;
}

/** Dokument → Messung; Größe/Gewicht stehen wie in der bisherigen App als Text ('' = nicht erfasst). */
export function measurementFromDoc(id: string, data: Readonly<Record<string, unknown>>, today: string): Measurement {
  const measurement: Record<string, unknown> = {
    id,
    date: typeof data['date'] === 'string' && data['date'] ? data['date'] : today,
    height: positive(data['height']),
    weight: positive(data['weight']),
  };
  const time = text(data['time'], 5);
  if (time) measurement['time'] = time;
  const station = text(data['station'], STATION_MAX);
  if (station) measurement['station'] = station;
  const protocol = text(data['protocol'], 10);
  if (protocol) measurement['protocol'] = protocol;
  for (const key of ['heightReadings', 'weightReadings', 'sittingReadings'] as const) {
    const list = numberList(data[key]);
    if (list) measurement[key] = list;
  }
  const box = positive(data['sittingBoxCm']);
  if (box !== null) measurement['sittingBoxCm'] = box;
  const sittingHeight = positive(data['sittingHeight']);
  if (sittingHeight !== null) measurement['sittingHeight'] = sittingHeight;
  if (QUALITIES.includes(data['quality'] as MeasurementQuality)) measurement['quality'] = data['quality'];
  if (Array.isArray(data['flags'])) measurement['flags'] = (data['flags'] as unknown[]).filter((flag): flag is MeasurementFlag => FLAGS.includes(flag as MeasurementFlag));
  const changes = changesFromDoc(data['changes']);
  if (changes) measurement['changes'] = changes;
  return measurement as unknown as Measurement;
}

/** Größe/Gewicht wie die bisherige App als Text (leer = nicht erfasst); neue Felder nur, wenn vorhanden. */
export function docFromMeasurement(measurement: Measurement): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    id: measurement.id,
    date: measurement.date,
    height: measurement.height === null ? '' : String(measurement.height),
    weight: measurement.weight === null ? '' : String(measurement.weight),
  };
  if (measurement.time) doc['time'] = measurement.time;
  if (measurement.station) doc['station'] = measurement.station;
  if (measurement.protocol) doc['protocol'] = measurement.protocol;
  if (measurement.heightReadings) doc['heightReadings'] = [...measurement.heightReadings];
  if (measurement.weightReadings) doc['weightReadings'] = [...measurement.weightReadings];
  if (measurement.sittingReadings) doc['sittingReadings'] = [...measurement.sittingReadings];
  if (measurement.sittingBoxCm) doc['sittingBoxCm'] = measurement.sittingBoxCm;
  if (measurement.sittingHeight !== undefined && measurement.sittingHeight !== null) doc['sittingHeight'] = measurement.sittingHeight;
  if (measurement.quality && measurement.quality !== 'undocumented') doc['quality'] = measurement.quality;
  if (measurement.flags?.length) doc['flags'] = [...measurement.flags];
  if (measurement.changes?.length) doc['changes'] = measurement.changes.map((change) => ({ at: change.at, reason: change.reason, before: { ...change.before } }));
  return doc;
}

/** Messqualität; ohne Kennzeichen (Bestandsmessung) `undocumented`. */
export function measurementQuality(measurement: Measurement): MeasurementQuality {
  return measurement.quality ?? 'undocumented';
}

/** BMI; ohne Größe oder Gewicht null. */
export function calculateBmi(height: number | null, weight: number | null): number | null {
  if (!height || !weight) return null;
  const meters = height / 100;
  return weight / (meters * meters);
}

/** Messungen, älteste zuerst (am selben Tag nach Uhrzeit). */
export function sortedMeasurements(measurements: readonly Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function measurementText(measurement: Measurement): string {
  const bmi = calculateBmi(measurement.height, measurement.weight);
  const round = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  return `${measurement.height === null ? '–' : round(measurement.height)} cm · ${measurement.weight === null ? '–' : round(measurement.weight)} kg${bmi ? ` · BMI ${round(bmi)}` : ''}`;
}

/** Rohwerte als Text, z. B. "150,2 / 150,8 / 150,5". */
export function readingsText(values: readonly number[] | undefined): string {
  return (values ?? []).map((value) => decimalText(value)).join(' / ');
}
