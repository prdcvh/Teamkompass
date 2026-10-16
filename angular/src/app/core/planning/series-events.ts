/**
 * Serien-Trainings (SCRUM-146): aus einer Trainingsserie entstehen echte Events (Typ Training), eines je passendem
 * Wochentag zwischen Start- und Enddatum. Die Event-ID ist fest (`serie-<Serien-ID>-JJJJ-MM-TT`): Wer eine Serie
 * mehrfach speichert oder zu zweit speichert, schreibt immer dasselbe Dokument und erzeugt nichts doppelt. Ein von
 * Hand gelöschtes Serien-Training steht als Merker (`skipped.{serie}.{datum}`) im Planungsdokument und entsteht
 * nicht neu. Startzeiten bleiben Ortszeit-Texte (`17:30`, Europe/Berlin); die Zeitumstellung verschiebt sie nicht.
 */
import { type TeamEvent } from '../events/event';
import { isIsoDate } from '../shared/dates';
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
}

/**
 * Was beim Speichern der Serie passiert. `today` ist das heutige Datum; `existingIds` die IDs aller vorhandenen Events
 * (ein Spiel am selben Tag zählt nicht: es ändert nichts, das Training entsteht trotzdem).
 */
export function planSeries(series: TrainingSeries, today: string, existingIds: ReadonlySet<string>, skipped: SkippedDates): SeriesPlan {
  const all = seriesDates(series, series.startDate);
  const upcoming = new Set(seriesDates(series, today));
  const gone = skipped.get(series.id);
  const create: string[] = [];
  let existing = 0;
  let deleted = 0;
  for (const date of all) {
    if (!upcoming.has(date)) continue;
    if (existingIds.has(seriesEventId(series.id, date))) existing += 1;
    else if (gone?.has(date)) deleted += 1;
    else create.push(date);
  }
  return { create, existing, deleted, past: all.length - upcoming.size };
}

/** Das Training einer Serie an einem Tag. */
export function eventFromSeries(series: TrainingSeries, date: string): TeamEvent {
  return {
    id: seriesEventId(series.id, date),
    type: 'Training',
    title: seriesTitle(series),
    date,
    intensity: series.intensity,
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
export function planText(plan: SeriesPlan): string {
  const count = plan.create.length;
  const main = count === 0 ? 'Es werden keine neuen Trainings angelegt.' : count === 1 ? '1 Training wird angelegt.' : `${count} Trainings werden angelegt.`;
  const notes: string[] = [];
  if (plan.existing > 0) notes.push(`${plan.existing} ${plan.existing === 1 ? 'Termin gibt' : 'Termine gibt'} es schon`);
  if (plan.deleted > 0) notes.push(`${plan.deleted} von Hand ${plan.deleted === 1 ? 'gelöschter Termin entsteht' : 'gelöschte Termine entstehen'} nicht neu`);
  if (plan.past > 0) notes.push(`${plan.past} ${plan.past === 1 ? 'Termin liegt' : 'Termine liegen'} vor heute und ${plan.past === 1 ? 'wird' : 'werden'} nicht angelegt`);
  return notes.length > 0 ? `${main} (${notes.join('; ')}.)` : main;
}
