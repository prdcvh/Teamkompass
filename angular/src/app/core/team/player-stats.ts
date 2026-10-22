/**
 * Zusammenfassung je Spieler (SCRUM-201): `teams/{teamId}/playerStats/{playerId}` hält je Event genau die Felder einer
 * Bewertung, aus denen die Übersichten (Start, Aufstellung, Teamanalyse, Scout-Sicht) rechnen – Anwesenheit, die vier
 * Teilnoten, Minuten, Tore und Vorlagen. Keine Rückmeldung, keine internen Notizen.
 *
 * Bewusst keine vorab gerechneten Summen oder Schnitte: Aus der Zusammenfassung entsteht wieder genau dieselbe
 * {@link RatingsByEvent}-Struktur wie aus den Einzelbewertungen, und alle Kennzahlen laufen unverändert durch dieselben
 * Funktionen. So sind sie per Konstruktion identisch, statt eine zweite Rechnung abgleichen zu müssen.
 *
 * Dokument: `{ playerId, version, events: { <eventId>: StatsEntry } }`. Ein Eintrag hat immer alle Felder (fehlend =
 * null), damit ein Firestore-„merge“ den Eintrag vollständig ersetzt und nie alte Teilwerte stehen bleiben.
 */
import { type TeamEvent } from '../events/event';
import { type Rating, ratingFromDoc } from '../ratings/rating';
import type { RatingsByEvent } from './team';

/** Datenformat der Zusammenfassung; eine andere Version gilt als „nicht eingerichtet“ (dann wie bisher rechnen). */
export const PLAYER_STATS_VERSION = 1;

/** Felder einer Bewertung, die in die Zusammenfassung übernommen werden. */
export const STATS_FIELDS = ['attendance', 'effort', 'technique', 'tactics', 'comprehension', 'minutes', 'goals', 'assists'] as const;

/**
 * Felder, die ein Bewertungs-Schreibvorgang vollständig enthalten muss, damit die Zusammenfassung aus ihm allein
 * gebildet werden kann (`grade` gehört dazu: ältere Dokumente füllen fehlende Teilnoten damit).
 */
export const RATING_SOURCE_FIELDS = ['attendance', 'grade', 'effort', 'technique', 'tactics', 'comprehension', 'minutes', 'goals', 'assists'] as const;

export interface StatsEntry {
  readonly attendance: Rating['attendance'];
  readonly effort: number | null;
  readonly technique: number | null;
  readonly tactics: number | null;
  readonly comprehension: number | null;
  readonly minutes: number | null;
  readonly goals: number | null;
  readonly assists: number | null;
}

export interface PlayerStatsDoc {
  readonly playerId: string;
  readonly version: number;
  readonly events: Readonly<Record<string, StatsEntry>>;
}

export function statsEntry(rating: Rating): StatsEntry {
  return {
    attendance: rating.attendance,
    effort: rating.effort,
    technique: rating.technique,
    tactics: rating.tactics,
    comprehension: rating.comprehension,
    minutes: rating.minutes,
    goals: rating.goals,
    assists: rating.assists,
  };
}

/** Eintrag → Bewertung (gleiche Prüfung wie für ein Bewertungsdokument; ohne Rückmeldung und Auto-Markierung). */
export function ratingFromStatsEntry(value: unknown): Rating {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const picked: Record<string, unknown> = {};
  for (const field of STATS_FIELDS) picked[field] = data[field];
  return ratingFromDoc(picked);
}

/** Hat ein Bewertungs-Schreibvorgang alle Felder, aus denen die Zusammenfassung entsteht? */
export function hasStatsSource(data: Readonly<Record<string, unknown>>): boolean {
  return RATING_SOURCE_FIELDS.every((field) => field in data);
}

/**
 * Der Teil der Zusammenfassung, der beim Speichern einer Bewertung im selben Schreibvorgang mitgeschrieben wird
 * (Firestore `set` mit `merge`). `data` ist das geschriebene Bewertungsdokument (siehe `docFromRating`).
 */
export function statsUpdate(playerId: string, eventId: string, data: Readonly<Record<string, unknown>>): PlayerStatsDoc {
  return { playerId, version: PLAYER_STATS_VERSION, events: { [eventId]: statsEntry(ratingFromDoc(data)) } };
}

