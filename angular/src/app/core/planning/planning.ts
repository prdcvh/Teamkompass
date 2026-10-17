/**
 * Planung (SCRUM-145): Trainingsserien. Eine Serie ist ein fester Trainingstag (Wochentag, Startzeit, Dauer, Ort)
 * mit Start- und Enddatum. Sie liegt im Dokument `teams/{teamId}/meta/planning` unter `series.{id}` (eine Map statt
 * einer Liste, damit zwei Trainer verschiedene Serien gleichzeitig ändern können und weitere Teile – Pausen,
 * SCRUM-148 – im selben Dokument Platz haben). Die Trainings der Serie legt `series-events.ts` an (SCRUM-146).
 */
import {
  DEFAULT_EXERTION,
  EVENT_TYPES,
  EXERTIONS,
  exertionFromLegacyIntensity,
  type LocationCoords,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TRAINING_DURATION,
  TRAINING_FOCUSES,
  isLocationCoords,
  isTime,
} from '../events/event';
import { formatDate, isIsoDate } from '../shared/dates';

export const DEFAULT_SERIES_TITLE = EVENT_TYPES[0];
/** Längste erlaubte Laufzeit einer Serie. */
export const MAX_SERIES_MONTHS = 18;

/** Wochentage in ISO-Zählung (1 = Montag … 7 = Sonntag). */
export const WEEKDAYS = [
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 7, label: 'Sonntag' },
] as const;

export interface TrainingSeries {
  readonly id: string;
  /** ISO-Wochentag 1–7. */
  readonly weekday: number;
  /** `HH:MM`, Europe/Berlin. */
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly location: string;
  readonly locationCoords: LocationCoords | null;
  /** Leer = „Training“. */
  readonly title: string;
  readonly trainingFocus: string;
  readonly exertion: number;
  /** ISO-Datum, erster möglicher Termin. */
  readonly startDate: string;
  /** ISO-Datum, letzter möglicher Termin (Pflicht). */
  readonly endDate: string;
}

/** Formulareingaben als Text. */
export interface SeriesDraft {
  readonly id: string | null;
  readonly weekday: number;
  readonly startTime: string;
  readonly durationMinutes: string;
  readonly location: string;
  readonly locationCoords: LocationCoords | null;
  readonly title: string;
  readonly trainingFocus: string;
  readonly exertion: number;
  readonly startDate: string;
  readonly endDate: string;
}

export type SeriesErrors = Partial<
  Record<'weekday' | 'startTime' | 'durationMinutes' | 'location' | 'title' | 'exertion' | 'startDate' | 'endDate' | 'locationCoords', string>
>;

export function seriesTitle(series: Pick<TrainingSeries, 'title'>): string {
  return series.title.trim() === '' ? DEFAULT_SERIES_TITLE : series.title;
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.label ?? '–';
}

