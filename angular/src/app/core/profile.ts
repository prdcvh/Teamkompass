/**
 * Auswertungen im Spielerprofil: Notenschnitt, Kompetenzprofil, Anwesenheit und Spielstatistik.
 * Reine Funktionen ohne Zugriff auf Firebase; die Regeln entsprechen der bisherigen App
 * (siehe outputs/team-manager/app.js: playerRatings, profileSkillAverages, profileAvailability,
 * playerGameStats, renderAnalyticsCards). Noten sind Schulnoten: kleiner ist besser.
 */
import { type TeamEvent, formatDate, intensityText, resultText } from './event';
import { type GradeField, type Rating, GRADE_FIELDS, GRADE_LABELS, BLANK_RATING, calculatedGrade, gradeLabel, roundGrade } from './rating';
import { isIsoDate } from './player';

/** Ein Event samt der Bewertung des Spielers (ohne Dokument gilt die Bewertung als „Offen“). */
export interface Evaluation {
  readonly event: TeamEvent;
  readonly rating: Rating;
}

export interface GradedEvaluation extends Evaluation {
  /** Gesamtnote des Events (1–6). */
  readonly grade: number;
}

/** Verknüpft die Events mit den Bewertungen eines Spielers. Events ohne Bewertungsdokument bleiben mit „Offen“ erhalten. */
export function evaluationsFor(events: readonly TeamEvent[], ratings: ReadonlyMap<string, Rating>): Evaluation[] {
  return events.map((event) => ({ event, rating: ratings.get(event.id) ?? BLANK_RATING }));
}

function byDate(a: TeamEvent, b: TeamEvent): number {
  return a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de');
}

/** Benotete Events (Gesamtnote vorhanden), älteste zuerst – Grundlage für Verlauf, Schnitt und Kompetenzprofil. */
export function gradedEvaluations(evaluations: readonly Evaluation[]): GradedEvaluation[] {
  return evaluations
    .flatMap((entry) => {
      const grade = calculatedGrade(entry.rating);
      return grade === null ? [] : [{ ...entry, grade }];
    })
    .sort((a, b) => byDate(a.event, b.event));
}

export function averageGrade(graded: readonly { readonly grade: number }[]): number | null {
  if (!graded.length) return null;
  return roundGrade(graded.reduce((sum, item) => sum + item.grade, 0) / graded.length);
}

export interface SkillAverage {
  readonly field: GradeField;
  readonly label: string;
  readonly value: number | null;
}

/** Durchschnitt je Teilnote (Einsatz, Fehlerquote, Entscheidungsfindung, Lernfähigkeit). */
export function skillAverages(graded: readonly GradedEvaluation[]): SkillAverage[] {
  return GRADE_FIELDS.map((field) => {
    const values = graded.map((item) => item.rating[field]).filter((value): value is number => value !== null);
    return { field, label: GRADE_LABELS[field], value: values.length ? roundGrade(values.reduce((sum, value) => sum + value, 0) / values.length) : null };
  });
}

/** Balkenlänge in Prozent: Note 1 = 100 %, Note 6 = 0 %; ohne Note 0. */
export function gradeToPercent(value: number | null): number {
  if (!value) return 0;
  return Math.max(0, Math.min(100, Math.round(((6 - value) / 5) * 100)));
}

/**
 * Für Anwesenheits- und Einsatzquoten zählt ein Event nur, wenn es nicht in der Zukunft liegt und die
 * Anwesenheit schon gesetzt ist (nicht „Offen“). Im Voraus angelegte oder noch nicht bewertete Termine
 * dürfen die Quote nicht verwässern (SCRUM-20). `today` ist ein ISO-Datum (JJJJ-MM-TT).
 */
export function countsForStats(entry: Evaluation, today: string): boolean {
  if (entry.rating.attendance === 'open') return false;
  return isIsoDate(entry.event.date) && entry.event.date <= today;
}

export interface AvailabilityShare {
  readonly label: string;
  /** Anteil in Prozent (gerundet). */
  readonly value: number;
  /** „4/7“ */
  readonly display: string;
}

const AVAILABILITY_ROWS = [
  ['present', 'Anwesend'],
  ['limited', 'Teilweise'],
  ['absent', 'Fehlt'],
  ['excluded', 'Nicht im Kader'],
] as const;

