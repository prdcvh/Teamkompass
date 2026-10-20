/**
 * Bereinigte Scout-Ansicht (SCRUM-170). Scouts lesen nie players/ratings/absences/measurements – dort stehen Status,
 * Verletzung, Einwilligung, Messwerte und (in der Bewertungsnotiz) Abwesenheitsgründe. Stattdessen pflegt die
 * Trainer-App je Spieler ein Dokument `scoutProfiles/{playerId}` nur mit den hier aufgezählten Feldern
 * (Positivliste). Gleiches Format wie die Live-Apps (outputs/team-manager/app.js: scoutProfileFor).
 */
import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import type { EventRating } from '../profile/profile';
import { type Rating, ratingFromDoc } from '../ratings/rating';

export const SCOUT_RATING_FIELDS = ['effort', 'technique', 'tactics', 'comprehension', 'minutes', 'goals', 'assists'] as const;

export type ScoutValue = number | string;

export interface ScoutRating {
  readonly attendance: 'present' | 'absent' | 'open';
  readonly effort: ScoutValue;
  readonly technique: ScoutValue;
  readonly tactics: ScoutValue;
  readonly comprehension: ScoutValue;
  readonly minutes: ScoutValue;
  readonly goals: ScoutValue;
  readonly assists: ScoutValue;
}

export interface ScoutProfile {
  readonly playerId: string;
  readonly name: string;
  readonly number: ScoutValue;
  readonly positions: readonly string[];
  readonly birthdate: string;
  readonly ratings: Readonly<Record<string, ScoutRating>>;
}

/** Was ein Scout als Spieler sieht: nur Name, Nummer, Positionen, Geburtsdatum. */
export interface ScoutPlayer {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  readonly positions: readonly string[];
  readonly birthdate: string;
}

/** „Teilweise“ (dosierte Belastung) und „Nicht im Kader“ verraten mehr als die Teilnahme: nur anwesend / fehlt / offen. */
export function scoutAttendance(attendance: unknown): ScoutRating['attendance'] {
  if (attendance === 'present' || attendance === 'limited') return 'present';
  if (attendance === 'absent' || attendance === 'excluded') return 'absent';
  return 'open';
}

/** Nur kurze Zahlen-/Textwerte (Teilnoten, Minuten, Tore) – nie Freitext. */
export function scoutValue(value: unknown): ScoutValue {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 10) return value;
  return '';
}

/** Rohes Bewertungs- oder Profilfeld → bereinigte Scout-Bewertung (Notiz, autoAbsence, Note fallen weg). */
export function scoutRating(raw: Readonly<Record<string, unknown>> | null | undefined): ScoutRating {
  const value = (field: (typeof SCOUT_RATING_FIELDS)[number]) => scoutValue(raw?.[field] ?? '');
  return {
    attendance: scoutAttendance(raw?.['attendance']),
    effort: value('effort'),
    technique: value('technique'),
    tactics: value('tactics'),
    comprehension: value('comprehension'),
    minutes: value('minutes'),
    goals: value('goals'),
    assists: value('assists'),
  };
}

function hasData(rating: ScoutRating): boolean {
  return rating.attendance !== 'open' || SCOUT_RATING_FIELDS.some((field) => rating[field] !== '');
}

/** Bewertung (Trainer-Modell) → Rohfelder wie im Bewertungsdokument (null → ''). */
function rawFromRating(rating: Rating): Record<string, unknown> {
  return {
    attendance: rating.attendance,
    effort: rating.effort ?? '',
    technique: rating.technique ?? '',
    tactics: rating.tactics ?? '',
    comprehension: rating.comprehension ?? '',
    minutes: rating.minutes ?? '',
    goals: rating.goals ?? '',
    assists: rating.assists ?? '',
  };
}

/** Soll-Profil eines Spielers aus Kader und Bewertungen (nur Events mit Daten). */
export function scoutProfileFor(player: Player, ratingsByEvent: ReadonlyMap<string, ReadonlyMap<string, Rating>>): ScoutProfile {
  const ratings: Record<string, ScoutRating> = {};
  for (const [eventId, byPlayer] of ratingsByEvent) {
    const rating = byPlayer.get(player.id);
    if (!rating) continue;
    const clean = scoutRating(rawFromRating(rating));
    if (hasData(clean)) ratings[eventId] = clean;
  }
  return {
    playerId: player.id,
    name: player.name,
    number: scoutValue(player.number),
    positions: player.positions.filter((item) => typeof item === 'string').slice(0, 12),
    birthdate: player.birthdate.slice(0, 10),
    ratings,
  };
}

export function buildScoutProfiles(
  players: readonly Player[],
  ratingsByEvent: ReadonlyMap<string, ReadonlyMap<string, Rating>>,
): Record<string, ScoutProfile> {
  const profiles: Record<string, ScoutProfile> = {};
  for (const player of players) if (player.id) profiles[player.id] = scoutProfileFor(player, ratingsByEvent);
  return profiles;
}

/** JSON mit sortierten Schlüsseln: gleicher Inhalt ergibt denselben Text, egal in welcher Reihenfolge Firestore liefert. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Welche Profile müssen geschrieben bzw. gelöscht werden, damit scoutProfiles dem Soll-Stand entspricht? */
export function scoutProfileWrites(
  expected: Readonly<Record<string, ScoutProfile>>,
  existing: Readonly<Record<string, unknown>>,
): { set: [string, ScoutProfile][]; remove: string[] } {
  const set = Object.entries(expected).filter(([id, profile]) => !(id in existing) || stableJson(existing[id]) !== stableJson(profile));
  const remove = Object.keys(existing).filter((id) => !(id in expected));
  return { set, remove };
}

/** Scout-Seite: Profil-Dokument → Spieler (ohne Status, Verletzung, Einwilligung). */
export function scoutPlayerFromDoc(id: string, data: Readonly<Record<string, unknown>>): ScoutPlayer {
  const number = Number(data['number']);
  return {
    id,
    name: typeof data['name'] === 'string' ? data['name'] : '',
    number: Number.isFinite(number) ? number : 0,
    positions: Array.isArray(data['positions']) ? data['positions'].filter((item): item is string => typeof item === 'string') : [],
    birthdate: typeof data['birthdate'] === 'string' ? data['birthdate'] : '',
  };
}

/** Scout-Seite: Profil-Dokument → Bewertung je Event (bereinigt; Notiz bleibt immer leer). */
export function scoutRatingsFromDoc(data: Readonly<Record<string, unknown>>): ReadonlyMap<string, Rating> {
  const raw = data['ratings'];
  const result = new Map<string, Rating>();
  if (!raw || typeof raw !== 'object') return result;
  for (const [eventId, value] of Object.entries(raw as Record<string, unknown>)) {
    const clean = scoutRating(value && typeof value === 'object' ? (value as Record<string, unknown>) : null);
    result.set(eventId, ratingFromDoc(clean as unknown as Record<string, unknown>));
  }
  return result;
}

/** Alle Events (neueste zuerst) mit der Scout-Bewertung des Spielers (oder null). */
export function scoutItems(events: readonly TeamEvent[], ratings: ReadonlyMap<string, Rating> | undefined): EventRating[] {
  return [...events]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((event) => ({ event, rating: ratings?.get(event.id) ?? null }));
}