/** ISO-Wochentag (1–7) eines ISO-Datums. */
export function isoWeekday(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Datum plus Monate, der Tag wird auf den Monatsletzten begrenzt (31.08. + 6 Monate = 28.02.). */
export function addMonthsIso(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** Wie oft der Wochentag zwischen Start und Ende (beide eingeschlossen) vorkommt. */
export function countWeekdays(weekday: number, startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (end < start) return 0;
  const offset = (weekday - isoWeekday(startDate) + 7) % 7;
  const first = start + offset * 86_400_000;
  return first > end ? 0 : Math.floor((end - first) / (7 * 86_400_000)) + 1;
}

export function emptySeriesDraft(today: string, defaultLocation: { readonly text: string; readonly coords: LocationCoords | null } | null): SeriesDraft {
  return {
    id: null,
    weekday: isoWeekday(today),
    startTime: '',
    durationMinutes: '90',
    location: defaultLocation?.text ?? '',
    locationCoords: defaultLocation?.coords ?? null,
    title: '',
    trainingFocus: TRAINING_FOCUSES[0],
    exertion: DEFAULT_EXERTION,
    startDate: today,
    endDate: '',
  };
}

export function draftFromSeries(series: TrainingSeries): SeriesDraft {
  return {
    id: series.id,
    weekday: series.weekday,
    startTime: series.startTime,
    durationMinutes: String(series.durationMinutes),
    location: series.location,
    locationCoords: series.locationCoords,
    title: series.title,
    trainingFocus: series.trainingFocus,
    exertion: series.exertion,
    startDate: series.startDate,
    endDate: series.endDate,
  };
}

/** Prüft die Eingaben; leeres Ergebnis = gültig. Die Meldungen sind für den Trainer geschrieben. */
export function validateSeriesDraft(draft: SeriesDraft): SeriesErrors {
  const errors: SeriesErrors = {};
  if (!WEEKDAYS.some((day) => day.value === draft.weekday)) errors.weekday = 'Bitte einen Wochentag wählen.';
  if (draft.startTime === '') errors.startTime = 'Bitte die Startzeit angeben.';
  else if (!isTime(draft.startTime)) errors.startTime = 'Die Startzeit ist ungültig. Bitte als Uhrzeit angeben, z. B. 17:30.';
  const minutes = draft.durationMinutes.trim();
  if (minutes === '') errors.durationMinutes = 'Bitte die Dauer in Minuten angeben.';
  else if (!/^\d+$/.test(minutes) || +minutes < 1 || +minutes > MAX_TRAINING_DURATION) {
    errors.durationMinutes = `Die Dauer muss eine ganze Zahl zwischen 1 und ${MAX_TRAINING_DURATION} Minuten sein.`;
  }
  if (draft.title.trim().length > MAX_TITLE_LENGTH) errors.title = `Der Titel darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.`;
  if (draft.location.trim().length > MAX_TEXT_LENGTH) errors.location = `Der Ort darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`;
  if (draft.locationCoords !== null && !isLocationCoords(draft.locationCoords)) errors.locationCoords = 'Die gewählten Koordinaten sind ungültig. Bitte den Ort neu suchen.';
  if (!EXERTIONS.some((entry) => entry.value === draft.exertion)) errors.exertion = 'Bitte eine Anstrengung wählen.';

  const startOk = isIsoDate(draft.startDate);
  const endOk = isIsoDate(draft.endDate);
  if (!startOk) errors.startDate = 'Bitte ein gültiges Startdatum angeben.';
  if (!endOk) errors.endDate = draft.endDate === '' ? 'Bitte ein Enddatum angeben – eine Serie braucht ein Ende.' : 'Das Enddatum ist ungültig.';
  if (startOk && endOk) {
    if (draft.endDate < draft.startDate) errors.endDate = 'Das Enddatum darf nicht vor dem Startdatum liegen.';
    else if (draft.endDate > addMonthsIso(draft.startDate, MAX_SERIES_MONTHS)) {
      errors.endDate = `Eine Serie darf höchstens ${MAX_SERIES_MONTHS} Monate laufen. Bitte ein früheres Enddatum wählen.`;
    } else if (!errors.weekday && countWeekdays(draft.weekday, draft.startDate, draft.endDate) === 0) {
      errors.endDate = `Zwischen ${formatDate(draft.startDate)} und ${formatDate(draft.endDate)} liegt kein ${weekdayLabel(draft.weekday)}.`;
    }
  }
  return errors;
}

/** Gültigen Entwurf in eine Serie umwandeln (nur nach leerem {@link validateSeriesDraft} aufrufen). */
export function seriesFromDraft(draft: SeriesDraft, id: string): TrainingSeries {
  return {
    id,
    weekday: draft.weekday,
    startTime: draft.startTime,
    durationMinutes: Number(draft.durationMinutes.trim()),
    location: draft.location.trim(),
    locationCoords: draft.locationCoords === null ? null : { lat: draft.locationCoords.lat, lon: draft.locationCoords.lon, name: draft.locationCoords.name },
    title: draft.title.trim(),
    trainingFocus: draft.trainingFocus,
    exertion: draft.exertion,
    startDate: draft.startDate,
    endDate: draft.endDate,
  };
}

/** Felder einer Serie im Firestore-Dokument (ohne die ID, sie ist der Schlüssel in der Map). */
export function docFromSeries(series: TrainingSeries): Record<string, unknown> {
  return {
    weekday: series.weekday,
    startTime: series.startTime,
    durationMinutes: series.durationMinutes,
    location: series.location,
    locationCoords: series.locationCoords,
    title: series.title,
    trainingFocus: series.trainingFocus,
    exertion: series.exertion,
    startDate: series.startDate,
    endDate: series.endDate,
  };
}

/** Eine Serie aus dem Dokument; null, wenn sie unbrauchbar ist (wird dann übersprungen, nie geraten). */
export function seriesFromDoc(id: string, data: unknown): TrainingSeries | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const { weekday, startTime, durationMinutes, startDate, endDate, exertion } = raw;
  if (typeof weekday !== 'number' || !WEEKDAYS.some((day) => day.value === weekday)) return null;
  if (!isTime(startTime)) return null;
  if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_TRAINING_DURATION) return null;
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !isIsoDate(startDate) || !isIsoDate(endDate)) return null;
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
  const coords = raw['locationCoords'];
  return {
    id,
    weekday,
    startTime,
    durationMinutes,
    location: text(raw['location'], MAX_TEXT_LENGTH),
    locationCoords: isLocationCoords(coords) ? { lat: coords.lat, lon: coords.lon, name: coords.name } : null,
    title: text(raw['title'], MAX_TITLE_LENGTH),
    trainingFocus: text(raw['trainingFocus'], MAX_TEXT_LENGTH) || TRAINING_FOCUSES[0],
    // Anstrengung 0–10 (SCRUM-137); eine ältere Serie mit Intensität 1–3 wird wie bei Events als 3/5/7 gelesen.
    exertion: typeof exertion === 'number' && EXERTIONS.some((entry) => entry.value === exertion) ? exertion : exertionFromLegacyIntensity(raw['intensity']),
    startDate,
    endDate,
  };
}

/** Alle brauchbaren Serien aus dem Dokument, sortiert nach Wochentag und Startzeit. */
export function seriesFromPlanningDoc(doc: Readonly<Record<string, unknown>> | null): TrainingSeries[] {
  const map = doc?.['series'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return [];
  return Object.entries(map)
    .map(([id, data]) => seriesFromDoc(id, data))
    .filter((series): series is TrainingSeries => series !== null)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
}
