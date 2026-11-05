/**
 * Saisonbericht pro Spieler (SCRUM-196; PDF über „Drucken → Als PDF speichern“, wie das Belastungsprotokoll aus SCRUM-139).
 * Für Eltern und Verein: Anwesenheit, Verlauf des Kompetenzprofils, erreichte Förderziele, Lernpfad-Stufen und ein vom
 * Trainer eigens für den Bericht geschriebener Kommentar.
 *
 * - Private Trainer-Notizen (Event-Notizen) und die Rückmeldungstexte je Event gehen nie in den Bericht.
 * - Gesundheitsdaten (Verletzungen, Abwesenheitsgründe) nur mit ausdrücklichem Häkchen; Standard: aus.
 * - Den druckbaren Bericht baut `seasonReportHtml` (season-report-html.ts); jeder Nutzertext wird maskiert (SCRUM-13).
 */
import { type LearningPath, type PlayerProgress, pathFitsPlayer, pathView } from '../learning/learning-path';
import type { Player } from '../player/player';
import { GRADE_FIELDS, GRADE_LABELS, type GradeField } from '../ratings/rating';
import type { RatingScale } from '../ratings/rating-scale';
import { type Absence, absenceTitle, isInjuryAbsence } from '../records/absence';
import { type DevelopmentPlan } from '../records/plan';
import { addDays, isIsoDate } from '../shared/dates';
import { seasonStartIso } from '../shared/season';
import { type AvailabilityRow, type EventRating, availability, averageGrade, countsForStats, gradedEvents, skillAverages } from './profile';

export type SeasonReportPeriod = 'season' | 'previous' | 'custom';

export const SEASON_REPORT_PERIODS: readonly { readonly value: SeasonReportPeriod; readonly label: string }[] = [
  { value: 'season', label: 'Laufende Saison' },
  { value: 'previous', label: 'Letzte Saison' },
  { value: 'custom', label: 'Eigener Zeitraum' },
];

export const MAX_SEASON_COMMENT = 1500;
const MAX_DAYS = 732;

export type SeasonReportRange = { readonly from: string; readonly to: string } | { readonly error: string };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Zeitraum: laufende Saison (1. Juli bis heute), letzte Saison (1. Juli bis 30. Juni) oder eigener Zeitraum (höchstens bis heute, höchstens zwei Jahre). */
export function seasonReportRange(period: SeasonReportPeriod, from: string, to: string, today: string): SeasonReportRange {
  const start = seasonStartIso(new Date(`${today}T12:00:00`));
  if (period === 'season') return { from: start, to: today };
  if (period === 'previous') {
    const year = Number(start.slice(0, 4)) - 1;
    return { from: `${year}-07-01`, to: addDays(start, -1) };
  }
  if (!isIsoDate(from) || !isIsoDate(to)) return { error: 'Bitte Beginn und Ende des Zeitraums angeben.' };
  if (from > to) return { error: 'Der Beginn liegt nach dem Ende des Zeitraums.' };
  if (from > today) return { error: 'Der Zeitraum liegt in der Zukunft.' };
  const end = to > today ? today : to;
  if (days(from, end) + 1 > MAX_DAYS) return { error: 'Der Zeitraum darf höchstens zwei Jahre lang sein.' };
  return { from, to: end };
}

export interface SeasonReportMonth {
  /** `JJJJ-MM` */
  readonly month: string;
  readonly overall: number | null;
  readonly skills: Readonly<Record<GradeField, number | null>>;
  readonly events: number;
}

export interface SeasonReportGoal {
  readonly focus: string;
  readonly goal: string;
  readonly date: string;
}

export interface SeasonReportLevel {
  readonly number: number;
  readonly title: string;
  readonly date: string;
}

export interface SeasonReportPath {
  readonly title: string;
  readonly done: number;
  readonly total: number;
  /** Im Zeitraum bestätigte Stufen. */
  readonly inPeriod: readonly SeasonReportLevel[];
}

export interface SeasonReportHealthEntry {
  readonly kind: 'Verletzung' | 'Abwesenheit';
  readonly text: string;
  readonly from: string;
  readonly to: string;
}

