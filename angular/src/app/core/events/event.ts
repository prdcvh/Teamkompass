/**
 * Events (Training/Spiel): Modell, Umwandlung von/nach Firestore und die reine Logik für Prüfung,
 * Filter und Sortierung. Das Dokument `teams/{teamId}/events/{id}` ist mit der bisherigen App
 * identisch (siehe outputs/team-manager/app.js, saveEvent/normalizeEvent). Bewertungen und
 * interne Notizen liegen in Unterkollektionen und gehören nie ins Event-Dokument.
 */
import { formatDate, isIsoDate } from '../shared/dates';

export { formatDate };

export const EVENT_TYPES = ['Training', 'Spiel'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const INTENSITIES = [
  { value: 1, label: '1 · niedrig' },
  { value: 2, label: '2 · mittel' },
  { value: 3, label: '3 · hoch' },
] as const;

export const TRAINING_FOCUSES = ['Eigener Ballbesitz', 'Gegnerischer Ballbesitz', 'Umschalten'] as const;

export const MAX_TITLE_LENGTH = 60;
export const MAX_TEXT_LENGTH = 50;
export const MAX_NOTES_LENGTH = 1000;
export const MAX_SCORE = 99;
export const DEFAULT_MATCH_DURATION = 90;
export const MAX_MATCH_DURATION = 150;
export const MAX_TRAINING_DURATION = 300;
export const MAX_COORDS_NAME_LENGTH = 120;
/** Alle Zeiten der Events gelten in dieser Zeitzone. */
export const EVENT_TIME_ZONE = 'Europe/Berlin';

/** Ort mit Koordinaten (z. B. aus der Ortssuche); `name` ist die Bezeichnung des Treffers. */
export interface LocationCoords {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
}

export interface TeamEvent {
  readonly id: string;
  readonly type: EventType;
  readonly title: string;
  /** ISO-Datum (JJJJ-MM-TT). */
  readonly date: string;
  readonly intensity: number;
  readonly location: string;
  /** Nur bei Training. */
  readonly trainingFocus: string;
  readonly opponent: string;
  /** Nur bei Spielen; null = noch kein Ergebnis. */
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  /** Nur bei Spielen (Minuten). */
  readonly matchDuration: number | null;
  /** Startzeit `HH:MM` (Europe/Berlin); null = unbekannt (ältere Events). */
  readonly startTime: string | null;
  /** Nur bei Training (Minuten, 1–300); Spiele nutzen `matchDuration`. */
  readonly durationMinutes: number | null;
  /** Koordinaten des Orts; null = keine hinterlegt. */
  readonly locationCoords: LocationCoords | null;
  readonly notes: string;
}

/** Eingaben aus dem Formular; alles als Text, wie es der Nutzer eingibt. */
export interface EventDraft {
  readonly id: string | null;
  readonly type: EventType;
  readonly title: string;
  readonly date: string;
  readonly intensity: number;
  readonly location: string;
  readonly trainingFocus: string;
  readonly opponent: string;
  readonly goalsFor: string;
  readonly goalsAgainst: string;
  readonly matchDuration: string;
  readonly startTime: string;
  readonly durationMinutes: string;
  /** Wird im Formular nicht bearbeitet (kommt mit der Ortssuche), aber beim Bearbeiten erhalten. */
  readonly locationCoords: LocationCoords | null;
  readonly notes: string;
}

export type EventErrors = Partial<
  Record<'title' | 'date' | 'intensity' | 'location' | 'opponent' | 'goalsFor' | 'goalsAgainst' | 'matchDuration' | 'startTime' | 'durationMinutes' | 'locationCoords' | 'notes', string>
>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Gültige Uhrzeit `HH:MM` (00:00–23:59). */
export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/** Koordinaten im gültigen Bereich (Breite −90…90, Länge −180…180) mit nicht zu langem Namen. */
export function isLocationCoords(value: unknown): value is LocationCoords {
  if (typeof value !== 'object' || value === null) return false;
  const { lat, lon, name } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
    typeof name === 'string' && name.length <= MAX_COORDS_NAME_LENGTH
  );
}

export function emptyDraft(today: string): EventDraft {
  return {
    id: null,
    type: 'Training',
    title: '',
    date: today,
    intensity: 2,
    location: '',
    trainingFocus: TRAINING_FOCUSES[0],
    opponent: '',
    goalsFor: '',
    goalsAgainst: '',
    matchDuration: String(DEFAULT_MATCH_DURATION),
    startTime: '',
    durationMinutes: '',
    locationCoords: null,
    notes: '',
  };
}

export function draftFromEvent(event: TeamEvent): EventDraft {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    date: event.date,
    intensity: event.intensity,
    location: event.location,
    trainingFocus: event.trainingFocus || TRAINING_FOCUSES[0],
    opponent: event.opponent,
    goalsFor: event.goalsFor === null ? '' : String(event.goalsFor),
    goalsAgainst: event.goalsAgainst === null ? '' : String(event.goalsAgainst),
    matchDuration: String(event.matchDuration ?? DEFAULT_MATCH_DURATION),
    startTime: event.startTime ?? '',
    durationMinutes: event.durationMinutes === null ? '' : String(event.durationMinutes),
    locationCoords: event.locationCoords,
    notes: event.notes,
  };
}

