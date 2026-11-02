/**
 * Selbsteinschätzung der Spieler nach einem Termin (SCRUM-138): Anstrengung 0–10 (dieselbe Skala wie beim Trainer)
 * und – nur mit dokumentierter Einwilligung – 4 freiwillige Fragen zum Befinden (Hooper-Fragebogen, je 1–7).
 *
 * Gespeichert je Spieler und Termin (Dokument-ID = Event-ID):
 * - `teams/{teamId}/players/{playerId}/selfReports/{eventId}`: { playerId, eventId, date, exertion, by, updatedAt }
 * - `teams/{teamId}/players/{playerId}/wellness/{eventId}`: { playerId, eventId, date, fatigue, sleep, soreness, stress, by, updatedAt }
 * Die Anstrengung ist kein Gesundheitsdatum (PO 02.11.2026), das Befinden schon – darum zwei getrennte Pfade mit
 * eigenen Regeln (firestore.rules).
 *
 * Frage offen: ab dem Ende des Termins (Beginn + Dauer, Europe/Berlin) bis zum Ende des Folgetags, nur wenn der
 * Spieler als „anwesend“ oder „eingeschränkt“ eingetragen ist. Danach gilt der Trainerwert.
 */
import { type TeamEvent, berlinInstant, plannedMinutes } from '../events/event';
import { addDays } from '../shared/dates';
import type { EventRating } from '../profile/profile';
import type { Rating } from '../ratings/rating';

export const WELLNESS_FIELDS = ['fatigue', 'sleep', 'soreness', 'stress'] as const;
export type WellnessField = (typeof WELLNESS_FIELDS)[number];

/**
 * Skala 1–7 mit Worten, 7 ist jeweils der beste Zustand (anders herum als im Original-Hooper-Fragebogen, damit
 * „Summe unter dem Normalwert“ = schlechteres Befinden heißt, wie im Ticket beschrieben).
 */
export const WELLNESS_QUESTIONS: Readonly<Record<WellnessField, { readonly label: string; readonly words: readonly string[] }>> = {
  fatigue: { label: 'Müdigkeit', words: ['völlig erschöpft', 'sehr müde', 'müde', 'normal', 'eher frisch', 'frisch', 'sehr frisch'] },
  sleep: { label: 'Schlafqualität', words: ['sehr schlecht', 'schlecht', 'eher schlecht', 'normal', 'eher gut', 'gut', 'sehr gut'] },
  soreness: { label: 'Muskelkater', words: ['sehr stark', 'stark', 'deutlich', 'etwas', 'leicht', 'kaum', 'keiner'] },
  stress: { label: 'Stress', words: ['sehr gestresst', 'gestresst', 'eher gestresst', 'normal', 'eher entspannt', 'entspannt', 'sehr entspannt'] },
};

export function wellnessOptions(field: WellnessField): readonly { value: number; label: string }[] {
  return WELLNESS_QUESTIONS[field].words.map((word, index) => ({ value: index + 1, label: `${index + 1} · ${word}` }));
}

export function wellnessWord(field: WellnessField, value: number | null): string {
  return value === null ? '–' : (WELLNESS_QUESTIONS[field].words[value - 1] ?? '–');
}

/** Hinweistext für Spieler und Eltern (PO-Entscheidung 02.11.2026). */
export const SELF_REPORT_NOTICE =
  'Deine Angaben helfen dem Trainerteam, dich nicht zu überlasten. Sie sehen nur du, dein Trainerteam und ggf. die medizinische Betreuung.';
export const WELLNESS_NOTICE = 'Die Fragen zum Befinden sind freiwillig.';

export interface SelfReport {
  readonly eventId: string;
  readonly date: string;
  readonly exertion: number;
  /** Server-Zeitpunkt der letzten Änderung; null, solange er (offline) noch fehlt. */
  readonly updatedAt: Date | null;
}

export interface WellnessEntry {
  readonly eventId: string;
  readonly date: string;
  readonly fatigue: number | null;
  readonly sleep: number | null;
  readonly soreness: number | null;
  readonly stress: number | null;
  readonly updatedAt: Date | null;
}