export function availability(evaluations: readonly Evaluation[], today: string): AvailabilityShare[] {
  const counted = evaluations.filter((entry) => countsForStats(entry, today));
  const total = Math.max(counted.length, 1);
  return AVAILABILITY_ROWS.map(([attendance, label]) => {
    const count = counted.filter((entry) => entry.rating.attendance === attendance).length;
    return { label, value: Math.round((count / total) * 100), display: `${count}/${total}` };
  });
}

export interface GameStats {
  readonly games: number;
  readonly appearances: number;
  readonly minutes: number;
  readonly possibleMinutes: number;
  readonly goals: number;
  readonly assists: number;
  /** Tore + Vorlagen. */
  readonly scorers: number;
  /** Gespielte Minuten im Verhältnis zu den möglichen, in Prozent. */
  readonly appearanceRate: number;
  readonly scorersPerGame: number | null;
  readonly minutesPerGame: number;
  readonly minutesPerScorer: number | null;
}

/** Spielstatistik; „Nicht im Kader“ zählt weder als Spiel noch als mögliche Einsatzzeit. */
export function gameStats(evaluations: readonly Evaluation[], today: string): GameStats {
  const games = evaluations.filter((entry) => entry.event.type === 'Spiel' && countsForStats(entry, today) && entry.rating.attendance !== 'excluded');
  const played = games.filter((entry) => entry.rating.attendance !== 'absent');
  const appearances = played.filter((entry) => (entry.rating.minutes ?? 0) > 0 || entry.rating.attendance === 'present' || entry.rating.attendance === 'limited').length;
  const minutes = played.reduce((sum, entry) => sum + (entry.rating.minutes ?? 0), 0);
  const possibleMinutes = games.reduce((sum, entry) => sum + (entry.event.matchDuration ?? 90), 0);
  const goals = played.reduce((sum, entry) => sum + (entry.rating.goals ?? 0), 0);
  const assists = played.reduce((sum, entry) => sum + (entry.rating.assists ?? 0), 0);
  const scorers = goals + assists;
  return {
    games: games.length,
    appearances,
    minutes,
    possibleMinutes,
    goals,
    assists,
    scorers,
    appearanceRate: possibleMinutes ? Math.round((minutes / possibleMinutes) * 100) : 0,
    scorersPerGame: appearances ? roundGrade(scorers / appearances) : null,
    minutesPerGame: appearances ? Math.round(minutes / appearances) : 0,
    minutesPerScorer: scorers ? Math.round(minutes / scorers) : null,
  };
}

export interface InsightCard {
  readonly label: string;
  readonly value: string;
}

