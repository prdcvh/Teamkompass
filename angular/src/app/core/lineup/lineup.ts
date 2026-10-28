/**
 * Startelf bearbeiten: Aufstellung je Zone, Umwandlung von/nach `teams/{teamId}/meta/lineup`
 * (`{ assignments: { <Zone>: [playerId, …] } }`), Verschieben, Tauschen, Auswechseln, Bank und Mannschaftsnote
 * (wie Alt-App app.js: movePlayerToZone, swapPlayers). Noten sind Schulnoten: kleiner ist besser.
 */
import { roundGrade } from '../ratings/rating';
import { MAX_ON_PITCH, PITCH_BANDS, PITCH_ZONES, ZONES, type Zone } from './pitch';
import type { Candidate } from './formation-assignment';
import type { Player } from '../player/player';
import type { TeamEvent } from '../events/event';

export type Assignments = Readonly<Record<Zone, readonly string[]>>;

export function emptyAssignments(): Assignments {
  return Object.fromEntries(ZONES.map((zone) => [zone, []])) as unknown as Assignments;
}

/** Dokument → Aufstellung: unbekannte Zonen und (bei bekanntem Kader) unbekannte Spieler fallen weg; Doppelte auch. */
export function normalizeLineup(doc: unknown, playerIds?: ReadonlySet<string>): Assignments {
  const raw = (doc as { assignments?: Record<string, unknown> } | null | undefined)?.assignments;
  const seen = new Set<string>();
  const result: Record<string, string[]> = {};
  for (const zone of ZONES) {
    const ids = Array.isArray(raw?.[zone]) ? (raw![zone] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
    result[zone] = ids.filter((id) => {
      if (seen.has(id) || (playerIds && playerIds.size > 0 && !playerIds.has(id))) return false;
      seen.add(id);
      return true;
    });
  }
  return result as unknown as Assignments;
}

/** Aufstellung → Dokument. */
export function docFromLineup(assignments: Assignments): Record<string, unknown> {
  return { assignments: Object.fromEntries(ZONES.map((zone) => [zone, [...assignments[zone]]])) };
}

export function lineupIsEmpty(assignments: Assignments): boolean {
  return ZONES.every((zone) => assignments[zone].length === 0);
}

export function onPitchCount(assignments: Assignments): number {
  return ZONES.reduce((sum, zone) => sum + assignments[zone].length, 0);
}

export function onPitchIds(assignments: Assignments): Set<string> {
  return new Set(ZONES.flatMap((zone) => assignments[zone]));
}

export function zoneOf(assignments: Assignments, playerId: string): Zone | null {
  return ZONES.find((zone) => assignments[zone].includes(playerId)) ?? null;
}

/** „4-3-3“ aus der Anzahl je Band (leere Bänder entfallen); ohne Spieler „Keine Aufstellung“. */
export function formationName(assignments: Assignments): string {
  const parts = PITCH_BANDS.map((zones) => zones.reduce((sum, zone) => sum + assignments[zone].length, 0)).filter((count) => count > 0);
  return parts.length ? parts.join('-') : 'Keine Aufstellung';
}

function without(assignments: Assignments, ids: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(ZONES.map((zone) => [zone, assignments[zone].filter((id) => !ids.includes(id))]));
}

/** Stellt den Spieler in die Zone (und nimmt ihn aus der bisherigen); „voll“, wenn er neu dazukäme und schon 11 stehen. */
export function moveToZone(assignments: Assignments, playerId: string, zone: Zone): Assignments | 'voll' {
  if (zoneOf(assignments, playerId) === null && onPitchCount(assignments) >= MAX_ON_PITCH) return 'voll';
  const next = without(assignments, [playerId]);
  next[zone].push(playerId);
  return next as unknown as Assignments;
}

export function removeFromPitch(assignments: Assignments, playerId: string): Assignments {
  return without(assignments, [playerId]) as unknown as Assignments;
}

/** Tauscht zwei Spieler; kommt einer von der Bank, geht der andere dafür auf die Bank (normale Einwechslung). */
export function swapPlayers(assignments: Assignments, a: string, b: string): Assignments {
  if (a === b) return assignments;
  const zoneA = zoneOf(assignments, a);
  const zoneB = zoneOf(assignments, b);
  const next = without(assignments, [a, b]);
  if (zoneB) next[zoneB].push(a);
  if (zoneA) next[zoneA].push(b);
  return next as unknown as Assignments;
}

/** Spieler auf der Bank: beste Note zuerst, noch unbewertete danach nach Rückennummer. */
export function benchOf(assignments: Assignments, entries: readonly Candidate[]): Candidate[] {
  const onPitch = onPitchIds(assignments);
  return entries
    .filter((entry) => !onPitch.has(entry.player.id))
    .sort((a, b) => {
      if (a.grade !== null && b.grade !== null && a.grade !== b.grade) return a.grade - b.grade;
      if (a.grade !== null && b.grade === null) return -1;
      if (a.grade === null && b.grade !== null) return 1;
      return a.player.number - b.player.number;
    });
}

/** Mannschaftsnote der Startelf (Mittel der Durchschnittsnoten); null ohne Noten. */
export function lineupGrade(assignments: Assignments, entries: readonly Candidate[]): number | null {
  const onPitch = onPitchIds(assignments);
  const grades = entries.filter((entry) => onPitch.has(entry.player.id) && entry.grade !== null).map((entry) => entry.grade as number);
  return grades.length ? roundGrade(grades.reduce((sum, value) => sum + value, 0) / grades.length) : null;
}

/** Aufstellung eines Spiels (SCRUM-29 der Live-App): `meta/lineup.byEvent[eventId] = { assignments, savedAt }`. */
export interface EventLineup {
  readonly assignments: Assignments;
  /** ISO-Zeitpunkt des Speicherns; leer, wenn das Dokument keinen hat. */
  readonly savedAt: string;
}

export type EventLineups = Readonly<Record<string, EventLineup>>;

/**
 * `byEvent` des Dokuments → Aufstellungen je Spiel (wie normalizeEventLineups der Live-App): unbekannte Zonen/Spieler
 * (bei bekanntem Kader) fallen weg. Ein Eintrag ohne Spieler bleibt erhalten, wenn er ein `savedAt` hat: Der Trainer hat
 * das Feld bewusst geleert (SCRUM-219) – das Spiel zeigt dann ein leeres Feld statt der allgemeinen Startelf. Ohne Spieler
 * UND ohne `savedAt` (Altbestand) entfällt der Eintrag.
 */
export function normalizeEventLineups(raw: unknown, playerIds?: ReadonlySet<string>): EventLineups {
  const result: Record<string, EventLineup> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [eventId, entry] of Object.entries(raw)) {
    const assignments = normalizeLineup(entry, playerIds);
    const raw = (entry as { savedAt?: unknown } | null)?.savedAt;
    const savedAt = typeof raw === 'string' ? raw : '';
    if (lineupIsEmpty(assignments) && !savedAt) continue;
    result[eventId] = { assignments, savedAt };
  }
  return result;
}

