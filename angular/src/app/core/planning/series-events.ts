/**
 * Serien-Trainings (SCRUM-146): aus einer Trainingsserie entstehen echte Events (Typ Training), eines je passendem
 * Wochentag zwischen Start- und Enddatum. Die Event-ID ist fest (`serie-<Serien-ID>-JJJJ-MM-TT`): Wer eine Serie
 * mehrfach speichert oder zu zweit speichert, schreibt immer dasselbe Dokument und erzeugt nichts doppelt. Ein von
 * Hand gelöschtes Serien-Training steht als Merker (`skipped.{serie}.{datum}`) im Planungsdokument und entsteht
 * nicht neu. Startzeiten bleiben Ortszeit-Texte (`17:30`, Europe/Berlin); die Zeitumstellung verschiebt sie nicht.
 */
import { type TeamEvent, docFromEvent, legacyIntensityForExertion } from '../events/event';
import { isIsoDate } from '../shared/dates';
import { type DateRange, type PlanningBreak, inAnyRange, isInBreak } from './breaks';
import { type TrainingSeries, isoWeekday, seriesTitle } from './planning';

/** Events je Schreibvorgang (Firestore erlaubt 500; kleiner gewählt, damit ein Fehler nur einen Teil trifft). */
export const SERIES_EVENT_BATCH_SIZE = 50;

const SERIES_EVENT_ID = /^serie-(.+)-(\d{4}-\d{2}-\d{2})$/;

export function seriesEventId(seriesId: string, date: string): string {
  return `serie-${seriesId}-${date}`;
}

/** Serie und Datum aus einer Serien-Event-ID; null bei jedem anderen Event. */
export function parseSeriesEventId(eventId: string): { readonly seriesId: string; readonly date: string } | null {
  const match = SERIES_EVENT_ID.exec(eventId);
  return match && isIsoDate(match[2]) ? { seriesId: match[1], date: match[2] } : null;
}

export function isSeriesEvent(eventId: string): boolean {
  return parseSeriesEventId(eventId) !== null;
}

/**
 * Rückfrage beim Löschen eines Termins (SCRUM-222): `plain` = normaler Termin, nur die übliche Bestätigung;
 * `series` = Termin einer Trainingsserie, der Trainer wählt „nur diesen“ oder „alle Termine der Serie“.
 * „Alle“ gibt es nur, wenn die Serie in der Planung noch existiert (sonst gibt es nichts, was sich löschen ließe).
 */
export type DeleteChoice = { readonly kind: 'plain' } | { readonly kind: 'series'; readonly seriesId: string; readonly allAvailable: boolean };

export function deleteChoice(eventId: string, existingSeriesIds: readonly string[], planningReady: boolean): DeleteChoice {
  const parsed = parseSeriesEventId(eventId);
  if (!parsed) return { kind: 'plain' };
  return { kind: 'series', seriesId: parsed.seriesId, allAvailable: planningReady && existingSeriesIds.includes(parsed.seriesId) };
}

/** Gelöschte Serien-Termine je Serie, aus dem Planungsdokument (`skipped`); Unbrauchbares wird ignoriert. */
export type SkippedDates = ReadonlyMap<string, ReadonlySet<string>>;

