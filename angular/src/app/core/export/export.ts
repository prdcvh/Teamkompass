/**
 * Datenexport (JSON): Sicherung aller Teamdaten als Datei. Enthält Spieler, Events mit allen Bewertungen, Förderpläne,
 * Abwesenheiten, Messwerte und Gegnerprofile in demselben Aufbau wie die Dokumente in der Datenbank. Interne
 * Trainer-Notizen (privateNotes) gehören bewusst nicht dazu. Spieler mit widerrufener Einwilligung werden vor dem
 * Export benannt (SCRUM-51), damit niemand sie unbemerkt weitergibt.
 */
import { type TeamEvent, docFromEvent } from '../events/event';
import { type Opponent, docFromOpponent } from '../opponents/opponent';
import { type Player, docFromPlayer, isConsentRevoked } from '../player/player';
import { type Rating, docFromRating } from '../ratings/rating';
import { type Absence, docFromAbsence } from '../records/absence';
import { type Measurement, docFromMeasurement } from '../records/measurement';
import { type DevelopmentPlan, docFromPlan } from '../records/plan';
import { type RatingsByEvent } from '../team/team';

export interface ExportInput {
  readonly teamId: string;
  readonly now: Date;
  readonly players: readonly Player[];
  readonly events: readonly TeamEvent[];
  readonly ratings: RatingsByEvent;
  readonly plans: ReadonlyMap<string, readonly DevelopmentPlan[]>;
  readonly absences: ReadonlyMap<string, readonly Absence[]>;
  readonly measurements: ReadonlyMap<string, readonly Measurement[]>;
  readonly opponents: readonly Opponent[];
}

type Doc = Record<string, unknown>;

export interface ExportData {
  readonly app: 'TeamKompass';
  readonly teamId: string;
  readonly exportedAt: string;
  readonly players: Doc[];
  readonly events: Doc[];
  readonly developmentPlans: Record<string, Doc[]>;
  readonly absences: Record<string, Doc[]>;
  readonly measurements: Record<string, Doc[]>;
  readonly opponents: Doc[];
}

function byPlayer<T>(source: ReadonlyMap<string, readonly T[]>, players: readonly Player[], toDoc: (item: T) => Doc & { id?: string }): Record<string, Doc[]> {
  const result: Record<string, Doc[]> = {};
  for (const player of players) {
    const items = source.get(player.id) ?? [];
    if (items.length) result[player.id] = items.map((item) => toDoc(item));
  }
  return result;
}

export function buildExport(input: ExportInput): ExportData {
  const { players } = input;
  const ratingsOf = (eventId: string): Record<string, Doc> => {
    const result: Record<string, Doc> = {};
    for (const [playerId, rating] of input.ratings.get(eventId) ?? new Map<string, Rating>()) result[playerId] = docFromRating(rating);
    return result;
  };
  return {
    app: 'TeamKompass',
    teamId: input.teamId,
    exportedAt: input.now.toISOString(),
    players: players.map((player) => ({ id: player.id, ...docFromPlayer(player) })),
    events: [...input.events]
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de'))
      .map((event) => ({ id: event.id, ...docFromEvent(event), ratings: ratingsOf(event.id) })),
    developmentPlans: byPlayer(input.plans, players, (plan) => ({ id: plan.id, ...docFromPlan(plan) })),
    absences: byPlayer(input.absences, players, (absence) => ({ id: absence.id, ...docFromAbsence(absence) })),
    measurements: byPlayer(input.measurements, players, (measurement) => ({ id: measurement.id, ...docFromMeasurement(measurement) })),
    opponents: [...input.opponents].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((opponent) => ({ id: opponent.id, ...docFromOpponent(opponent) })),
  };
}

/** Dateiname mit Datum (lokaler Kalendertag), z. B. `teamkompass-export-2026-10-12.json`. */
export function exportFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `teamkompass-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Spieler, deren Einwilligung widerrufen ist: ihre Daten dürfen nicht unbemerkt weitergegeben werden. */
export function revokedPlayers(players: readonly Player[]): Player[] {
  return players.filter((player) => isConsentRevoked(player));
}