export interface SeasonReport {
  readonly teamName: string;
  readonly playerName: string;
  readonly playerNumber: number;
  readonly from: string;
  readonly to: string;
  readonly created: string;
  readonly scale: RatingScale;
  readonly attendance: {
    readonly rows: readonly AvailabilityRow[];
    readonly counted: number;
    readonly took: number;
    readonly trainings: number;
    readonly games: number;
  };
  readonly months: readonly SeasonReportMonth[];
  readonly overall: number | null;
  readonly skills: readonly { readonly field: GradeField; readonly label: string; readonly value: number | null }[];
  readonly goals: { readonly achieved: readonly SeasonReportGoal[]; readonly running: number };
  readonly paths: readonly SeasonReportPath[];
  readonly comment: string;
  /** null = Gesundheitsdaten nicht im Bericht. */
  readonly health: readonly SeasonReportHealthEntry[] | null;
}

export interface SeasonReportInput {
  readonly teamName: string;
  readonly teamLabel: string;
  readonly player: Player;
  readonly items: readonly EventRating[];
  readonly plans: readonly DevelopmentPlan[];
  readonly absences: readonly Absence[];
  readonly paths: readonly LearningPath[];
  readonly progress: PlayerProgress;
  readonly scale: RatingScale;
  readonly comment: string;
  readonly includeHealth: boolean;
  readonly from: string;
  readonly to: string;
  readonly today: string;
}

/** Datum, ab dem ein Förderziel zeitlich verortet ist: Review, sonst Fälligkeit, sonst Anlegedatum. */
const planDate = (plan: DevelopmentPlan) => [plan.reviewDate, plan.dueDate, plan.createdAt].find((value) => isIsoDate(value)) ?? '';

export function buildSeasonReport(input: SeasonReportInput): SeasonReport {
  const { player, from, today } = input;
  const to = input.to < today ? input.to : today;
  const inRange = input.items.filter(({ event }) => isIsoDate(event.date) && event.date >= from && event.date <= to);

  const counted = inRange.filter(({ event, rating }) => countsForStats(event, rating, today));
  const took = counted.filter(({ rating }) => rating!.attendance === 'present' || rating!.attendance === 'limited');
  const graded = gradedEvents(inRange);

  const byMonth = new Map<string, typeof graded>();
  for (const entry of graded) {
    const key = entry.event.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }
  const months: SeasonReportMonth[] = [...byMonth.keys()].sort().map((month) => {
    const entries = byMonth.get(month)!;
    const averages = skillAverages(entries);
    return {
      month,
      overall: averageGrade(entries),
      skills: Object.fromEntries(GRADE_FIELDS.map((field) => [field, averages.find((item) => item.field === field)?.value ?? null])) as Record<GradeField, number | null>,
      events: entries.length,
    };
  });

  const achieved = input.plans
    .filter((plan) => plan.status === 'Erreicht' && planDate(plan) >= from && planDate(plan) <= to)
    .sort((a, b) => planDate(a).localeCompare(planDate(b)) || a.focus.localeCompare(b.focus, 'de'))
    .map((plan) => ({ focus: plan.focus, goal: plan.goal, date: planDate(plan) }));

  const paths = input.paths
    .filter((path) => pathFitsPlayer(path, player, input.teamLabel))
    .map((path) => pathView(path, input.progress))
    .filter((view) => view.done > 0)
    .map(
      (view): SeasonReportPath => ({
        title: view.path.title,
        done: view.done,
        total: view.total,
        inPeriod: view.levels
          .filter((entry) => entry.state === 'done' && entry.confirmedAt >= from && entry.confirmedAt <= to)
          .map((entry) => ({ number: entry.number, title: entry.level.title, date: entry.confirmedAt })),
      }),
    );

  const health: SeasonReportHealthEntry[] | null = input.includeHealth
    ? input.absences
        .filter((item) => item.from && item.from <= to && (!item.to || item.to >= from))
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((item) => ({ kind: isInjuryAbsence(item) ? ('Verletzung' as const) : ('Abwesenheit' as const), text: absenceTitle(item), from: item.from, to: item.to }))
    : null;

  return {
    teamName: input.teamName,
    playerName: player.name,
    playerNumber: player.number,
    from,
    to,
    created: today,
    scale: input.scale,
    attendance: {
      rows: availability(inRange, today),
      counted: counted.length,
      took: took.length,
      trainings: took.filter(({ event }) => event.type === 'Training').length,
      games: took.filter(({ event }) => event.type === 'Spiel').length,
    },
    months,
    overall: averageGrade(graded),
    skills: skillAverages(graded).map((item) => ({ field: item.field, label: GRADE_LABELS[item.field], value: item.value })),
    goals: { achieved, running: input.plans.filter((plan) => plan.status !== 'Erreicht').length },
    paths,
    comment: input.comment.trim().slice(0, MAX_SEASON_COMMENT),
    health,
  };
}
