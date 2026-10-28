/**
 * Auswertungen über das ganze Team (Start-Dashboard): Bilanz, Teamnote, Bestenliste, nächstes Event, Verfügbarkeit
 * und Belastung. Rechnet wie die bisherige App (Alt-App app.js: gameResult, teamStats, renderMetrics,
 * renderLeaders, nextUpcomingEvent). Noten sind Schulnoten: kleiner ist besser.
 */
import { type TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating, attendanceCount, averageGrade, gradedEvents } from '../profile/profile';
import { type Rating, roundGrade } from '../ratings/rating';
import type { Absence } from '../records/absence';
import { effectiveStatus } from '../records/availability';
import type { Measurement } from '../records/measurement';
import { injuryRisk } from '../analysis/risk';

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

/** Die nächsten Events ab heute (heute zählt mit), zeitlich sortiert. */
export function upcomingEvents(events: readonly TeamEvent[], today: string, limit: number): TeamEvent[] {
  return events
    .filter((event) => event.date && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    .slice(0, limit);
}

/** Ganze Kalendertage von `today` bis `date` (beides ISO-Datum); negativ für Vergangenes. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** „Heute“, „Morgen“ oder „in N Tagen“. */
export function countdownLabel(date: string, today: string): string {
  const days = daysUntil(date, today);
  return days <= 0 ? 'Heute' : days === 1 ? 'Morgen' : `in ${days} Tagen`;
}

export interface Leader {
  readonly player: Player;
  readonly grade: number;
  readonly events: number;
  /** Die letzten Noten (höchstens FORM_LENGTH, älteste zuerst) für die Formkurve. */
  readonly recent: readonly number[];
  readonly trend: FormTrend;
}

/** Wie viele der letzten Noten die Formkurve auf dem Start-Dashboard zeigt. */
export const FORM_LENGTH = 6;

/** Formtrend: letzte Note gegenüber dem Schnitt der Noten davor (Schulnoten: kleiner ist besser). */
export type FormTrend = 'besser' | 'schlechter' | 'gleich' | null;

/** Ab dieser Abweichung (Notenstufen) gilt die letzte Note als besser/schlechter. */
const TREND_THRESHOLD = 0.25;

export function formTrend(grades: readonly number[]): FormTrend {
  if (grades.length < 2) return null;
  const last = grades[grades.length - 1];
  const before = grades.slice(0, -1);
  const delta = last - before.reduce((sum, grade) => sum + grade, 0) / before.length;
  return delta <= -TREND_THRESHOLD ? 'besser' : delta >= TREND_THRESHOLD ? 'schlechter' : 'gleich';
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
    .map(({ player, items }) => {
      const graded = gradedEvents(items);
      const recent: readonly number[] = graded.slice(-FORM_LENGTH).map((entry) => entry.grade);
      return { player, grade: averageGrade(graded), events: attendanceCount(items), recent, trend: formTrend(recent) };
    })
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
  /** Spieler mit Belastungsstufe „Anpassen“. */
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
      return injuryRisk(player, items, absences, measurements, now).tier === 'anpassen';
    }).length,
    next: nextUpcomingEvent(events, today),
  };
}
