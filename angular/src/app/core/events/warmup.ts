/**
 * Aufwärmprogramm FIFA 11+ (SCRUM-178): Programme, Wochenquote und Hinweis bei Lücken. Reine Funktionen ohne
 * Firebase. Eine Woche läuft Montag bis Sonntag (Europe/Berlin); die Termin-Daten sind ISO-Kalendertage in
 * dieser Zeitzone, deshalb reicht Datumsrechnung auf Tagesebene.
 */
import { addDays, isIsoDate } from '../shared/dates';

export const WARMUP_PROGRAMS = ['11+ Kids', '11+'] as const;
export type WarmupProgram = (typeof WARMUP_PROGRAMS)[number];
export const DEFAULT_WARMUP_PROGRAM: WarmupProgram = WARMUP_PROGRAMS[0];

/** Quelle zum Programm (Studie zu FIFA 11+ Kids); öffnet in neuem Tab. */
export const WARMUP_INFO_URL = 'https://medicalresearch.com/11-kids-program-reduces-soccer-injuries-in-children/';

const WARMUP_TIME_ZONE = 'Europe/Berlin';

/** Gültiges Programm aus einem Dokumentwert, sonst null (alte Events ohne Feld = nicht gemacht). */
export function warmupFromDoc(value: unknown): WarmupProgram | null {
  return WARMUP_PROGRAMS.find((program) => program === value) ?? null;
}

/** Heutiger Kalendertag in Europe/Berlin (unabhängig von der Zeitzone des Geräts). */
export function berlinTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: WARMUP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Montag der Woche, in der `date` liegt. */
export function weekStartIso(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sonntag
  return addDays(date, -((weekday + 6) % 7));
}

/** Das Nötigste, was die Auswertung von einem Termin braucht. `cancelled`: für abgesagte Termine (derzeit setzt die App es nicht). */
export interface WarmupEvent {
  readonly type: string;
  readonly date: string;
  readonly warmup?: WarmupProgram | null;
  readonly cancelled?: boolean;
}

export interface WarmupWeek {
  /** Montag der Woche. */
  readonly start: string;
  /** Sonntag der Woche. */
  readonly end: string;
  /** Trainings dieser Woche bis einschließlich heute (abgesagte nicht). */
  readonly total: number;
  /** Davon mit Aufwärmprogramm. */
  readonly done: number;
  /** Training in der Woche, aber kein Programm: Hinweis zeigen. */
  readonly hint: boolean;
}

/** Quote der Woche, in der `weekOf` liegt. Zählt nur Trainings, die bis `today` stattfanden. Ungültige Daten: leere Woche. */
export function warmupWeek(events: readonly WarmupEvent[], today: string, weekOf: string = today): WarmupWeek {
  if (!isIsoDate(weekOf) || !isIsoDate(today)) return { start: weekOf, end: weekOf, total: 0, done: 0, hint: false };
  const start = weekStartIso(weekOf);
  const end = addDays(start, 6);
  const counted = events.filter(
    (event) => event.type === 'Training' && event.cancelled !== true && isIsoDate(event.date) && event.date >= start && event.date <= end && event.date <= today,
  );
  const done = counted.filter((event) => warmupFromDoc(event.warmup) !== null).length;
  return { start, end, total: counted.length, done, hint: counted.length > 0 && done === 0 };
}

export interface WarmupSummary {
  readonly current: WarmupWeek;
  readonly previous: WarmupWeek;
}

/** Laufende und vorige Woche (für die Startseite). */
export function warmupSummary(events: readonly WarmupEvent[], today: string): WarmupSummary {
  return { current: warmupWeek(events, today), previous: warmupWeek(events, today, addDays(weekStartIso(today), -7)) };
}

/** „2 von 3 Trainings“ bzw. „0 von 1 Training“. */
export function warmupQuoteText(week: Pick<WarmupWeek, 'done' | 'total'>): string {
  return `${week.done} von ${week.total} ${week.total === 1 ? 'Training' : 'Trainings'}`;
}
