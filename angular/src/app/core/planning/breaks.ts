/**
 * Pausen (SCRUM-148): Ferien, Winter- und Sommerpausen eines Teams. Eine Pause hat einen Namen und einen Zeitraum
 * (Von bis Bis, beide Tage eingeschlossen). An Tagen in einer Pause entstehen keine Serien-Trainings. Sie liegt im
 * Planungsdokument `teams/{teamId}/meta/planning` unter `breaks.{id}` (eine Map wie bei den Serien). Überlappende
 * Pausen sind erlaubt; ein Tag zählt als Pause, sobald ihn irgendeine Pause enthält.
 */
import { MAX_TITLE_LENGTH } from '../events/event';
import { addDays, formatDate, isIsoDate } from '../shared/dates';

export interface PlanningBreak {
  readonly id: string;
  readonly name: string;
  /** ISO-Datum, erster Tag der Pause. */
  readonly startDate: string;
  /** ISO-Datum, letzter Tag der Pause (eingeschlossen). */
  readonly endDate: string;
}

/** Formulareingaben. */
export interface BreakDraft {
  readonly id: string | null;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

export type BreakErrors = Partial<Record<'name' | 'startDate' | 'endDate', string>>;

/** Zeitraum in ISO-Daten, beide Grenzen eingeschlossen. */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export function breakRange(entry: Pick<PlanningBreak, 'startDate' | 'endDate'>): DateRange {
  return { from: entry.startDate, to: entry.endDate };
}

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

export function inAnyRange(date: string, ranges: readonly DateRange[]): boolean {
  return ranges.some((range) => inRange(date, range));
}

/** Liegt der Tag in mindestens einer Pause? */
export function isInBreak(date: string, breaks: readonly Pick<PlanningBreak, 'startDate' | 'endDate'>[]): boolean {
  return breaks.some((entry) => date >= entry.startDate && date <= entry.endDate);
}

export function emptyBreakDraft(today: string): BreakDraft {
  return { id: null, name: '', startDate: today, endDate: '' };
}

export function draftFromBreak(entry: PlanningBreak): BreakDraft {
  return { id: entry.id, name: entry.name, startDate: entry.startDate, endDate: entry.endDate };
}

/** Prüft die Eingaben; leeres Ergebnis = gültig. Bis darf nicht vor Von liegen, der Name ist Pflicht. */
export function validateBreakDraft(draft: BreakDraft): BreakErrors {
  const errors: BreakErrors = {};
  const name = draft.name.trim();
  if (name === '') errors.name = 'Bitte einen Namen angeben, z. B. „Herbstferien“.';
  else if (name.length > MAX_TITLE_LENGTH) errors.name = `Der Name darf höchstens ${MAX_TITLE_LENGTH} Zeichen lang sein.`;
  const startOk = isIsoDate(draft.startDate);
  const endOk = isIsoDate(draft.endDate);
  if (!startOk) errors.startDate = draft.startDate === '' ? 'Bitte angeben, ab wann die Pause gilt (Von).' : 'Das Von-Datum ist ungültig.';
  if (!endOk) errors.endDate = draft.endDate === '' ? 'Bitte angeben, bis wann die Pause gilt (Bis).' : 'Das Bis-Datum ist ungültig.';
  if (startOk && endOk && draft.endDate < draft.startDate) errors.endDate = 'Das Bis-Datum darf nicht vor dem Von-Datum liegen.';
  return errors;
}

/** Gültigen Entwurf in eine Pause umwandeln (nur nach leerem {@link validateBreakDraft} aufrufen). */
export function breakFromDraft(draft: BreakDraft, id: string): PlanningBreak {
  return { id, name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate };
}

/** Felder einer Pause im Firestore-Dokument (ohne die ID, sie ist der Schlüssel in der Map). */
export function docFromBreak(entry: PlanningBreak): Record<string, unknown> {
  return { name: entry.name, startDate: entry.startDate, endDate: entry.endDate };
}

/** Eine Pause aus dem Dokument; null, wenn sie unbrauchbar ist (wird übersprungen, nie geraten). */
export function breakFromDoc(id: string, data: unknown): PlanningBreak | null {
  if (typeof data !== 'object' || data === null) return null;
  const { name, startDate, endDate } = data as Record<string, unknown>;
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return null;
  const label = typeof name === 'string' ? name.trim().slice(0, MAX_TITLE_LENGTH) : '';
  return { id, name: label === '' ? 'Pause' : label, startDate, endDate };
}

/** Alle brauchbaren Pausen aus dem Dokument `meta/breaks`, sortiert nach Beginn. */
export function breaksFromDoc(doc: Readonly<Record<string, unknown>> | null): PlanningBreak[] {
  const map = doc?.['breaks'];
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return [];
  return Object.entries(map)
    .map(([id, data]) => breakFromDoc(id, data))
    .filter((entry): entry is PlanningBreak => entry !== null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** Zeitraum als Text, z. B. „12.10.2026 bis 25.10.2026“. */
export function breakPeriodText(entry: Pick<PlanningBreak, 'startDate' | 'endDate'>): string {
  return `${formatDate(entry.startDate)} bis ${formatDate(entry.endDate)}`;
}

/** So viele Tage vor Beginn einer Pause wird schon auf sie hingewiesen. */
export const BREAK_NOTICE_DAYS = 14;

const dayMonth = (iso: string) => formatDate(iso).slice(0, 6);

/**
 * Einzeiliger Hinweis auf die laufende oder die nächste Pause (SCRUM-150), sonst null.
 * - Läuft eine Pause (Von bis Bis, beide Tage eingeschlossen): „Winterpause bis 10.01.“ Laufen mehrere, gilt die mit dem
 *   spätesten Ende.
 * - Beginnt eine Pause in höchstens {@link BREAK_NOTICE_DAYS} Tagen: „Ab 27.10. Herbstferien (bis 07.11.)“. Es zählt die
 *   früheste.
 * Es kommt nur Name und Zeitraum vor.
 */
export function breakNotice(breaks: readonly Pick<PlanningBreak, 'name' | 'startDate' | 'endDate'>[], today: string): string | null {
  const running = breaks.filter((entry) => inRange(today, breakRange(entry))).sort((a, b) => b.endDate.localeCompare(a.endDate) || a.name.localeCompare(b.name))[0];
  if (running) return `${running.name} bis ${dayMonth(running.endDate)}`;
  const limit = addDays(today, BREAK_NOTICE_DAYS);
  const next = breaks.filter((entry) => entry.startDate > today && entry.startDate <= limit).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name))[0];
  return next ? `Ab ${dayMonth(next.startDate)} ${next.name} (bis ${dayMonth(next.endDate)})` : null;
}
