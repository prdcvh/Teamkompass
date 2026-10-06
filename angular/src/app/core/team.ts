/**
 * Auswertungen über das ganze Team (Start-Dashboard): Bilanz, Teamnote, Bestenliste, nächstes Event, Verfügbarkeit
 * und Belastung. Rechnet wie die bisherige App (outputs/team-manager/app.js: gameResult, teamStats, renderMetrics,
 * renderLeaders, nextUpcomingEvent). Noten sind Schulnoten: kleiner ist besser.
 */
import { type TeamEvent } from './event';
import { type Player } from './player';
import { type EventRating, attendanceCount, averageGrade, gradedEvents } from './profile';
import { type Rating, roundGrade } from './rating';
import { type Absence, type Measurement, effectiveStatus } from './records';
import { injuryRisk } from './risk';

/** Bewertungen aller Spieler je Event: eventId → (playerId → Bewertung). */
export type RatingsByEvent = ReadonlyMap<string, ReadonlyMap<string, Rating>>;

/** Alle Events (neueste zuerst) mit der Bewertung eines Spielers; fehlt sie, ist sie null. */
export function itemsFor(playerId: string, events: readonly TeamEvent[], ratings: RatingsByEvent): EventRating[] {
  return [...events]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((event) => ({ event, rating: ratings.get(event.id)?.get(playerId) ?? null }));
}

export type Outcome = 'Sieg' | 'Unentschieden' | 'Niederlage';

/**
 * Ein Ergebnis zählt nur, wenn beide Werte eingetragen sind und das Spiel nicht in der Zukunft liegt
 * (ein vorab angelegtes Spiel mit 0:0 ist kein Unentschieden).
 */
export function matchResult(event: TeamEvent, today: string): { goalsFor: number; goalsAgainst: number; outcome: Outcome } | null {
  if (event.type !== 'Spiel' || event.goalsFor === null || event.goalsAgainst === null) return null;
  if (event.date && event.date > today) return null;
  const { goalsFor, goalsAgainst } = event;
  return { goalsFor, goalsAgainst, outcome: goalsFor > goalsAgainst ? 'Sieg' : goalsFor < goalsAgainst ? 'Niederlage' : 'Unentschieden' };
}

export interface TeamRecord {
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

export function teamRecord(events: readonly TeamEvent[], today: string): TeamRecord {
  const results = events.map((event) => matchResult(event, today)).filter((result) => result !== null);
  return {
    wins: results.filter((result) => result.outcome === 'Sieg').length,
    draws: results.filter((result) => result.outcome === 'Unentschieden').length,
    losses: results.filter((result) => result.outcome === 'Niederlage').length,
    goalsFor: results.reduce((sum, result) => sum + result.goalsFor, 0),
    goalsAgainst: results.reduce((sum, result) => sum + result.goalsAgainst, 0),
  };
}

/** Zeitlich nächstes Event ab heute (heute zählt mit). */
export function nextUpcomingEvent(events: readonly TeamEvent[], today: string): TeamEvent | null {
  return events.filter((event) => event.date && event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

export interface Leader {
  readonly player: Player;
  readonly grade: number;
  readonly events: number;
}

export interface PlayerData {
  readonly player: Player;
  readonly items: readonly EventRating[];
  readonly absences: readonly Absence[];
  readonly measurements: readonly Measurement[];
}

/** Bestenliste: Spieler mit Notenschnitt, beste Note zuerst. */
export function leaders(data: readonly PlayerData[], limit: number): Leader[] {
  return data
    .map(({ player, items }) => ({ player, grade: averageGrade(gradedEvents(items)), events: attendanceCount(items) }))
    .filter((entry): entry is Leader => entry.grade !== null)
    .sort((a, b) => a.grade - b.grade)
    .slice(0, limit);
}

export interface DashboardFigures {
  readonly squad: number;
  readonly fit: number;
  readonly events: number;
  /** Mittel der Spieler-Schnitte; null, solange niemand benotet ist. */
  readonly teamGrade: number | null;
  readonly record: TeamRecord;
  /** Spieler mit Belastungsstufe „Deutlich reduzieren“ oder „Nicht einsetzen“. */
  readonly highLoad: number;
  readonly next: TeamEvent | null;
}

/**
 * @param now Zeitpunkt der Auswertung; es zählt der Kalendertag (`today`, lokal).
 */
export function dashboardFigures(data: readonly PlayerData[], events: readonly TeamEvent[], today: string, now: Date = new Date()): DashboardFigures {
  const grades = data.map(({ items }) => averageGrade(gradedEvents(items))).filter((grade): grade is number => grade !== null);
  return {
    squad: data.length,
    fit: data.filter(({ player, absences }) => effectiveStatus(player, absences, today) === 'Fit').length,
    events: events.length,
    teamGrade: grades.length ? roundGrade(grades.reduce((sum, grade) => sum + grade, 0) / grades.length) : null,
    record: teamRecord(events, today),
    highLoad: data.filter(({ player, items, absences, measurements }) => {
      const tier = injuryRisk(player, items, absences, measurements, now).tier;
      return tier === 'reduzieren' || tier === 'aussetzen';
    }).length,
    next: nextUpcomingEvent(events, today),
  };
}
