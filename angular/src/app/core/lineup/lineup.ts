/**
 * Startelf bearbeiten: Aufstellung je Zone, Umwandlung von/nach `teams/{teamId}/meta/lineup`
 * (`{ assignments: { <Zone>: [playerId, …] } }`), Verschieben, Tauschen, Auswechseln, Bank und Mannschaftsnote
 * (wie outputs/team-manager/app.js: movePlayerToZone, swapPlayers). Noten sind Schulnoten: kleiner ist besser.
 */
import { roundGrade } from '../ratings/rating';
import { MAX_ON_PITCH, PITCH_BANDS, ZONES, type Zone } from './pitch';
import type { Candidate } from './formation-assignment';

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
