/**
 * Auswertungen im Spielerprofil: Notenschnitt, Kompetenzprofil, Verfügbarkeit, Spielstatistik und Verlauf.
 * Alle Werte rechnen wie die bisherige App (outputs/team-manager/app.js: playerRatings, playerAverageGrade,
 * profileSkillAverages, profileAvailability, playerGameStats, renderAnalyticsCards). Noten sind Schulnoten:
 * kleiner ist besser. Wichtig für die Kernzahlen (siehe CLAUDE.md „wrong core numbers“): Anwesenheits- und
 * Einsatzquote zählen nur Events, die nicht in der Zukunft liegen und deren Anwesenheit schon gesetzt ist (SCRUM-20).
 */
import { type TeamEvent } from './event';
import { GRADE_FIELDS, GRADE_LABELS, type GradeField, type Rating, calculatedGrade, gradeLabel, roundGrade } from './rating';

/** Ein Event samt der Bewertung eines Spielers (die Bewertung kann fehlen). */
export interface EventRating {
  readonly event: TeamEvent;
  readonly rating: Rating | null;
}

/** Ein benotetes Event des Spielers. */
export interface GradedEvent {
  readonly event: TeamEvent;
  readonly rating: Rating;
  readonly grade: number;
}

/** Benotete Events, älteste zuerst. „Fehlt“ und „Nicht im Kader“ haben keine Gesamtnote und zählen nicht. */
export function gradedEvents(items: readonly EventRating[]): GradedEvent[] {
  const graded: GradedEvent[] = [];
  for (const { event, rating } of items) {
    if (!rating || rating.attendance === 'absent') continue;
    const grade = calculatedGrade(rating);
    if (grade !== null) graded.push({ event, rating, grade });
  }
  return graded.sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.title.localeCompare(b.event.title, 'de'));
}