function wholeNumber(value: string, min: number, max: number): number | null {
  const text = value.trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isInteger(number) && number >= min && number <= max ? number : Number.NaN;
}

/** Prüft die Eingaben. Leeres Ergebnis = gültig. Spielfelder zählen nur bei Spielen. */
export function validateDraft(draft: EventDraft): EventErrors {
  const errors: EventErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = 'Bitte einen Titel eingeben.';
  else if (title.length > MAX_TITLE_LENGTH) errors.title = `Der Titel darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.`;

  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  if (!INTENSITIES.some((entry) => entry.value === draft.intensity)) errors.intensity = 'Bitte eine Intensität von 1 bis 3 wählen.';
  if (draft.location.trim().length > MAX_TEXT_LENGTH) errors.location = `Der Ort darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`;
  if (draft.startTime.trim() !== '' && !isTime(draft.startTime.trim())) errors.startTime = 'Bitte eine Uhrzeit im Format HH:MM eingeben.';
  if (draft.locationCoords !== null && !isLocationCoords(draft.locationCoords)) errors.locationCoords = 'Die Koordinaten des Orts sind ungültig.';
  if (draft.notes.trim().length > MAX_NOTES_LENGTH) errors.notes = `Die Notiz darf höchstens ${MAX_NOTES_LENGTH} Zeichen lang sein.`;

  if (draft.type === 'Training' && Number.isNaN(wholeNumber(draft.durationMinutes, 1, MAX_TRAINING_DURATION))) {
    errors.durationMinutes = `Bitte eine Dauer von 1 bis ${MAX_TRAINING_DURATION} Minuten eingeben.`;
  }

  if (draft.type === 'Spiel') {
    if (draft.opponent.trim().length > MAX_TEXT_LENGTH) errors.opponent = `Der Gegner darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`;
    const goalsFor = wholeNumber(draft.goalsFor, 0, MAX_SCORE);
    const goalsAgainst = wholeNumber(draft.goalsAgainst, 0, MAX_SCORE);
    if (Number.isNaN(goalsFor)) errors.goalsFor = `Bitte eine Zahl von 0 bis ${MAX_SCORE} eingeben.`;
    if (Number.isNaN(goalsAgainst)) errors.goalsAgainst = `Bitte eine Zahl von 0 bis ${MAX_SCORE} eingeben.`;
    if (!errors.goalsFor && !errors.goalsAgainst && (goalsFor === null) !== (goalsAgainst === null)) {
      const missing = goalsFor === null ? 'goalsFor' : 'goalsAgainst';
      errors[missing] = 'Bitte beide Tore eintragen oder beide leer lassen.';
    }
    if (Number.isNaN(wholeNumber(draft.matchDuration, 1, MAX_MATCH_DURATION))) {
      errors.matchDuration = `Bitte eine Spieldauer von 1 bis ${MAX_MATCH_DURATION} Minuten eingeben.`;
    }
  }
  return errors;
}

/** Entwurf → Event. Setzt voraus, dass `validateDraft` keine Fehler gemeldet hat. */
export function eventFromDraft(draft: EventDraft, id: string): TeamEvent {
  const game = draft.type === 'Spiel';
  return {
    id,
    type: draft.type,
    title: draft.title.trim(),
    date: draft.date,
    intensity: draft.intensity,
    location: draft.location.trim(),
    trainingFocus: game ? '' : draft.trainingFocus,
    opponent: draft.opponent.trim(),
    goalsFor: game ? wholeNumber(draft.goalsFor, 0, MAX_SCORE) : null,
    goalsAgainst: game ? wholeNumber(draft.goalsAgainst, 0, MAX_SCORE) : null,
    matchDuration: game ? (wholeNumber(draft.matchDuration, 1, MAX_MATCH_DURATION) ?? DEFAULT_MATCH_DURATION) : null,
    startTime: draft.startTime.trim() === '' ? null : draft.startTime.trim(),
    durationMinutes: game ? null : wholeNumber(draft.durationMinutes, 1, MAX_TRAINING_DURATION),
    locationCoords: draft.locationCoords,
    notes: draft.notes.trim(),
  };
}