export function skippedFromPlanningDoc(doc: Readonly<Record<string, unknown>> | null): SkippedDates {
  const result = new Map<string, Set<string>>();
  const raw = doc?.['skipped'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;
  for (const [seriesId, dates] of Object.entries(raw)) {
    if (typeof dates !== 'object' || dates === null || Array.isArray(dates)) continue;
    const valid = Object.entries(dates).filter(([date, flag]) => flag === true && isIsoDate(date)).map(([date]) => date);
    if (valid.length > 0) result.set(seriesId, new Set(valid));
  }
  return result;
}

/** Alle Termine der Serie ab `from` (einschließlich) bis zum Enddatum, aufsteigend. */
export function seriesDates(series: Pick<TrainingSeries, 'weekday' | 'startDate' | 'endDate'>, from: string): string[] {
  const first = series.startDate > from ? series.startDate : from;
  if (series.endDate < first) return [];
  const start = new Date(`${first}T00:00:00Z`).getTime();
  const end = new Date(`${series.endDate}T00:00:00Z`).getTime();
  const offset = (series.weekday - isoWeekday(first) + 7) % 7;
  const dates: string[] = [];
  for (let time = start + offset * 86_400_000; time <= end; time += 7 * 86_400_000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}

export interface SeriesPlan {
  /** Termine, die neu angelegt werden. */
  readonly create: readonly string[];
  /** Termine, die es schon gibt (nichts wird überschrieben). */
  readonly existing: number;
  /** Von Hand gelöschte Termine (entstehen nicht neu). */
  readonly deleted: number;
  /** Termine vor heute (werden nicht angelegt). */
  readonly past: number;
  /** Künftige Termine in einer Pause (entstehen nicht, SCRUM-148). */
  readonly paused: number;
}

/**
 * Was beim Speichern der Serie passiert. `today` ist das heutige Datum; `existingIds` die IDs aller vorhandenen Events
 * (ein Spiel am selben Tag zählt nicht: es ändert nichts, das Training entsteht trotzdem).
 */
export function planSeries(
  series: TrainingSeries,
  today: string,
  existingIds: ReadonlySet<string>,
  skipped: SkippedDates,
  breaks: readonly PlanningBreak[] = [],
): SeriesPlan {
  const all = seriesDates(series, series.startDate);
  const upcoming = new Set(seriesDates(series, today));
  const gone = skipped.get(series.id);
  const create: string[] = [];
  let existing = 0;
  let deleted = 0;
  let paused = 0;
  for (const date of all) {
    if (!upcoming.has(date)) continue;
    if (isInBreak(date, breaks)) paused += 1;
    else if (existingIds.has(seriesEventId(series.id, date))) existing += 1;
    else if (gone?.has(date)) deleted += 1;
    else create.push(date);
  }
  return { create, existing, deleted, past: all.length - upcoming.size, paused };
}

/** Das Training einer Serie an einem Tag. */
export function eventFromSeries(series: TrainingSeries, date: string): TeamEvent {
  return {
    id: seriesEventId(series.id, date),
    type: 'Training',
    title: seriesTitle(series),
    date,
    exertion: series.exertion,
    intensity: legacyIntensityForExertion(series.exertion),
    location: series.location,
    trainingFocus: series.trainingFocus,
    opponent: '',
    goalsFor: null,
    goalsAgainst: null,
    matchDuration: null,
    startTime: series.startTime,
    durationMinutes: series.durationMinutes,
    locationCoords: series.locationCoords,
    notes: '',
  };
}

/** Text der Vorschau vor dem Speichern. */
/** Hinweis auf Termine, die wegen einer Pause ausfallen. */
function pausedNote(paused: number): string {
  return `${paused} ${paused === 1 ? 'Termin fällt' : 'Termine fallen'} in eine Pause und ${paused === 1 ? 'wird' : 'werden'} nicht angelegt`;
}

export function planText(plan: SeriesPlan): string {
  const count = plan.create.length;
  const main = count === 0 ? 'Es werden keine neuen Trainings angelegt.' : count === 1 ? '1 Training wird angelegt.' : `${count} Trainings werden angelegt.`;
  const notes: string[] = [];
  if (plan.existing > 0) notes.push(`${plan.existing} ${plan.existing === 1 ? 'Termin gibt' : 'Termine gibt'} es schon`);
  if (plan.deleted > 0) notes.push(`${plan.deleted} von Hand ${plan.deleted === 1 ? 'gelöschter Termin entsteht' : 'gelöschte Termine entstehen'} nicht neu`);
  if (plan.past > 0) notes.push(`${plan.past} ${plan.past === 1 ? 'Termin liegt' : 'Termine liegen'} vor heute und ${plan.past === 1 ? 'wird' : 'werden'} nicht angelegt`);
  if (plan.paused > 0) notes.push(pausedNote(plan.paused));
  return notes.length > 0 ? `${main} (${notes.join('; ')}.)` : main;
}

// --- Serie ändern, verlängern, kürzen, löschen (SCRUM-147) ---

/** Felder eines Serien-Trainings, die die Serie vorgibt und bei einer Serienänderung angepasst werden. */
const SERIES_FIELDS = ['title', 'exertion', 'intensity', 'location', 'trainingFocus', 'startTime', 'durationMinutes', 'locationCoords'] as const;

/** Ein Serien-Event, das beim Ändern angepasst wird: nur die geänderten Felder (Dokumentform). */
export interface SeriesEventUpdate {
  readonly id: string;
  readonly changes: Readonly<Record<string, unknown>>;
}

export interface SeriesChangePlan extends SeriesPlan {
  /** Termine, die angepasst werden. */
  readonly update: readonly SeriesEventUpdate[];
  /** Termine (Event-IDs), die entfernt werden. */
  readonly remove: readonly string[];
  /** Künftige Termine, die schon stimmen. */
  readonly unchanged: number;
  /** Künftige Termine, die bleiben, weil es Bewertungen/Anwesenheit/Notizen gibt. */
  readonly keptRated: number;
  /** Künftige Termine, die bleiben, weil der Trainer sie einzeln bearbeitet hat. */
  readonly keptEdited: number;
}

/** Von Hand bearbeitet: markiert, verlegt (anderes Datum als in der ID) oder kein Training mehr. */
export function isHandEdited(event: TeamEvent, date: string): boolean {
  return event.seriesEdited === true || event.type !== 'Training' || event.date !== date;
}

/**
 * Serien-Events von heute an, die eine Änderung der Serie überhaupt betreffen könnte (nicht vergangen, nicht von Hand
 * bearbeitet). Nur bei diesen muss nachgesehen werden, ob es Bewertungen gibt.
 */
export function changeCandidates(seriesId: string, today: string, events: readonly TeamEvent[]): string[] {
  return events
    .filter((event) => {
      const parsed = parseSeriesEventId(event.id);
      return parsed !== null && parsed.seriesId === seriesId && parsed.date >= today && !isHandEdited(event, parsed.date);
    })
    .map((event) => event.id);
}

/**
 * Was beim Speichern (`series` gesetzt) oder Löschen (`series` null) der Serie passiert. Vergangene, bewertete und von
 * Hand bearbeitete Termine bleiben immer, wie sie sind. `rated` sind die IDs der Events mit Bewertungen/Notizen.
 * Tage in einer Pause (`breaks`) bekommen kein Training: vorhandene unbewertete Serien-Trainings dort werden entfernt.
 * Mit `scope` (SCRUM-148, Pause geändert) werden nur Termine in diesen Zeiträumen betrachtet; alles andere bleibt unberührt.
 */
export function planSeriesChange(
  seriesId: string,
  series: TrainingSeries | null,
  today: string,
  events: readonly TeamEvent[],
  rated: ReadonlySet<string>,
  skipped: SkippedDates,
  breaks: readonly PlanningBreak[] = [],
  scope: readonly DateRange[] | null = null,
): SeriesChangePlan {
  const planned: SeriesPlan = series ? planSeries(series, today, new Set(events.map((event) => event.id)), skipped, breaks) : { create: [], existing: 0, deleted: 0, past: 0, paused: 0 };
  const base: SeriesPlan = scope ? { ...planned, create: planned.create.filter((date) => inAnyRange(date, scope)) } : planned;
  const wanted = series ? new Set(seriesDates(series, today).filter((date) => !isInBreak(date, breaks))) : new Set<string>();
  const update: SeriesEventUpdate[] = [];
  const remove: string[] = [];
  let unchanged = 0;
  let keptRated = 0;
  let keptEdited = 0;
  for (const event of events) {
    const parsed = parseSeriesEventId(event.id);
    if (parsed === null || parsed.seriesId !== seriesId || parsed.date < today) continue;
    if (scope && !inAnyRange(parsed.date, scope)) continue;
    if (isHandEdited(event, parsed.date)) keptEdited += 1;
    else if (rated.has(event.id)) keptRated += 1;
    else if (series === null || !wanted.has(parsed.date)) remove.push(event.id);
    else {
      const target = docFromEvent(eventFromSeries(series, parsed.date));
      const current = docFromEvent(event);
      const changes = Object.fromEntries(SERIES_FIELDS.filter((field) => JSON.stringify(target[field]) !== JSON.stringify(current[field])).map((field) => [field, target[field]]));
      if (Object.keys(changes).length > 0) update.push({ id: event.id, changes });
      else unchanged += 1;
    }
  }
  return { ...base, update, remove, unchanged, keptRated, keptEdited };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Text der Vorschau beim Ändern/Löschen, z. B. „6 Termine werden angepasst; 2 Termine werden entfernt; 1 Termin bleibt, weil er schon bewertet ist.“ */
export function changeText(plan: SeriesChangePlan): string {
  const main: string[] = [];
  if (plan.create.length > 0) main.push(count(plan.create.length, 'Training wird', 'Trainings werden') + ' angelegt');
  if (plan.update.length > 0) main.push(count(plan.update.length, 'Termin wird', 'Termine werden') + ' angepasst');
  if (plan.remove.length > 0) main.push(count(plan.remove.length, 'Termin wird', 'Termine werden') + ' entfernt');
  if (plan.keptRated > 0) main.push(`${count(plan.keptRated, 'Termin bleibt', 'Termine bleiben')}, weil ${plan.keptRated === 1 ? 'er' : 'sie'} schon bewertet ${plan.keptRated === 1 ? 'ist' : 'sind'}`);
  if (plan.keptEdited > 0) main.push(`${count(plan.keptEdited, 'Termin bleibt', 'Termine bleiben')}, weil du ${plan.keptEdited === 1 ? 'ihn' : 'sie'} von Hand geändert hast`);
  const notes: string[] = [];
  if (plan.existing > 0 && plan.update.length === 0 && plan.remove.length === 0) notes.push(`${plan.existing} ${plan.existing === 1 ? 'Termin gibt' : 'Termine gibt'} es schon`);
  if (plan.deleted > 0) notes.push(`${plan.deleted} von Hand ${plan.deleted === 1 ? 'gelöschter Termin entsteht' : 'gelöschte Termine entstehen'} nicht neu`);
  if (plan.past > 0) notes.push(`${plan.past} ${plan.past === 1 ? 'Termin liegt' : 'Termine liegen'} vor heute und ${plan.past === 1 ? 'wird' : 'werden'} nicht angelegt`);
  if (plan.paused > 0) notes.push(pausedNote(plan.paused));
  const sentence = main.length === 0 ? 'Es werden keine neuen Trainings angelegt.' : `${main.join('; ')}.`;
  return notes.length > 0 ? `${sentence} (${notes.join('; ')}.)` : sentence;
}
