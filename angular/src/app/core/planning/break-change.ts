/**
 * Pause anlegen, ändern, verlängern, kürzen oder löschen (SCRUM-148): was mit den Serien-Trainings passiert. Neu oder
 * verlängert: künftige, unbewertete und nicht von Hand geänderte Serien-Trainings in der Pause verschwinden. Gekürzt
 * oder gelöscht: sie entstehen wieder, außer die von Hand gelöschten. Einzeln angelegte Events (ohne Serien-ID) werden nie
 * angefasst. Betrachtet werden nur Termine in den betroffenen Zeiträumen (`scope`), alles andere bleibt, wie es ist.
 */
import type { TeamEvent } from '../events/event';
import { type DateRange, type PlanningBreak, breakRange, inAnyRange, isInBreak } from './breaks';
import type { TrainingSeries } from './planning';
import { type SkippedDates, changeCandidates, isHandEdited, parseSeriesEventId, planSeriesChange } from './series-events';

/** Neue Trainings einer Serie, die durch die Änderung der Pause (wieder) entstehen. */
export interface BreakCreate {
  readonly series: TrainingSeries;
  readonly dates: readonly string[];
}

export interface BreakChangePlan {
  readonly create: readonly BreakCreate[];
  /** Event-IDs, die wegfallen. */
  readonly remove: readonly string[];
  readonly keptRated: number;
  readonly keptEdited: number;
}

/** Zeiträume, die von der Änderung betroffen sind: der alte und der neue Zeitraum der Pause (je nach Fall nur einer). */
export function breakScope(before: PlanningBreak | null, after: PlanningBreak | null): DateRange[] {
  return [before, after].filter((entry): entry is PlanningBreak => entry !== null).map(breakRange);
}

/** Serien-Events im Zeitraum, bei denen nachgesehen werden muss, ob sie schon bewertet sind. */
export function breakCandidates(series: readonly TrainingSeries[], today: string, events: readonly TeamEvent[], scope: readonly DateRange[]): string[] {
  const ids = new Set<string>();
  for (const entry of series) {
    for (const id of changeCandidates(entry.id, today, events)) {
      const parsed = parseSeriesEventId(id);
      if (parsed && inAnyRange(parsed.date, scope)) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Plan für alle Serien. `breaks` ist die Liste der Pausen nach der Änderung (die geänderte Pause ist darin ersetzt oder
 * fehlt); andere, überlappende Pausen halten ihre Tage weiter frei.
 */
export function planBreakChange(
  series: readonly TrainingSeries[],
  today: string,
  events: readonly TeamEvent[],
  rated: ReadonlySet<string>,
  skipped: SkippedDates,
  breaks: readonly PlanningBreak[],
  scope: readonly DateRange[],
): BreakChangePlan {
  const create: BreakCreate[] = [];
  const remove: string[] = [];
  let keptRated = 0;
  let keptEdited = 0;
  for (const entry of series) {
    const plan = planSeriesChange(entry.id, entry, today, events, rated, skipped, breaks, scope);
    if (plan.create.length > 0) create.push({ series: entry, dates: plan.create });
    remove.push(...plan.remove);
  }
  // Geschützte Termine zählen nur, wenn sie wirklich in einer Pause liegen (sonst betrifft sie die Änderung nicht).
  const seriesIds = new Set(series.map((entry) => entry.id));
  for (const event of events) {
    const parsed = parseSeriesEventId(event.id);
    if (parsed === null || !seriesIds.has(parsed.seriesId) || parsed.date < today || !inAnyRange(parsed.date, scope) || !isInBreak(parsed.date, breaks)) continue;
    if (isHandEdited(event, parsed.date)) keptEdited += 1;
    else if (rated.has(event.id)) keptRated += 1;
  }
  return { create, remove, keptRated, keptEdited };
}

/** Anzahl der Trainings, die neu entstehen. */
export function createdCount(plan: Pick<BreakChangePlan, 'create'>): number {
  return plan.create.reduce((sum, entry) => sum + entry.dates.length, 0);
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Text der Vorschau, z. B. „In der Pause „Herbstferien“: 4 Trainings fallen weg; 1 Termin bleibt, weil er schon bewertet ist.“
 * `lead` ist der Anfang vor dem Doppelpunkt.
 */
export function breakChangeText(lead: string, plan: BreakChangePlan): string {
  const parts: string[] = [];
  if (plan.remove.length > 0) parts.push(`${count(plan.remove.length, 'Training fällt', 'Trainings fallen')} weg`);
  const created = createdCount(plan);
  if (created > 0) parts.push(`${count(created, 'Training entsteht', 'Trainings entstehen')} wieder`);
  if (plan.keptRated > 0) parts.push(`${count(plan.keptRated, 'Termin bleibt', 'Termine bleiben')}, weil ${plan.keptRated === 1 ? 'er' : 'sie'} schon bewertet ${plan.keptRated === 1 ? 'ist' : 'sind'}`);
  if (plan.keptEdited > 0) parts.push(`${count(plan.keptEdited, 'Termin bleibt', 'Termine bleiben')}, weil du ${plan.keptEdited === 1 ? 'ihn' : 'sie'} von Hand geändert hast`);
  return parts.length === 0 ? `${lead}: Es gibt keine Serien-Trainings, die sich dadurch ändern.` : `${lead}: ${parts.join('; ')}.`;
}

/** Ergebnis in Worten nach dem Speichern, z. B. „4 Trainings sind weggefallen.“ */
export function breakSummary(plan: BreakChangePlan): string {
  const parts: string[] = [];
  if (plan.remove.length > 0) parts.push(`${count(plan.remove.length, 'Training ist', 'Trainings sind')} weggefallen`);
  const created = createdCount(plan);
  if (created > 0) parts.push(`${count(created, 'Training wurde', 'Trainings wurden')} wieder angelegt`);
  const kept = plan.keptRated + plan.keptEdited;
  const keptText = kept > 0 ? ` ${kept === 1 ? '1 Termin blieb' : `${kept} Termine blieben`} unverändert, weil ${kept === 1 ? 'er' : 'sie'} bewertet oder von Hand geändert ${kept === 1 ? 'wurde' : 'wurden'}.` : '';
  return `${parts.length > 0 ? `${parts.join(', ')}.` : 'Es mussten keine Trainings geändert werden.'}${keptText}`;
}
