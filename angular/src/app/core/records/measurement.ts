/**
 * Messwerte eines Spielers (`players/{id}/measurements`): Modell, Umwandlung Dokument ↔ Messung und BMI.
 *
 * Seit SCRUM-253 (Messassistent) trägt eine Messung neben dem verwendeten Wert (`height`, `weight` – daran hängen alle
 * Auswertungen wie bisher) auch Uhrzeit, Messstation, Rohwerte der Wiederholungen, Sitzhöhe, ein Qualitätskennzeichen
 * und ein Änderungsprotokoll. Alle neuen Felder sind optional: Bestandsmessungen ohne diese Felder bleiben gültig und
 * gelten als "Messqualität nicht dokumentiert"; fehlende Rohwerte werden nie erfunden.
 * Formular und Prüfung: measurement-draft.ts; Regeln und Grenzwerte: measurement-protocol.ts.
 */
import { MAX_READINGS, type MeasurementFlag, type MeasurementQuality, STATION_MAX, decimalText } from './measurement-protocol';

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
