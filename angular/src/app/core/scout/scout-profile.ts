/**
 * Scout-Sicht (SCRUM-170): `teams/{teamId}/scoutProfiles/{playerId}`, eine bereinigte Kopie je Spieler, die nur der
 * Trainer-Client schreibt und die Scouts als einzige Spielerdaten lesen dürfen (siehe firestore.rules).
 *
 * Warum eine Kopie: Spielerdokumente enthalten Status/„Verletzt bis“, Bewertungsdokumente eine Rückmeldung, in die
 * die Abwesenheits-Automatik den Grund schreibt („Verletzt“, „Urlaub“ …). Firestore kann einzelne Felder nicht
 * verbergen – Scouts lesen diese Dokumente deshalb gar nicht.
 *
 * Inhalt: Name, Nummer, Positionen, Geburtsdatum und je Termin Datum/Art/Titel (Spiel: Gegner, Ergebnis, Spieldauer),
 * die Anwesenheit ohne Grund („Teilweise“ zählt als anwesend), die vier Teilnoten, Minuten, Tore und Vorlagen.
 * Keine Rückmeldungen, Notizen, Status, Abwesenheiten, Messwerte oder Förderpläne. Spieler mit widerrufener
 * Einwilligung (SCRUM-51) erscheinen nicht. Gleiches Format wie `buildScoutProfiles` in Alt-App app.js.
 */
import { type TeamEvent, eventFromDoc } from '../events/event';
import { type Player, playerFromDoc } from '../player/player';
import type { EventRating } from '../profile/profile';
import { type Rating, ratingFromDoc } from '../ratings/rating';
import type { RatingsByEvent } from '../team/team';
import type { RawDoc } from '../firebase/types';

export const SCOUT_PROFILE_VERSION = 1;

type ScoutAttendance = 'present' | 'absent' | 'excluded' | 'open';

export interface ScoutEntry {
  readonly eventId: string;
  readonly date: string;
  readonly type: string;
  readonly title: string;
  readonly attendance: ScoutAttendance;
  readonly opponent?: string;
  readonly goalsFor?: number | null;
  readonly goalsAgainst?: number | null;
  readonly matchDuration?: number | null;
  readonly effort?: number | null;
  readonly technique?: number | null;
  readonly tactics?: number | null;
  readonly comprehension?: number | null;
  readonly minutes?: number | null;
  readonly goals?: number | null;
  readonly assists?: number | null;
}

export interface ScoutProfileDoc {
  readonly playerId: string;
  readonly name: string;
  readonly number: number | null;
  readonly positions: readonly string[];
  readonly birthdate: string;
  readonly version: number;
  readonly entries: readonly ScoutEntry[];
}

export type ScoutChange = { readonly type: 'set'; readonly id: string; readonly data: ScoutProfileDoc } | { readonly type: 'delete'; readonly id: string };

const ATTENDANCE: Readonly<Record<string, ScoutAttendance>> = { present: 'present', limited: 'present', absent: 'absent', excluded: 'excluded' };

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Ein Termin-Eintrag; null = nichts zu zeigen (keine Bewertung, oder noch offen und ohne jeden Wert). */
export function scoutEntryFor(event: TeamEvent, rating: Rating | null | undefined): ScoutEntry | null {
  if (!rating) return null;
  const attendance = ATTENDANCE[rating.attendance] ?? 'open';
  const base: ScoutEntry = {
    eventId: event.id,
    date: event.date,
    type: event.type,
    title: event.title,
    attendance,
    ...(event.type === 'Spiel'
      ? { opponent: event.opponent, goalsFor: finiteOrNull(event.goalsFor), goalsAgainst: finiteOrNull(event.goalsAgainst), matchDuration: finiteOrNull(event.matchDuration) }
      : {}),
  };
  // „Fehlt“ und „Nicht im Kader“: nur die Tatsache (für Einsatzquote/Teilnahmen), nie der Grund, keine Werte.
  if (attendance === 'absent' || attendance === 'excluded') return base;
  const values = {
    effort: finiteOrNull(rating.effort),
    technique: finiteOrNull(rating.technique),
    tactics: finiteOrNull(rating.tactics),
    comprehension: finiteOrNull(rating.comprehension),
    minutes: finiteOrNull(rating.minutes),
    goals: finiteOrNull(rating.goals),
    assists: finiteOrNull(rating.assists),
  };
  if (attendance === 'open' && Object.values(values).every((value) => value === null)) return null;
  return { ...base, ...values };
}

