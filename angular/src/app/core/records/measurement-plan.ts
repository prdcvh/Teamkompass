/**
 * Messplan (SCRUM-255): pro Spieler letzte gültige Messung, nächster Messtermin und Status. Reine Rechenfunktionen,
 * ohne Angular.
 *
 * Der Rhythmus ist ein veränderbarer PRODUKTVORSCHLAG (drei Monate; die Ausarbeitung nennt drei bis vier Monate), keine
 * medizinische Frist. Gespeichert werden nur die bewussten Entscheidungen des Trainers (Rhythmus, vorgezogener oder
 * verschobener Termin, Pause); der nächste Termin wird immer aus der letzten gültigen Messung berechnet. Dadurch rückt
 * eine neue Messung die Fälligkeit genau einmal weiter (es gibt keinen gespeicherten Zähler, der doppelt zählen
 * könnte), und die Korrektur einer Messung betrifft nur diesen Spieler.
 *
 * Gültige Messung: eine Größenmessung, die nicht als auffällig markiert ist (wie die Wachstumsansicht, SCRUM-254).
 * Fehlende Einwilligung und Pause sind keine Versäumnisse: solche Spieler bekommen weder "fällig" noch "überfällig".
 */
import type { ConsentStatus } from '../player/player';
import { isIsoDate } from '../shared/dates';
import { type Measurement, measurementQuality, sortedMeasurements } from './measurement';

/** Produktvorschlag: alle drei Monate. */
export const DEFAULT_INTERVAL_MONTHS = 3;
export const MIN_INTERVAL_MONTHS = 1;
export const MAX_INTERVAL_MONTHS = 6;
/** Eigener Vorschlagswert: so viele Tage vor dem Termin gilt eine Messung als "fällig". */
export const DUE_WINDOW_DAYS = 14;
/** Eigener Vorschlagswert: so viele Tage nach dem Termin gilt sie noch als "fällig", danach als "überfällig". */
export const GRACE_DAYS = 14;

export type PlanStatus = 'baseline-missing' | 'planned' | 'due' | 'overdue' | 'paused' | 'no-consent';

export const PLAN_STATUS_LABELS: Readonly<Record<PlanStatus, string>> = {
  'baseline-missing': 'Baseline fehlt',
  planned: 'Geplant',
  due: 'Fällig',
  overdue: 'Überfällig',
  paused: 'Pausiert',
  'no-consent': 'Nicht im Messplan',
};

/** Bewusste Entscheidungen des Trainers für einen Spieler; fehlt der Eintrag, gilt der Vorschlag. */
export interface PlanEntry {
  /** Eigener Rhythmus in Monaten (1 bis 6); fehlt = Vorschlag (3). */
  readonly intervalMonths?: number;
  /** Manuell gesetzter Termin (ISO) und der Tag, an dem er gesetzt wurde. Gilt nur, bis danach gemessen wurde. */
  readonly dueDate?: string;
  readonly dueSetOn?: string;
  /** Messplanung pausiert (freiwillige Nichtteilnahme o. Ä.); ohne Grund gespeichert. */
  readonly paused?: boolean;
}

export type PlanEntries = Readonly<Record<string, PlanEntry>>;

/** ISO-Datum plus Monate; Monatsende wird gekappt (31.01. + 1 Monat = 28.02.), Jahreswechsel stimmt. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Heutiges Kalenderdatum in Europe/Berlin (unabhängig von der Zeitzone des Geräts). */
export function berlinToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function validInterval(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_INTERVAL_MONTHS && value <= MAX_INTERVAL_MONTHS ? value : undefined;
}

