/** Messwerte eines Spielers (`players/{id}/measurements`): Modell, Prüfung, Umwandlung und BMI. */
import { isIsoDate } from '../shared/dates';

export interface Measurement {
  readonly id: string;
  readonly date: string;
  /** cm; null = nicht erfasst. */
  readonly height: number | null;
  /** kg; null = nicht erfasst. */
  readonly weight: number | null;
}

export interface MeasurementDraft {
  readonly id: string | null;
  readonly date: string;
  readonly height: string;
  readonly weight: string;
}

export type MeasurementErrors = Partial<Record<'date' | 'height' | 'weight', string>>;

export const MAX_HEIGHT_CM = 250;
export const MAX_WEIGHT_KG = 250;

export function emptyMeasurementDraft(today: string): MeasurementDraft {
  return { id: null, date: today, height: '', weight: '' };
}

export function draftFromMeasurement(measurement: Measurement): MeasurementDraft {
  return {
    id: measurement.id,
    date: measurement.date,
    height: measurement.height === null ? '' : String(measurement.height),
    weight: measurement.weight === null ? '' : String(measurement.weight),
  };
}

function measured(value: string, max: number): number | null {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 && number <= max ? number : Number.NaN;
}

export function validateMeasurement(draft: MeasurementDraft): MeasurementErrors {
  const errors: MeasurementErrors = {};
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  const height = measured(draft.height, MAX_HEIGHT_CM);
  const weight = measured(draft.weight, MAX_WEIGHT_KG);
  if (Number.isNaN(height)) errors.height = `Bitte eine Größe von 1 bis ${MAX_HEIGHT_CM} cm eingeben.`;
  if (Number.isNaN(weight)) errors.weight = `Bitte ein Gewicht von 1 bis ${MAX_WEIGHT_KG} kg eingeben.`;
  if (!errors.height && !errors.weight && height === null && weight === null) errors.height = 'Bitte Größe oder Gewicht eingeben.';
  return errors;
}

export function measurementFromDraft(draft: MeasurementDraft, id: string): Measurement {
  return { id, date: draft.date, height: measured(draft.height, MAX_HEIGHT_CM), weight: measured(draft.weight, MAX_WEIGHT_KG) };
}

/** Dokument → Messung; die bisherige App speichert die Werte als Text ('' = nicht erfasst). */
export function measurementFromDoc(id: string, data: Readonly<Record<string, unknown>>, today: string): Measurement {
  const number = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    id,
    date: typeof data['date'] === 'string' && data['date'] ? data['date'] : today,
    height: number(data['height']),
    weight: number(data['weight']),
  };
}

/** Wie die bisherige App: Werte als Text, leer = nicht erfasst. */
export function docFromMeasurement(measurement: Measurement): Record<string, unknown> {
  return {
    id: measurement.id,
    date: measurement.date,
    height: measurement.height === null ? '' : String(measurement.height),
    weight: measurement.weight === null ? '' : String(measurement.weight),
  };
}

/** BMI; ohne Größe oder Gewicht null. */
export function calculateBmi(height: number | null, weight: number | null): number | null {
  if (!height || !weight) return null;
  const meters = height / 100;
  return weight / (meters * meters);
}

/** Messungen, älteste zuerst. */
export function sortedMeasurements(measurements: readonly Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => a.date.localeCompare(b.date));
}

export function measurementText(measurement: Measurement): string {
  const bmi = calculateBmi(measurement.height, measurement.weight);
  const round = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  return `${measurement.height === null ? '–' : round(measurement.height)} cm · ${measurement.weight === null ? '–' : round(measurement.weight)} kg${bmi ? ` · BMI ${round(bmi)}` : ''}`;
}
