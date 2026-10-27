/**
 * Zu- und Absagen für Termine (SCRUM-205, gleiches Verhalten wie SCRUM-175 in Alt-App app.js, Abschnitt
 * „RSVP“). Spieler und Eltern sagen für den eigenen Spieler zu („yes“) oder ab („no“), optional mit Grund.
 * Gespeichert in `teams/{teamId}/events/{eventId}/responses/{playerId}` mit genau den Feldern playerId, status, reason,
 * by und updatedAt (Server-Zeitstempel) – so lesen und schreiben Alt-App und Angular-App dieselben Daten, und die
 * Regeln aus SCRUM-175 gelten unverändert.
 * Eine Absage belegt die Anwesenheit mit „Fehlt“ vor, eine spätere Zusage setzt sie auf „Offen“ zurück – aber nur,
 * solange niemand die Bewertung von Hand geändert hat (Markierung `rsvpAbsence`).
 */
import type { Role } from '../auth/role';
import type { TeamEvent } from '../events/event';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import { addDays } from '../shared/dates';

export const RSVP_STATUSES = ['yes', 'no'] as const;
export type RsvpAnswer = (typeof RSVP_STATUSES)[number];
export type RsvpStatus = RsvpAnswer | 'open';
export type RsvpRole = Extract<Role, 'player' | 'parent'>;

/** Höchstlänge des Grundes (die Regeln lehnen längere ab). */
export const RSVP_REASON_MAX = 200;
/** Der Trainer sieht Rückmeldungen für kommende Termine und die der letzten Tage (späte Absagen). */
export const RSVP_TRAINER_LOOKBACK_DAYS = 14;
/** So viele kommende Termine sehen Spieler und Eltern. */
export const RSVP_PLAYER_EVENT_LIMIT = 10;

export interface RsvpResponse {
  readonly status: RsvpAnswer;
  readonly reason: string;
  /** Wer geantwortet hat: Spieler oder Eltern ('' bei unbekannten Altdaten). */
  readonly by: RsvpRole | '';
}

/** Rückmeldungen eines Events je Spieler-ID. */
export type EventResponses = ReadonlyMap<string, RsvpResponse>;

export interface RsvpCounts {
  readonly yes: number;
  readonly no: number;
  readonly open: number;
}

function isAnswer(value: unknown): value is RsvpAnswer {
  return RSVP_STATUSES.some((status) => status === value);
}

/** Grund bereinigt: Leerraum zusammengefasst, höchstens {@link RSVP_REASON_MAX} Zeichen. */
export function rsvpReason(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, RSVP_REASON_MAX);
}

/** Firestore-Dokument → Rückmeldung; unbekannter Status = keine Rückmeldung (null). */
export function responseFromDoc(data: Readonly<Record<string, unknown>> | null | undefined): RsvpResponse | null {
  if (!data || !isAnswer(data['status'])) return null;
  const by = data['by'] === 'player' || data['by'] === 'parent' ? data['by'] : '';
  return { status: data['status'], reason: typeof data['reason'] === 'string' ? data['reason'] : '', by };
}

export function rsvpStatus(responses: EventResponses | undefined, playerId: string): RsvpStatus {
  return responses?.get(playerId)?.status ?? 'open';
}

/** Zugesagt/abgesagt/offen über alle Spieler des Kaders (Rückmeldungen gelöschter Spieler zählen nicht). */
export function rsvpCounts(responses: EventResponses | undefined, players: readonly { readonly id: string }[]): RsvpCounts {
  const counts = { yes: 0, no: 0, open: 0 };
  for (const player of players) counts[rsvpStatus(responses, player.id)] += 1;
  return counts;
}

export function rsvpCountsText(counts: RsvpCounts): string {
  return `${counts.yes} zugesagt · ${counts.no} abgesagt · ${counts.open} offen`;
}