/** Neuberechnung: aus allen Bewertungen (je Event, je Spieler) die Zusammenfassung jedes Spielers mit Bewertungen. */
export function buildPlayerStats(eventIds: readonly string[], ratings: RatingsByEvent): Map<string, PlayerStatsDoc> {
  const byPlayer = new Map<string, Record<string, StatsEntry>>();
  for (const eventId of eventIds) {
    for (const [playerId, rating] of ratings.get(eventId) ?? new Map<string, Rating>()) {
      const events = byPlayer.get(playerId) ?? {};
      events[eventId] = statsEntry(rating);
      byPlayer.set(playerId, events);
    }
  }
  return new Map([...byPlayer].map(([playerId, events]) => [playerId, { playerId, version: PLAYER_STATS_VERSION, events }]));
}

/** Rohdokumente (Bewertungen je Event) → {@link RatingsByEvent}, wie es die Übersichten bisher aus den Abos bilden. */
export function ratingsFromDocs(docsByEvent: ReadonlyMap<string, readonly { id: string; data: Readonly<Record<string, unknown>> }[]>): RatingsByEvent {
  return new Map([...docsByEvent].map(([eventId, docs]) => [eventId, new Map(docs.map((entry) => [entry.id, ratingFromDoc(entry.data)]))]));
}

/**
 * Zusammenfassungen → {@link RatingsByEvent} für die bestehenden Events. Jedes Event bekommt einen (ggf. leeren)
 * Eintrag wie bei den bisherigen Abos; Einträge zu gelöschten Events werden ignoriert.
 */
export function ratingsFromPlayerStats(docs: readonly { id: string; data: Readonly<Record<string, unknown>> }[], events: readonly Pick<TeamEvent, 'id'>[]): RatingsByEvent {
  const result = new Map<string, Map<string, Rating>>(events.map((event) => [event.id, new Map()]));
  for (const { id: playerId, data } of docs) {
    const entries = data['events'];
    if (!entries || typeof entries !== 'object') continue;
    for (const [eventId, entry] of Object.entries(entries as Record<string, unknown>)) {
      result.get(eventId)?.set(playerId, ratingFromStatsEntry(entry));
    }
  }
  return result;
}

export interface StatsDifference {
  readonly playerId: string;
  readonly eventId: string;
}

/**
 * Prüfung „Zusammenfassung = Neuberechnung“: vergleicht je Spieler und bestehendem Event den gespeicherten Eintrag mit
 * dem aus den Bewertungen neu gerechneten. Fehlt er auf einer Seite, ist das eine Abweichung.
 */
export function compareStats(
  stored: readonly { id: string; data: Readonly<Record<string, unknown>> }[],
  expected: ReadonlyMap<string, PlayerStatsDoc>,
  eventIds: readonly string[],
): StatsDifference[] {
  const storedEntries = new Map<string, Record<string, unknown>>();
  for (const { id, data } of stored) {
    const entries = data['events'];
    storedEntries.set(id, entries && typeof entries === 'object' ? (entries as Record<string, unknown>) : {});
  }
  const players = [...new Set([...storedEntries.keys(), ...expected.keys()])].sort();
  const differences: StatsDifference[] = [];
  for (const playerId of players) {
    for (const eventId of eventIds) {
      const raw = storedEntries.get(playerId)?.[eventId];
      const have = raw === undefined ? null : statsEntry(ratingFromStatsEntry(raw));
      const want = expected.get(playerId)?.events[eventId] ?? null;
      if (!sameEntry(have, want) || (raw !== undefined && !isCleanEntry(raw))) differences.push({ playerId, eventId });
    }
  }
  return differences;
}

function sameEntry(a: StatsEntry | null, b: StatsEntry | null): boolean {
  if (a === null || b === null) return a === b;
  return STATS_FIELDS.every((field) => a[field] === b[field]);
}

/** Ein gespeicherter Eintrag muss genau so aussehen, wie die App ihn schreibt (sonst still „repariertes“ Lesen). */
function isCleanEntry(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const data = raw as Record<string, unknown>;
  const normalized = statsEntry(ratingFromStatsEntry(data));
  return STATS_FIELDS.every((field) => data[field] === normalized[field]);
}

/** Schreibplan der Neuberechnung: jede Zusammenfassung komplett ersetzen, verwaiste (ohne Bewertungen) löschen. */
export function rebuildPlan(
  storedIds: readonly string[],
  expected: ReadonlyMap<string, PlayerStatsDoc>,
): { readonly set: readonly PlayerStatsDoc[]; readonly remove: readonly string[] } {
  return {
    set: [...expected.values()],
    remove: storedIds.filter((id) => !expected.has(id)),
  };
}