/** Soll-Stand der Scout-Sicht: playerId → Dokument. */
export function buildScoutProfiles(players: readonly Player[], events: readonly TeamEvent[], ratings: RatingsByEvent): Map<string, ScoutProfileDoc> {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const profiles = new Map<string, ScoutProfileDoc>();
  for (const player of players) {
    if (player.consentStatus === 'revoked') continue;
    profiles.set(player.id, {
      playerId: player.id,
      name: player.name,
      number: finiteOrNull(player.number),
      positions: [...player.positions],
      birthdate: player.birthdate,
      version: SCOUT_PROFILE_VERSION,
      entries: sorted.map((event) => scoutEntryFor(event, ratings.get(event.id)?.get(player.id))).filter((entry) => entry !== null),
    });
  }
  return profiles;
}

/** Vergleich unabhängig von der Reihenfolge der Felder (Firestore liefert Maps nicht in Schreibreihenfolge). */
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

/** Nötige Schreibvorgänge, damit die veröffentlichte Scout-Sicht dem Soll entspricht (überzählige werden gelöscht). */
export function scoutProfileChanges(published: ReadonlyMap<string, unknown>, wanted: ReadonlyMap<string, ScoutProfileDoc>): ScoutChange[] {
  const changes: ScoutChange[] = [];
  for (const [id, data] of wanted) {
    if (!published.has(id) || stableJson(published.get(id)) !== stableJson(data)) changes.push({ type: 'set', id, data });
  }
  for (const id of published.keys()) {
    if (!wanted.has(id)) changes.push({ type: 'delete', id });
  }
  return changes;
}

export interface ScoutView {
  readonly players: readonly Player[];
  /** playerId → alle Termine mit Bewertung (neueste zuerst), wie `ProfileService.items`. */
  readonly items: ReadonlyMap<string, readonly EventRating[]>;
}

/**
 * Scout-Ansicht: Dokumente der Scout-Sicht → Spieler und Termine für die Profil-Auswertungen. Nur die bekannten Felder
 * werden übernommen; Status bleibt „Fit“ ohne Bedeutung (wird Scouts nicht gezeigt), Rückmeldungen bleiben leer.
 */
export function scoutViewFromDocs(docs: readonly RawDoc[]): ScoutView {
  const players: Player[] = [];
  const items = new Map<string, EventRating[]>();
  for (const doc of docs) {
    const data = doc.data;
    const playerId = typeof data['playerId'] === 'string' && data['playerId'] ? data['playerId'] : doc.id;
    players.push(playerFromDoc(playerId, { name: data['name'], number: data['number'], positions: data['positions'], birthdate: data['birthdate'] }));
    const entries = Array.isArray(data['entries']) ? (data['entries'] as unknown[]) : [];
    const list: EventRating[] = [];
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry['eventId'] !== 'string' || !entry['eventId']) continue;
      const event = eventFromDoc(entry['eventId'], {
        type: entry['type'],
        title: entry['title'],
        date: entry['date'],
        opponent: entry['opponent'],
        goalsFor: entry['goalsFor'],
        goalsAgainst: entry['goalsAgainst'],
        matchDuration: entry['matchDuration'],
      });
      const rating = ratingFromDoc({
        attendance: ATTENDANCE[String(entry['attendance'])] ?? 'open',
        effort: entry['effort'],
        technique: entry['technique'],
        tactics: entry['tactics'],
        comprehension: entry['comprehension'],
        minutes: entry['minutes'],
        goals: entry['goals'],
        assists: entry['assists'],
      });
      list.push({ event, rating });
    }
    items.set(playerId, list.sort((a, b) => b.event.date.localeCompare(a.event.date)));
  }
  return { players, items };
}

/** Rohdokument für den Abgleich (nur die Daten, wie sie in Firestore stehen). */
export function publishedMap(docs: readonly RawDoc[]): Map<string, unknown> {
  return new Map(docs.map((doc) => [doc.id, doc.data]));
}