/** `meta/settings.measurementPlan` → Einträge je Spieler; Unbrauchbares wird verworfen. */
export function planEntriesFromDoc(doc: Readonly<Record<string, unknown>> | null): PlanEntries {
  const raw = doc?.['measurementPlan'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, PlanEntry> = {};
  for (const [playerId, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const data = value as Record<string, unknown>;
    const entry: { intervalMonths?: number; dueDate?: string; dueSetOn?: string; paused?: boolean } = {};
    const interval = validInterval(data['intervalMonths']);
    if (interval !== undefined) entry.intervalMonths = interval;
    if (typeof data['dueDate'] === 'string' && isIsoDate(data['dueDate']) && typeof data['dueSetOn'] === 'string' && isIsoDate(data['dueSetOn'])) {
      entry.dueDate = data['dueDate'];
      entry.dueSetOn = data['dueSetOn'];
    }
    if (data['paused'] === true) entry.paused = true;
    if (Object.keys(entry).length > 0) result[playerId] = entry;
  }
  return result;
}

/** Eintrag → Dokument; null, wenn nichts vom Vorschlag abweicht (dann wird das Feld entfernt). */
export function docFromPlanEntry(entry: PlanEntry): Record<string, unknown> | null {
  const doc: Record<string, unknown> = {};
  if (entry.intervalMonths !== undefined && entry.intervalMonths !== DEFAULT_INTERVAL_MONTHS) doc['intervalMonths'] = entry.intervalMonths;
  if (entry.dueDate && entry.dueSetOn) {
    doc['dueDate'] = entry.dueDate;
    doc['dueSetOn'] = entry.dueSetOn;
  }
  if (entry.paused) doc['paused'] = true;
  return Object.keys(doc).length > 0 ? doc : null;
}

/** Jüngste gültige Größenmessung (nicht auffällig markiert); null, wenn es keine gibt. */
export function lastValidMeasurement(measurements: readonly Measurement[]): Measurement | null {
  return sortedMeasurements(measurements)
    .filter((entry) => entry.height !== null && measurementQuality(entry) !== 'flagged')
    .at(-1) ?? null;
}

export interface PlanPlayer {
  readonly id: string;
  readonly name: string;
  readonly consentStatus: ConsentStatus;
}

export interface PlanRow {
  readonly playerId: string;
  readonly name: string;
  readonly status: PlanStatus;
  readonly consentStatus: ConsentStatus;
  /** Datum der letzten gültigen Messung; null = noch keine. */
  readonly lastDate: string | null;
  /** Nächster Messtermin (ISO); null bei fehlender Baseline ohne Termin, Pause oder fehlender Einwilligung. */
  readonly nextDue: string | null;
  /** Der Termin wurde vom Trainer von Hand gesetzt. */
  readonly manual: boolean;
  readonly intervalMonths: number;
  /** Tage bis zum Termin (negativ = vorbei); null ohne Termin. */
  readonly daysUntil: number | null;
}

/** Gilt der von Hand gesetzte Termin noch? Nicht mehr, sobald nach dem Setzen gemessen wurde. */
function manualDue(entry: PlanEntry | undefined, lastValidDate: string | null): string | null {
  if (!entry?.dueDate || !entry.dueSetOn) return null;
  return lastValidDate !== null && lastValidDate >= entry.dueSetOn ? null : entry.dueDate;
}

export function planRow(player: PlanPlayer, measurements: readonly Measurement[], entry: PlanEntry | undefined, today: string): PlanRow {
  const intervalMonths = entry?.intervalMonths ?? DEFAULT_INTERVAL_MONTHS;
  const last = lastValidMeasurement(measurements);
  const base = { playerId: player.id, name: player.name, consentStatus: player.consentStatus, lastDate: last?.date ?? null, intervalMonths };
  // Ohne dokumentierte Einwilligung (offen oder widerrufen) gibt es keinen Messplan: kein Termin, kein Versäumnis.
  if (player.consentStatus !== 'granted') return { ...base, status: 'no-consent', nextDue: null, manual: false, daysUntil: null };
  const manual = manualDue(entry, last?.date ?? null);
  const nextDue = manual ?? (last ? addMonths(last.date, intervalMonths) : null);
  if (entry?.paused) return { ...base, status: 'paused', nextDue, manual: manual !== null, daysUntil: null };
  if (nextDue === null) return { ...base, status: 'baseline-missing', nextDue: null, manual: false, daysUntil: null };
  const daysUntil = daysBetween(today, nextDue);
  const status: PlanStatus = daysUntil < -GRACE_DAYS ? 'overdue' : daysUntil <= DUE_WINDOW_DAYS ? 'due' : 'planned';
  return { ...base, status, nextDue, manual: manual !== null, daysUntil };
}

const ORDER: Readonly<Record<PlanStatus, number>> = { overdue: 0, due: 1, 'baseline-missing': 2, planned: 3, paused: 4, 'no-consent': 5 };

/** Alle Zeilen: dringendste zuerst, dann nach Termin und Name. */
export function buildPlan(players: readonly PlanPlayer[], measurementsByPlayer: ReadonlyMap<string, readonly Measurement[]>, entries: PlanEntries, today: string): PlanRow[] {
  return players
    .map((player) => planRow(player, measurementsByPlayer.get(player.id) ?? [], entries[player.id], today))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999') || a.name.localeCompare(b.name, 'de'));
}

/** Wer in eine Messrunde kommt: überfällig, fällig und ohne Baseline – nie pausierte oder nicht teilnehmende Spieler. */
export function roundQueue(rows: readonly PlanRow[]): PlanRow[] {
  return rows.filter((row) => row.status === 'overdue' || row.status === 'due' || row.status === 'baseline-missing');
}

/** Zählt für die Hinweise in der App: überfällig, fällig und ohne Baseline. Pausierte und nicht teilnehmende zählen nie. */
export function planCounts(rows: readonly PlanRow[]): Readonly<Record<'overdue' | 'due' | 'baselineMissing', number>> {
  return {
    overdue: rows.filter((row) => row.status === 'overdue').length,
    due: rows.filter((row) => row.status === 'due').length,
    baselineMissing: rows.filter((row) => row.status === 'baseline-missing').length,
  };
}

/** Termin für „Messplanung fortsetzen“: heute fällig, nicht überfällig (die Pause war keine Versäumnis). */
export function resumeEntry(entry: PlanEntry | undefined, today: string): PlanEntry {
  return { intervalMonths: entry?.intervalMonths, dueDate: today, dueSetOn: today };
}