/** Aufstellung eines Spiels → Eintrag in `byEvent` (genau das Format der Live-App). */
export function docFromEventLineup(assignments: Assignments, savedAt: string): Record<string, unknown> {
  return { ...docFromLineup(assignments), savedAt };
}

/** Das nächste anstehende Spiel (heute oder später); null, wenn keins ansteht. */
export function nextGame(events: readonly TeamEvent[], today: string): TeamEvent | null {
  return [...events].filter((event) => event.type === 'Spiel' && event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/**
 * Letztes Spiel vor dem Ziel-Spiel (ohne Ziel: vor heute), für das eine Aufstellung gespeichert ist. Bewusst geleerte
 * Aufstellungen (SCRUM-219) werden übersprungen – es gibt nichts zu übernehmen.
 */
export function previousGameWithLineup(events: readonly TeamEvent[], lineups: EventLineups, target: TeamEvent | null, today: string): TeamEvent | null {
  const before = target?.date ?? today;
  return (
    [...events]
      .filter((event) => event.type === 'Spiel' && event.id !== target?.id && event.date < before && lineups[event.id] && !lineupIsEmpty(lineups[event.id].assignments))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  );
}

/** Gespeicherte Aufstellung zum Anzeigen (nur lesend): Zeilen je besetzter Zone, Formationsname und Bank. */
export function lineupSummary(assignments: Assignments, players: readonly Player[]) {
  const byId = new Map(players.map((player) => [player.id, player]));
  const rows = ZONES.map((zone) => ({ zone, players: assignments[zone].flatMap((id) => byId.get(id) ?? []) })).filter((row) => row.players.length > 0);
  const onPitch = onPitchIds(assignments);
  const bench = [...players].filter((player) => !onPitch.has(player.id)).sort((a, b) => a.number - b.number);
  return { name: formationName(assignments), rows, bench };
}

/** Ein Spieler als Punkt auf dem Mini-Spielfeld des Start-Dashboards (Prozent, Tor unten wie im Taktikboard). */
export interface PitchMarker {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  readonly zone: Zone;
  readonly x: number;
  readonly y: number;
}

/**
 * Punkte der Startelf: Mehrere Spieler einer Zone werden gleichmäßig über deren Breite verteilt
 * (z. B. zwei Innenverteidiger links und rechts der Mitte). Unbekannte Spieler fallen weg.
 */
export function pitchMarkers(assignments: Assignments, players: readonly Player[]): PitchMarker[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  return ZONES.flatMap((zone) => {
    const { x, y, width } = PITCH_ZONES[zone];
    const placed = assignments[zone].flatMap((id) => byId.get(id) ?? []);
    return placed.map((player, index) => ({
      id: player.id,
      name: player.name,
      number: player.number,
      zone,
      x: Math.round((x - width / 2 + (width * (index + 0.5)) / placed.length) * 10) / 10,
      y,
    }));
  });
}
