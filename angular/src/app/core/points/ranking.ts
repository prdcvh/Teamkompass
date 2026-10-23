/**
 * MVP und Top-5-Ranking (SCRUM-105): aus den Trainingspunkten (SCRUM-104) wird automatisch eine Rangliste für die
 * laufende Woche (Montag bis Sonntag) und den laufenden Kalendermonat berechnet. Es zählen nur Events, die Punkte
 * vergeben (`countsPoints`). Gleichstand: Gleichplatzierte teilen sich den Platz, der nächste Platz wird übersprungen
 * (1, 1, 3). Platz 1 ist der MVP (bei Gleichstand gibt es mehrere).
 *
 * Spieler dürfen die Punkte anderer Spieler nicht lesen. Deshalb speichert der Trainer die fertige Rangliste
 * (Platz, Name, Punkte) in einem eigenen Dokument `meta/ranking`, das Spieler und Eltern des Teams lesen dürfen.
 */
import { addDays } from '../shared/dates';

/** Wie viele Plätze die Rangliste zeigt (bei Gleichstand auf dem letzten Platz können es mehr Einträge sein). */
export const RANKING_PLACES = 5;

/**
 * Sehen Spieler und Eltern die Punktzahl der anderen? Offene Frage an den PO (SCRUM-105): vorerst ja. Bei `false`
 * schreibt der Trainer nur Platz und Name ins Ranglisten-Dokument; die Punkte verlassen den Trainer-Bereich dann nie.
 */
export const RANKING_SHOWS_POINTS_TO_PLAYERS = true;

/** Ein Zeitraum (beide Grenzen einschließlich), als ISO-Datum. */
export interface Period {
  readonly from: string;
  readonly to: string;
}

export interface RankingEntry {
  readonly rank: number;
  readonly name: string;
  /** Fehlt, wenn die Punktzahl für Spieler ausgeblendet ist. */
  readonly points?: number;
}

/** Rangliste eines Zeitraums. */
export interface PeriodRanking extends Period {
  readonly entries: readonly RankingEntry[];
}

/** Inhalt von `meta/ranking`. */
export interface Ranking {
  readonly week: PeriodRanking;
  readonly month: PeriodRanking;
  /** Zeitpunkt der Berechnung (ISO-Zeitstempel), nur zur Information. */
  readonly updatedAt: string;
}

/** Woche von Montag bis Sonntag, in der das Datum liegt. */
export function weekPeriod(date: string): Period {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const from = addDays(date, -((weekday + 6) % 7));
  return { from, to: addDays(from, 6) };
}

/** Kalendermonat, in dem das Datum liegt. */
export function monthPeriod(date: string): Period {
  const from = `${date.slice(0, 8)}01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/** Summe je Spieler → Rangliste: nur Punkte über 0, absteigend, gleiche Punkte = gleicher Platz, Plätze bis `places`. */
export function rankPlayers(totals: readonly { readonly name: string; readonly points: number }[], places = RANKING_PLACES): RankingEntry[] {
  const sorted = totals.filter((entry) => entry.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'de'));
  return sorted
    .map((entry) => ({ rank: sorted.findIndex((other) => other.points === entry.points) + 1, name: entry.name, points: entry.points }))
    .filter((entry) => entry.rank <= places);
}

/** Entfernt die Punktzahlen (wenn Spieler sie nicht sehen sollen). */
export function withoutPoints(entries: readonly RankingEntry[]): RankingEntry[] {
  return entries.map(({ rank, name }) => ({ rank, name }));
}

/** Liest ein Ranglisten-Dokument defensiv (Spieler lesen fremde Daten nur über dieses Dokument). Unbrauchbar → null. */
export function rankingFromDoc(data: Readonly<Record<string, unknown>> | null): Ranking | null {
  if (!data) return null;
  const week = periodFromDoc(data['week']);
  const month = periodFromDoc(data['month']);
  if (!week || !month) return null;
  return { week, month, updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : '' };
}

function periodFromDoc(value: unknown): PeriodRanking | null {
  if (!value || typeof value !== 'object') return null;
  const { from, to, entries } = value as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string' || !Array.isArray(entries)) return null;
  const list: RankingEntry[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const { rank, name, points } = entry as Record<string, unknown>;
    if (typeof rank !== 'number' || typeof name !== 'string') continue;
    list.push(typeof points === 'number' ? { rank, name, points } : { rank, name });
  }
  return { from, to, entries: list };
}

export function docFromRanking(ranking: Ranking): Record<string, unknown> {
  const period = (value: PeriodRanking) => ({ from: value.from, to: value.to, entries: value.entries.map((entry) => ({ ...entry })) });
  return { week: period(ranking.week), month: period(ranking.month), updatedAt: ranking.updatedAt };
}

/** Stimmt der gespeicherte Zeitraum mit dem heutigen überein? Sonst ist die Liste veraltet und wird als leer gezeigt. */
export function entriesFor(stored: PeriodRanking | null | undefined, current: Period): readonly RankingEntry[] {
  return stored && stored.from === current.from && stored.to === current.to ? stored.entries : [];
}

/** Gleiche Inhalte (ohne Zeitstempel)? Dann muss nichts neu geschrieben werden. */
export function sameRanking(a: Ranking | null, b: Ranking): boolean {
  if (!a) return false;
  return JSON.stringify(docFromRanking({ ...a, updatedAt: '' })) === JSON.stringify(docFromRanking({ ...b, updatedAt: '' }));
}