/** Dokument → Event; versteht auch ältere Dokumente (fehlende Felder, Ergebnis als Text). */
export function eventFromDoc(id: string, data: Readonly<Record<string, unknown>>): TeamEvent {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const score = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const type = EVENT_TYPES.find((value) => value === data['type']) ?? 'Training';
  const intensity = Number(data['intensity']);
  const duration = Number(data['matchDuration']);
  const trainingMinutes = Number(data['durationMinutes']);
  const startTime = typeof data['startTime'] === 'string' ? data['startTime'].trim() : '';
  const coords = data['locationCoords'];
  return {
    id,
    type,
    title: text(data['title']),
    date: text(data['date']),
    intensity: INTENSITIES.some((entry) => entry.value === intensity) ? intensity : 2,
    location: text(data['location']),
    trainingFocus: type === 'Spiel' ? '' : text(data['trainingFocus']) || TRAINING_FOCUSES[0],
    opponent: text(data['opponent']),
    goalsFor: type === 'Spiel' ? score(data['goalsFor']) : null,
    goalsAgainst: type === 'Spiel' ? score(data['goalsAgainst']) : null,
    matchDuration: type === 'Spiel' ? (Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_MATCH_DURATION) : null,
    startTime: isTime(startTime) ? startTime : null,
    durationMinutes:
      type === 'Training' && data['durationMinutes'] !== '' && Number.isInteger(trainingMinutes) && trainingMinutes >= 1 && trainingMinutes <= MAX_TRAINING_DURATION
        ? trainingMinutes
        : null,
    locationCoords: isLocationCoords(coords) ? { lat: coords.lat, lon: coords.lon, name: coords.name } : null,
    notes: text(data['notes']),
  };
}

/** Event → Dokumentfelder (gleiche Feldnamen und Leerwerte wie die bisherige App: Ergebnis/Dauer als '' statt null). */
export function docFromEvent(event: TeamEvent): Record<string, unknown> {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    date: event.date,
    intensity: event.intensity,
    location: event.location,
    trainingFocus: event.trainingFocus,
    opponent: event.opponent,
    goalsFor: event.goalsFor ?? '',
    goalsAgainst: event.goalsAgainst ?? '',
    matchDuration: event.matchDuration ?? '',
    startTime: event.startTime ?? '',
    durationMinutes: event.durationMinutes ?? '',
    locationCoords: event.locationCoords ?? null,
    notes: event.notes,
  };
}

/** Versatz von Europe/Berlin gegenüber UTC in Minuten zum Zeitpunkt `utcMs`. */
function berlinOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Zeitpunkt, an dem es in Europe/Berlin am `date` (ISO) um `time` (HH:MM) ist; null bei ungültiger Eingabe. */
export function berlinInstant(date: string, time: string): Date | null {
  if (!isIsoDate(date) || !isTime(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Zweimal angleichen, damit auch Zeiten rund um die Zeitumstellung stimmen.
  let utc = wall - berlinOffsetMinutes(wall) * 60000;
  utc = wall - berlinOffsetMinutes(utc) * 60000;
  return new Date(utc);
}

/** Startzeitpunkt (Europe/Berlin) oder null, wenn Datum oder Startzeit fehlen. */
export function eventStart(event: TeamEvent): Date | null {
  return event.startTime === null ? null : berlinInstant(event.date, event.startTime);
}

/** Endzeitpunkt: Start + Dauer (Spiel: `matchDuration`, Training: `durationMinutes`); null, wenn Zeit oder Dauer fehlen. */
export function eventEnd(event: TeamEvent): Date | null {
  const start = eventStart(event);
  const minutes = event.type === 'Spiel' ? event.matchDuration : event.durationMinutes;
  if (start === null || minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(start.getTime() + minutes * 60000);
}

export function resultText(event: TeamEvent): string {
  return event.type === 'Spiel' && event.goalsFor !== null && event.goalsAgainst !== null ? `${event.goalsFor}:${event.goalsAgainst}` : '';
}

export type EventTypeFilter = 'all' | EventType;
export type EventSort = 'date-desc' | 'date-asc';

export const EVENT_SORT_OPTIONS: readonly { readonly key: EventSort; readonly label: string }[] = [
  { key: 'date-desc', label: 'Neueste zuerst' },
  { key: 'date-asc', label: 'Älteste zuerst' },
];

export interface EventFilter {
  readonly query: string;
  readonly type: EventTypeFilter;
}

export function filterEvents(events: readonly TeamEvent[], filter: EventFilter): TeamEvent[] {
  const query = filter.query.trim().toLowerCase();
  return events.filter((event) => {
    if (filter.type !== 'all' && event.type !== filter.type) return false;
    if (!query) return true;
    return [event.title, event.type, event.location, event.opponent, event.date, formatDate(event.date)].join(' ').toLowerCase().includes(query);
  });
}

export function sortEvents(events: readonly TeamEvent[], sort: EventSort): TeamEvent[] {
  const direction = sort === 'date-asc' ? 1 : -1;
  return [...events].sort((a, b) => direction * a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de'));
}

export interface EventMonth {
  readonly label: string;
  readonly events: readonly TeamEvent[];
}

/** „Oktober 2026“; ohne gültiges Datum „Ohne Datum“. */
export function monthLabel(iso: string): string {
  if (!isIsoDate(iso)) return 'Ohne Datum';
  const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Gruppiert die (bereits sortierten) Events nach Monat, Reihenfolge bleibt erhalten. */
export function groupByMonth(events: readonly TeamEvent[]): EventMonth[] {
  const months: { label: string; events: TeamEvent[] }[] = [];
  for (const event of events) {
    const label = monthLabel(event.date);
    const last = months[months.length - 1];
    if (last?.label === label) last.events.push(event);
    else months.push({ label, events: [event] });
  }
  return months;
}