export type WellnessAnswers = Pick<WellnessEntry, WellnessField>;
export const NO_WELLNESS: WellnessAnswers = { fatigue: null, sleep: null, soreness: null, stress: null };

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate();
  if (typeof value === 'string' && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const scaleValue = (value: unknown, min: number, max: number) => (Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null);

export function selfReportFromDoc(id: string, data: Readonly<Record<string, unknown>>): SelfReport | null {
  const exertion = scaleValue(data['exertion'], 0, 10);
  if (exertion === null) return null;
  return { eventId: id, date: typeof data['date'] === 'string' ? data['date'] : '', exertion, updatedAt: toDate(data['updatedAt']) };
}

export function wellnessFromDoc(id: string, data: Readonly<Record<string, unknown>>): WellnessEntry {
  const values = Object.fromEntries(WELLNESS_FIELDS.map((field) => [field, scaleValue(data[field], 1, 7)])) as unknown as WellnessAnswers;
  return { eventId: id, date: typeof data['date'] === 'string' ? data['date'] : '', ...values, updatedAt: toDate(data['updatedAt']) };
}

/** Summe der 4 Befindensfragen (4–28, höher = besser); nur wenn alle 4 beantwortet sind. */
export function wellnessSum(entry: WellnessAnswers): number | null {
  const values = WELLNESS_FIELDS.map((field) => entry[field]);
  return values.every((value): value is number => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function hasWellnessAnswer(entry: WellnessAnswers): boolean {
  return WELLNESS_FIELDS.some((field) => entry[field] !== null);
}

const tookPart = (rating: Rating | null | undefined) => rating?.attendance === 'present' || rating?.attendance === 'limited';

/**
 * Zeitraum, in dem der Spieler antworten kann: ab Ende des Termins (Beginn + geplante Dauer; ohne Startzeit ab
 * Beginn des Termintags) bis Ende des Folgetags (Mitternacht Europe/Berlin).
 */
export function reportWindow(event: Pick<TeamEvent, 'date' | 'startTime' | 'type' | 'matchDuration' | 'durationMinutes'>): { opens: Date; closes: Date } | null {
  const dayStart = berlinInstant(event.date, '00:00');
  const closes = berlinInstant(addDays(event.date, 2), '00:00');
  if (!dayStart || !closes) return null;
  const start = event.startTime ? berlinInstant(event.date, event.startTime) : null;
  const opens = start ? new Date(start.getTime() + plannedMinutes(event) * 60000) : dayStart;
  return { opens, closes };
}

/** Darf der Spieler zu diesem Termin jetzt (noch) antworten? */
export function isReportOpen(item: EventRating, now: Date): boolean {
  if (!tookPart(item.rating)) return false;
  const window = reportWindow(item.event);
  return !!window && now >= window.opens && now < window.closes;
}

/** Termine, zu denen der Spieler jetzt antworten kann, neueste zuerst. */
export function openReportItems(items: readonly EventRating[], now: Date): EventRating[] {
  return items.filter((item) => isReportOpen(item, now)).sort((a, b) => b.event.date.localeCompare(a.event.date));
}

/**
 * Zählt der Spielerwert? Nur, wenn er innerhalb der Frist gespeichert wurde (fehlt der Server-Zeitpunkt noch, weil
 * gerade offline gespeichert, zählt er vorläufig). Ein später geschriebener Wert (z. B. von Hand in der Datenbank)
 * wird ignoriert – dann gilt der Trainerwert.
 */
export function countsReport(event: TeamEvent, report: SelfReport | undefined): report is SelfReport {
  if (!report) return false;
  const window = reportWindow(event);
  return !!window && (report.updatedAt === null || report.updatedAt < window.closes);
}

/** Wirksame Anstrengung eines Termins: Spielerwert, sonst der Trainerwert. */
export function effectiveExertion(event: TeamEvent, report: SelfReport | undefined): number {
  return countsReport(event, report) ? report.exertion : event.exertion;
}

/**
 * Ersetzt in den Terminen eines Spielers die Anstrengung des Trainers durch den Spielerwert (Formel „Minuten ×
 * Anstrengung“ bleibt). Nur Termine mit Teilnahme; alles andere bleibt unverändert.
 */
export function withSelfExertion(items: readonly EventRating[], reports: ReadonlyMap<string, SelfReport>): EventRating[] {
  if (reports.size === 0) return items as EventRating[];
  return items.map((item) => {
    const report = reports.get(item.event.id);
    if (!tookPart(item.rating) || !countsReport(item.event, report) || report.exertion === item.event.exertion) return item;
    return { ...item, event: { ...item.event, exertion: report.exertion } };
  });
}

/** Dokument für `selfReports/{eventId}` (ohne `updatedAt`, das setzt die Zugriffsklasse als Server-Zeitpunkt). */
export function docFromSelfReport(playerId: string, event: TeamEvent, exertion: number, by: string): Record<string, unknown> {
  return { playerId, eventId: event.id, date: event.date, exertion, by };
}

export function docFromWellness(playerId: string, event: TeamEvent, answers: WellnessAnswers, by: string): Record<string, unknown> {
  return { playerId, eventId: event.id, date: event.date, ...answers, by };
}