function average(values: readonly number[]): number | null {
  return values.length ? roundGrade(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export function averageGrade(graded: readonly GradedEvent[]): number | null {
  return average(graded.map((entry) => entry.grade));
}

/** Schnitt je Teilnote (Einsatz, Fehlerquote, Entscheidungsfindung, Lernfähigkeit). */
export function skillAverages(graded: readonly GradedEvent[]): { field: GradeField; label: string; value: number | null }[] {
  return GRADE_FIELDS.map((field) => ({
    field,
    label: GRADE_LABELS[field],
    value: average(graded.map((entry) => entry.rating[field]).filter((value): value is number => value !== null)),
  }));
}

/** Balkenbreite in Prozent: Note 1 = 100 %, Note 6 = 0 %; ohne Note 0. */
export function gradeToPercent(grade: number | null): number {
  if (!grade) return 0;
  return Math.max(0, Math.min(100, Math.round(((6 - grade) / 5) * 100)));
}

/**
 * Ein Event zählt für Anwesenheits- und Einsatzquote nur, wenn es nicht in der Zukunft liegt und die
 * Anwesenheit des Spielers schon gesetzt ist (nicht „Offen“). Im Voraus angelegte oder noch nicht bewertete
 * Termine dürfen die Quote nicht verwässern.
 */
export function countsForStats(event: TeamEvent, rating: Rating | null, today: string): boolean {
  if (!rating || rating.attendance === 'open') return false;
  return event.date !== '' && event.date <= today;
}

export interface AvailabilityRow {
  readonly label: string;
  readonly percent: number;
  readonly display: string;
}

export function availability(items: readonly EventRating[], today: string): AvailabilityRow[] {
  const relevant = items.filter(({ event, rating }) => countsForStats(event, rating, today)).map(({ rating }) => rating!.attendance);
  const total = Math.max(relevant.length, 1);
  const row = (label: string, key: string): AvailabilityRow => {
    const count = relevant.filter((value) => value === key).length;
    return { label, percent: Math.round((count / total) * 100), display: `${count}/${total}` };
  };
  return [row('Anwesend', 'present'), row('Teilweise', 'limited'), row('Fehlt', 'absent'), row('Nicht im Kader', 'excluded')];
}

/** Teilnahmen: Events mit „Anwesend“ oder „Teilweise“ (ohne Datumsgrenze, wie die bisherige App). */
export function attendanceCount(items: readonly EventRating[]): number {
  return items.filter(({ rating }) => rating?.attendance === 'present' || rating?.attendance === 'limited').length;
}

export interface GameStats {
  readonly games: number;
  readonly appearances: number;
  readonly minutes: number;
  readonly possibleMinutes: number;
  readonly goals: number;
  readonly assists: number;
  readonly appearanceRate: number;
  readonly scorersPerGame: number | null;
  readonly minutesPerGame: number;
  readonly minutesPerScorer: number | null;
}

/** Spielstatistik; „Nicht im Kader“ zählt weder als mögliche Einsatzzeit noch als Spiel. */
export function gameStats(items: readonly EventRating[], today: string): GameStats {
  const games = items.filter(({ event, rating }) => event.type === 'Spiel' && countsForStats(event, rating, today) && rating!.attendance !== 'excluded');
  const played = games.filter(({ rating }) => rating!.attendance !== 'absent');
  const appearances = played.filter(({ rating }) => (rating!.minutes ?? 0) > 0 || rating!.attendance === 'present' || rating!.attendance === 'limited').length;
  const sum = (pick: (rating: Rating) => number | null) => played.reduce((total, { rating }) => total + (pick(rating!) ?? 0), 0);
  const minutes = sum((rating) => rating.minutes);
  const goals = sum((rating) => rating.goals);
  const assists = sum((rating) => rating.assists);
  const possibleMinutes = games.reduce((total, { event }) => total + (event.matchDuration ?? 90), 0);
  const scorers = goals + assists;
  return {
    games: games.length,
    appearances,
    minutes,
    possibleMinutes,
    goals,
    assists,
    appearanceRate: possibleMinutes ? Math.round((minutes / possibleMinutes) * 100) : 0,
    scorersPerGame: appearances ? roundGrade(scorers / appearances) : null,
    minutesPerGame: appearances ? Math.round(minutes / appearances) : 0,
    minutesPerScorer: scorers ? Math.round(minutes / scorers) : null,
  };
}

export interface ProfileFigures {
  readonly average: number | null;
  readonly gameAverage: number | null;
  readonly trainingAverage: number | null;
  readonly ratedEvents: number;
  readonly attendances: number;
  /** Letzte Note minus vorletzte, umgekehrt zur Rechnung: positiv = besser geworden. */
  readonly trend: number | null;
  readonly recentIntensity: number | null;
  /** Erste minus letzte Note: positiv = besser geworden. */
  readonly development: number | null;
  readonly best: GradedEvent | null;
  readonly games: GameStats;
}

export function profileFigures(items: readonly EventRating[], today: string): ProfileFigures {
  const graded = gradedEvents(items);
  const last = graded.at(-1)?.grade;
  const previous = graded.at(-2)?.grade;
  const recent = graded.slice(-3).map((entry) => entry.event.intensity || 2);
  return {
    average: averageGrade(graded),
    gameAverage: averageGrade(graded.filter((entry) => entry.event.type === 'Spiel')),
    trainingAverage: averageGrade(graded.filter((entry) => entry.event.type === 'Training')),
    ratedEvents: graded.length,
    attendances: attendanceCount(items),
    trend: last !== undefined && previous !== undefined ? roundGrade(previous - last) : null,
    recentIntensity: recent.length ? roundGrade(recent.reduce((sum, value) => sum + value, 0) / recent.length) : null,
    development: graded.length >= 2 ? roundGrade(graded[0].grade - graded[graded.length - 1].grade) : null,
    best: graded.length ? graded.reduce((best, entry) => (entry.grade < best.grade ? entry : best), graded[0]) : null,
    games: gameStats(items, today),
  };
}

/** „2,3“, ohne Wert „–“; mit `signed` ein „+“ vor positiven Werten. */
export function numberLabel(value: number | null, options: { signed?: boolean } = {}): string {
  if (value === null) return '–';
  const text = String(value).replace('.', ',');
  return options.signed && value > 0 ? `+${text}` : text;
}

export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 260;
const CHART_LEFT = 54;
const CHART_RIGHT = 24;
const CHART_TOP = 30;
const CHART_BOTTOM = 38;

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly grade: number;
  readonly label: string;
  readonly title: string;
}

export interface TrendChart {
  readonly width: number;
  readonly height: number;
  readonly grid: readonly { y: number; grade: number }[];
  readonly points: readonly ChartPoint[];
  readonly path: string;
}

/** Verlaufsdiagramm: Note 1 oben, Note 6 unten, ein Punkt je benotetem Event (älteste links). */
export function trendChart(graded: readonly GradedEvent[]): TrendChart {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const y = (grade: number) => CHART_TOP + ((grade - 1) / 5) * plotHeight;
  const points = graded.map((entry, index) => ({
    x: CHART_LEFT + (index * plotWidth) / Math.max(graded.length - 1, 1),
    y: y(entry.grade),
    grade: entry.grade,
    label: entry.event.date.slice(5),
    title: `${entry.event.title}: Note ${gradeLabel(entry.grade)}`,
  }));
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    grid: [1, 2, 3, 4, 5, 6].map((grade) => ({ y: y(grade), grade })),
    points,
    path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
  };
}