/** Notiz in der Bewertung bei einer Absage: „Abgesagt“ bzw. „Abgesagt: Grund“. */
export function rsvpAbsenceNote(response: RsvpResponse | null | undefined): string {
  const reason = rsvpReason(response?.reason);
  return reason ? `Abgesagt: ${reason}` : 'Abgesagt';
}

/**
 * Inhalt des Firestore-Dokuments (ohne Zeitstempel, den setzt der Server). Ein Grund nur bei einer Absage.
 * Null, wenn Spieler, Status oder Rolle nicht passen (nur Spieler und Eltern antworten).
 */
export function buildRsvpResponse(
  playerId: string | null,
  status: string,
  reason: unknown,
  role: Role | null,
): { playerId: string; status: RsvpAnswer; reason: string; by: RsvpRole } | null {
  if (!playerId || !isAnswer(status) || (role !== 'player' && role !== 'parent')) return null;
  return { playerId, status, reason: status === 'no' ? rsvpReason(reason) : '', by: role };
}

/** Für welche Events Rückmeldungen gelesen werden: ab heute (Spieler/Eltern) bzw. ab heute minus lookbackDays (Trainer). */
export function rsvpEventIds(events: readonly TeamEvent[], today: string, lookbackDays = 0): string[] {
  const from = lookbackDays ? addDays(today, -lookbackDays) : today;
  return events.filter((event) => event.id && event.date && event.date >= from).map((event) => event.id);
}

/** Termine, auf die Spieler/Eltern antworten können: heute und später, chronologisch, höchstens `limit`. */
export function upcomingRsvpEvents(events: readonly TeamEvent[], today: string, limit = RSVP_PLAYER_EVENT_LIMIT): TeamEvent[] {
  return events
    .filter((event) => event.date && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Kommt ein Termin noch (heute oder später)? Nur dafür zeigt die Eventliste die Zählung. */
export function isUpcoming(event: TeamEvent, today: string): boolean {
  return !!event.date && event.date >= today;
}

/**
 * Neue Bewertung eines Spielers nach seiner Rückmeldung (wie applyRsvpAbsence der bisherigen App):
 * - Absage: eine unbearbeitete Bewertung („Offen“ ohne Eingaben, nicht von der Abwesenheits-Automatik gesetzt) wird
 *   „Fehlt“ mit der Notiz „Abgesagt[: Grund]“ und der Markierung `rsvpAbsence`. Ein bereits so markierter Eintrag
 *   bekommt nur den neuen Grund.
 * - Zusage oder keine Rückmeldung: nur ein markierter Eintrag wird auf „Offen“ zurückgesetzt (Markierung false).
 * Von Hand geänderte Bewertungen bleiben immer stehen. Rückgabe: die neue Bewertung oder null, wenn sich nichts ändert.
 */
export function rsvpAbsenceRating(existing: Rating | null, response: RsvpResponse | null | undefined): Rating | null {
  if (response?.status === 'no') {
    const note = rsvpAbsenceNote(response);
    if (existing?.rsvpAbsence) {
      if (existing.attendance === 'absent' && existing.note === note) return null;
      return { ...existing, attendance: 'absent', note };
    }
    if (existing?.autoAbsence) return null;
    if (existing && existing.attendance !== 'open') return null;
    if (existing && hasRatingData(existing)) return null;
    return { ...BLANK_RATING, attendance: 'absent', note, rsvpAbsence: true };
  }
  if (!existing?.rsvpAbsence) return null;
  return { ...BLANK_RATING, rsvpAbsence: false };
}

function hasRatingData(rating: Rating): boolean {
  return (
    rating.effort !== null || rating.technique !== null || rating.tactics !== null || rating.comprehension !== null ||
    rating.minutes !== null || rating.goals !== null || rating.assists !== null || rating.note !== ''
  );
}

/** Kennung einer Rückmeldung, um Änderungen zu erkennen („open“, „yes“ oder „no|Grund“). */
export function responseKey(response: RsvpResponse | null | undefined): string {
  if (!response) return 'open';
  return response.status === 'no' ? `no|${rsvpReason(response.reason)}` : 'yes';
}
