/**
 * Teamanalyse: Auswertungen über alle Events und Spieler. Rechnet wie die bisherige App
 * (outputs/team-manager/app.js: teamStats, teamAverageGradeForEvent, birthQuarterCounts, positionCoverage,
 * trainingFocusCounts, renderTeamAnalysis). Noten sind Schulnoten: kleiner ist besser.
 */
import { type TeamEvent, TRAINING_FOCUSES } from './event';
import { type Player, parsePositions } from './player';
import { type PlotChart, plotChart } from './profile';
import { type Rating, calculatedGrade, roundGrade } from './rating';
import { type RatingsByEvent, type TeamRecord, teamRecord } from './team';

/** Durchschnittsnote eines Events über alle Spieler mit Gesamtnote; ohne Note null. „Fehlt“ zählt nicht. */
export function eventTeamGrade(ratings: ReadonlyMap<string, Rating> | undefined): number | null {
  const grades: number[] = [];
  for (const rating of ratings?.values() ?? []) {
    if (rating.attendance === 'absent') continue;
    const grade = calculatedGrade(rating);
    if (grade !== null) grades.push(grade);
  }
  return grades.length ? roundGrade(grades.reduce((sum, grade) => sum + grade, 0) / grades.length) : null;
}

export interface TeamStats {
  /** Alle Spiel-Events (auch künftige). */
  readonly games: number;
  readonly record: TeamRecord;
  /** Mittel der Event-Durchschnitte; null ohne Noten. */
  readonly avgGrade: number | null;
  /** Anteil „Anwesend“/„Teilweise“ an allen erfassten Bewertungen ohne „Nicht im Kader“, in Prozent. */
  readonly attendanceRate: number;
  readonly avgIntensity: number | null;
}

export function teamStats(events: readonly TeamEvent[], ratings: RatingsByEvent, today: string): TeamStats {
  const eventGrades = events.map((event) => eventTeamGrade(ratings.get(event.id))).filter((grade): grade is number => grade !== null);
  const attendances = events
    .flatMap((event) => [...(ratings.get(event.id)?.values() ?? [])].map((rating) => rating.attendance))
    .filter((attendance) => attendance !== 'excluded');
  const attended = attendances.filter((attendance) => attendance === 'present' || attendance === 'limited').length;
  return {
    games: events.filter((event) => event.type === 'Spiel').length,
    record: teamRecord(events, today),
    avgGrade: eventGrades.length ? roundGrade(eventGrades.reduce((sum, grade) => sum + grade, 0) / eventGrades.length) : null,
    attendanceRate: attendances.length ? Math.round((attended / attendances.length) * 100) : 0,
    avgIntensity: events.length ? roundGrade(events.reduce((sum, event) => sum + (event.intensity || 2), 0) / events.length) : null,
  };
}

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Geborene Spieler je Quartal (Januar–März = Q1); Spieler ohne gültiges Datum fehlen. */
export function birthQuarterCounts(players: readonly Player[]): Record<Quarter, number> {
  const counts: Record<Quarter, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const player of players) {
    const month = Number(player.birthdate.slice(5, 7));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(player.birthdate) || month < 1 || month > 12) continue;
    counts[`Q${Math.floor((month - 1) / 3) + 1}` as Quarter] += 1;
  }
  return counts;
}

/** Spieler je Position (ein Spieler kann mehrere Positionen abdecken), meiste zuerst, dann alphabetisch. */
export function positionCoverage(players: readonly Player[]): [string, number][] {
  const coverage = new Map<string, number>();
  for (const player of players) {
    for (const position of parsePositions(player.positions)) coverage.set(position, (coverage.get(position) ?? 0) + 1);
  }
  return [...coverage].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
}

/** Positionen, die höchstens ein Spieler abdeckt (höchstens `limit`). */
export function thinPositions(coverage: readonly [string, number][], limit = 6): string[] {
  return coverage.filter(([, count]) => count <= 1).map(([position]) => position).slice(0, limit);
}

/** Trainingseinheiten je Spielphase; Einheiten ohne Angabe zählen zu „Eigener Ballbesitz“. */
export function trainingFocusCounts(events: readonly TeamEvent[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(TRAINING_FOCUSES.map((focus) => [focus, 0]));
  for (const event of events) {
    if (event.type !== 'Training') continue;
    const focus = event.trainingFocus || TRAINING_FOCUSES[0];
    counts[focus] = (counts[focus] ?? 0) + 1;
  }
  return counts;
}

/** Teamnote je Event (älteste links); Spiele und Trainings sind unterscheidbar (`kind`). */
export function teamTrend(events: readonly TeamEvent[], ratings: RatingsByEvent): PlotChart {
  const points = [...events]
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de'))
    .map((event) => ({ event, grade: eventTeamGrade(ratings.get(event.id)) }))
    .filter((entry): entry is { event: TeamEvent; grade: number } => entry.grade !== null)
    .map(({ event, grade }) => ({
      grade,
      label: event.date.slice(5),
      title: `${event.title}: Ø Note ${String(grade).replace('.', ',')}`,
      kind: event.type,
    }));
  return plotChart(points);
}