function signed(value: number): string {
  const text = gradeLabel(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function plain(value: number | null): string {
  return value === null ? '–' : String(value).replace('.', ',');
}

/**
 * Kennzahlen-Karten des Profils (wie die bisherige App). Trend und Entwicklung sind Notenverbesserungen:
 * ein positiver Wert heißt, die Note ist besser (kleiner) geworden. Den Belastungsindikator liefert dieses
 * Modul nicht; er braucht Messwerte und Abwesenheiten (SCRUM-68).
 */
export function insightCards(evaluations: readonly Evaluation[], today: string): InsightCard[] {
  const graded = gradedEvaluations(evaluations);
  const gamesGraded = graded.filter((item) => item.event.type === 'Spiel');
  const trainingsGraded = graded.filter((item) => item.event.type === 'Training');
  const last = graded.at(-1)?.grade;
  const previous = graded.at(-2)?.grade;
  const trend = last !== undefined && previous !== undefined ? previous - last : null;
  const development = graded.length >= 2 ? roundGrade(graded[0].grade - graded[graded.length - 1].grade) : null;
  const recentIntensity = graded.slice(-3).map((item) => item.event.intensity);
  const averageIntensity = recentIntensity.length ? roundGrade(recentIntensity.reduce((sum, value) => sum + value, 0) / recentIntensity.length) : null;
  const best = graded.length ? graded.reduce((winner, item) => (item.grade < winner.grade ? item : winner), graded[0]) : null;
  const participations = evaluations.filter((entry) => entry.rating.attendance === 'present' || entry.rating.attendance === 'limited').length;
  const stats = gameStats(evaluations, today);
  return [
    { label: 'Notenschnitt', value: gradeLabel(averageGrade(graded)) },
    { label: 'Spiel-Schnitt', value: gradeLabel(averageGrade(gamesGraded)) },
    { label: 'Training-Schnitt', value: gradeLabel(averageGrade(trainingsGraded)) },
    { label: 'Bewertete Events', value: String(graded.length) },
    { label: 'Teilnahmen', value: String(participations) },
    { label: 'Trend', value: trend === null ? '–' : signed(roundGrade(trend)) },
    { label: 'Ø Intensität zuletzt', value: averageIntensity === null ? '–' : averageIntensity.toFixed(1).replace('.', ',') },
    { label: 'Entwicklung Saison', value: development === null ? '–' : signed(development) },
    { label: 'Bestes Event', value: best ? `${gradeLabel(best.grade)} · ${best.event.type}` : '–' },
    { label: 'Einsatzquote', value: `${stats.appearanceRate} %` },
    { label: 'Scorer/Spiel', value: plain(stats.scorersPerGame) },
    { label: 'Tore + Vorlagen', value: `${stats.goals} + ${stats.assists}` },
    { label: 'Min./Spiel', value: stats.minutesPerGame ? String(stats.minutesPerGame) : '–' },
    { label: 'Min./Scorerpunkt', value: stats.minutesPerScorer === null ? '–' : String(stats.minutesPerScorer) },
  ];
}

export interface HistoryRow {
  readonly eventId: string;
  readonly title: string;
  readonly date: string;
  readonly type: string;
  /** „3:1“ nur für bereits gespielte Spiele mit Ergebnis. */
  readonly result: string;
  readonly intensity: string;
  readonly grade: string;
  readonly note: string;
}

/** Eventhistorie, neueste zuerst. Die Rückmeldung des Trainers geht vor der Event-Notiz; ohne beides „Keine Notiz“. */
export function historyRows(graded: readonly GradedEvaluation[], today: string): HistoryRow[] {
  return [...graded].reverse().map(({ event, rating, grade }) => ({
    eventId: event.id,
    title: event.title,
    date: formatDate(event.date),
    type: event.type,
    result: event.date <= today ? resultText(event) : '',
    intensity: intensityText(event.intensity),
    grade: gradeLabel(grade),
    note: rating.note || event.notes || 'Keine Notiz',
  }));
}

export interface TrendPoint {
  readonly label: string;
  readonly grade: number;
}

/** Punkte des Verlaufsdiagramms (älteste zuerst); Beschriftung „MM-TT“ wie in der bisherigen App. */
export function trendPoints(graded: readonly GradedEvaluation[]): TrendPoint[] {
  return graded.map((item) => ({ label: item.event.date.slice(5), grade: item.grade }));
}

export interface ChartPoint extends TrendPoint {
  readonly x: number;
  readonly y: number;
  /** Beschriftung unter dem Punkt (bei vielen Punkten nur jede n-te, damit nichts überlappt). */
  readonly showLabel: boolean;
}

export interface TrendChart {
  readonly width: number;
  readonly height: number;
  readonly grid: readonly { readonly y: number; readonly label: string }[];
  readonly points: readonly ChartPoint[];
  /** SVG-Pfad der Linie (leer bei weniger als zwei Punkten). */
  readonly line: string;
}

const CHART_PADDING = { top: 14, right: 16, bottom: 30, left: 30 } as const;
const MAX_X_LABELS = 8;

/**
 * Rechnet die Verlaufspunkte in Diagrammkoordinaten um. Note 1 liegt oben, Note 6 unten: eine bessere Note
 * steht höher. Ein einzelner Punkt steht in der Mitte.
 */
export function trendChart(points: readonly TrendPoint[], width = 640, height = 240): TrendChart {
  const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;
  const yFor = (grade: number) => CHART_PADDING.top + ((grade - 1) / 5) * innerHeight;
  const step = Math.max(1, Math.ceil(points.length / MAX_X_LABELS));
  const placed = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? CHART_PADDING.left + innerWidth / 2 : CHART_PADDING.left + (index * innerWidth) / (points.length - 1),
    y: yFor(point.grade),
    showLabel: index % step === 0 || index === points.length - 1,
  }));
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    width,
    height,
    grid: [1, 2, 3, 4, 5, 6].map((grade) => ({ y: round(yFor(grade)), label: String(grade) })),
    points: placed.map((point) => ({ ...point, x: round(point.x), y: round(point.y) })),
    line: placed.length >= 2 ? placed.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(' ') : '',
  };
}
