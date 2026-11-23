/**
 * Vereinsübersicht (SCRUM-183, PO-Entscheidung B vom 02.11.2026): Der Vereinsadmin sieht alle Teams seines Vereins
 * (Trainer, Spielerzahl, letzte Aktivität, offene Einwilligungen) und kann in jedes Team hineinschauen – nur lesen,
 * ohne Gesundheitsdaten. Die Regeln (firestore.rules, `isClubAdminOfTeam`) sperren für ihn das Spielerdokument (Status,
 * „verletzt bis/seit“), Abwesenheiten, Messwerte, Befinden, Reifedaten, Absagegründe, Rückmeldungen und Notizen.
 *
 * Name, Nummer und Positionen der Spieler liest er darum aus einer Kurzfassung `teams/{teamId}/meta/clubOverview`, die
 * der Trainer-Client schreibt (club-overview.service.ts). Diese Datei enthält nur reine Funktionen dazu.
 */
import type { TeamEvent } from '../events/event';
import type { RawDoc } from '../firebase/types';
import type { Player } from '../player/player';
import { calculatedGrade, roundGrade } from '../ratings/rating';
import { ratingFromStatsEntry } from '../team/player-stats';

/** Datenformat der Kurzfassung (Feld `version`). */
export const CLUB_OVERVIEW_VERSION = 1;

/** Ein Spieler in der Kurzfassung – bewusst nur diese vier Felder, keine Gesundheits- oder Einwilligungsangaben. */
export interface OverviewPlayer {
  readonly id: string;
  readonly name: string;
  readonly number: number;
  readonly positions: readonly string[];
}

export interface ClubOverviewData {
  readonly version: number;
  readonly playerCount: number;
  /** Spieler mit Einwilligung „offen“ (noch nicht dokumentiert). */
  readonly consentPending: number;
  readonly consentRevoked: number;
  readonly players: readonly OverviewPlayer[];
}

export interface ClubOverview extends ClubOverviewData {
  /** Wann der Trainer-Client die Kurzfassung zuletzt geschrieben hat. */
  readonly updatedAt: Date | null;
}

/** Kader → Kurzfassung. Nimmt nur id, Name, Nummer und Positionen auf (die Regel erlaubt keine weiteren Felder oben). */
export function overviewFromPlayers(players: readonly Player[]): ClubOverviewData {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id));
  return {
    version: CLUB_OVERVIEW_VERSION,
    playerCount: sorted.length,
    consentPending: sorted.filter((player) => player.consentStatus === 'pending').length,
    consentRevoked: sorted.filter((player) => player.consentStatus === 'revoked').length,
    players: sorted.map((player) => ({ id: player.id, name: player.name, number: player.number, positions: [...player.positions] })),
  };
}

/** Vergleichsschlüssel: gleicher Inhalt → kein erneutes Schreiben. */
export function overviewKey(data: ClubOverviewData): string {
  return JSON.stringify([data.version, data.playerCount, data.consentPending, data.consentRevoked, data.players.map((p) => [p.id, p.name, p.number, p.positions])]);
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Firestore-Dokument → Kurzfassung (null, wenn es fehlt oder ein anderes Format hat). */
export function overviewFromDoc(data: Readonly<Record<string, unknown>> | null | undefined): ClubOverview | null {
  if (!data || data['version'] !== CLUB_OVERVIEW_VERSION) return null;
  const raw = Array.isArray(data['players']) ? (data['players'] as unknown[]) : [];
  const players: OverviewPlayer[] = raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry['id'] === 'string' ? entry['id'] : '',
      name: typeof entry['name'] === 'string' ? entry['name'] : '',
      number: typeof entry['number'] === 'number' ? entry['number'] : 0,
      positions: Array.isArray(entry['positions']) ? entry['positions'].filter((value): value is string => typeof value === 'string') : [],
    }))
    .filter((player) => player.id);
  const updatedAt = (data['updatedAt'] as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? null;
  return {
    version: CLUB_OVERVIEW_VERSION,
    playerCount: count(data['playerCount']),
    consentPending: count(data['consentPending']),
    consentRevoked: count(data['consentRevoked']),
    players,
    updatedAt,
  };
}

export interface TeamTrainer {
  readonly uid: string;
  readonly email: string;
}

/** Trainer-Zugänge eines Teams (members mit Rolle „trainer“), nach E-Mail sortiert. */
export function trainersFromMembers(members: readonly RawDoc[]): TeamTrainer[] {
  return members
    .filter((member) => member.data['role'] === 'trainer')
    .map((member) => ({ uid: member.id, email: typeof member.data['email'] === 'string' ? member.data['email'] : '' }))
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

/** Letzter Termin bis heute und nächster Termin ab morgen (für „letzte Aktivität“). */
export function lastAndNext(events: readonly Pick<TeamEvent, 'id' | 'date' | 'title' | 'type'>[], today: string): {
  last: Pick<TeamEvent, 'id' | 'date' | 'title' | 'type'> | null;
  next: Pick<TeamEvent, 'id' | 'date' | 'title' | 'type'> | null;
} {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const past = sorted.filter((event) => event.date <= today);
  return { last: past.at(-1) ?? null, next: sorted.find((event) => event.date > today) ?? null };
}

export interface PlayerSummary {
  /** Termine mit „Anwesend“ oder „Eingeschränkt“. */
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  /** Schnitt der Gesamtnoten (null = keine vollständige Bewertung). */
  readonly average: number | null;
}

/**
 * Kennzahlen je Spieler aus playerStats (Anwesenheit, Teilnoten, Tore, Vorlagen – keine Rückmeldung, keine Gründe).
 * Gleiche Gesamtnote wie überall in der App (`calculatedGrade`).
 */
export function playerSummaries(stats: readonly RawDoc[]): Map<string, PlayerSummary> {
  const result = new Map<string, PlayerSummary>();
  for (const entry of stats) {
    const events = entry.data['events'];
    if (!events || typeof events !== 'object') continue;
    let appearances = 0;
    let goals = 0;
    let assists = 0;
    const grades: number[] = [];
    for (const value of Object.values(events as Record<string, unknown>)) {
      const rating = ratingFromStatsEntry(value);
      if (rating.attendance === 'present' || rating.attendance === 'limited') appearances += 1;
      goals += rating.goals ?? 0;
      assists += rating.assists ?? 0;
      const grade = calculatedGrade(rating);
      if (grade !== null) grades.push(grade);
    }
    result.set(entry.id, {
      appearances,
      goals,
      assists,
      average: grades.length ? roundGrade(grades.reduce((sum, grade) => sum + grade, 0) / grades.length) : null,
    });
  }
  return result;
}
