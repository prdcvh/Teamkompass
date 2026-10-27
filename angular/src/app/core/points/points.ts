/**
 * Trainingspunkte (SCRUM-104): Der Trainer trägt je Spieler und Event eine freie Punktzahl ein (ganze Zahl,
 * auch negativ (SCRUM-213), keine Obergrenze, leer = 0). Die Punkte liegen bewusst im Trainer-Pfad `privateNotes` des Events
 * (Spieler und Eltern können ihn nicht lesen, die Firestore-Regeln bleiben unverändert).
 *
 * Trainings zählen immer. Bei Spielen entscheidet der Trainer am Event („Punkte vergeben: ja/nein“,
 * `pointsEnabled`); bei „nein“ (oder wenn nie gewählt) zählt das Spiel nicht, bereits eingetragene Punkte
 * bleiben aber gespeichert und zählen wieder, sobald auf „ja“ gestellt wird.
 */
import { type TeamEvent } from '../events/event';

/** Ein Event samt den für einen Spieler gespeicherten Punkten (unabhängig davon, ob das Event sie zählt). */
export interface PointsEntry {
  readonly event: TeamEvent;
  readonly points: number;
  /** Hat dieser Spieler für das Event eine Bewertung (Note, „Fehlt“ oder „Nicht im Kader“)? Fehlt die Angabe, gilt es als bewertet. */
  readonly rated?: boolean;
}

/** Eine Zeile des Punkteverlaufs. */
export interface PointsHistoryRow {
  readonly event: TeamEvent;
  readonly points: number;
  /** Summe aller Punkte bis einschließlich dieses Events. */
  readonly total: number;
}

/** Gespeicherter Wert → Punkte: ganze Zahlen, auch negative (SCRUM-213); alles andere (leer, Text, NaN) ist 0. */
export function normalizePoints(value: unknown): number {
  if (typeof value === 'string' && value.trim() === '') return 0;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return 0;
  const rounded = Math.round(number) + 0; // + 0 macht aus -0 eine 0
  return Math.max(Math.min(rounded, Number.MAX_SAFE_INTEGER), -Number.MAX_SAFE_INTEGER);
}

/**
 * Feld im Trainer-Dokument, in dem der Live-Modus jede einzelne Änderung unter einer eigenen Kennung ablegt (SCRUM-216):
 * `{ [änderungsId]: +2 | −1 | … }`. Ein erneutes Senden derselben Änderung (Funkloch, App neu geöffnet) schreibt denselben
 * Schlüssel mit demselben Wert und zählt deshalb nie doppelt; Änderungen eines zweiten Trainers haben eigene Schlüssel
 * und werden addiert. Schlüssel werden nie gelöscht.
 */
export const LIVE_POINTS_FIELD = 'live';

/** Summe aller Live-Änderungen eines Trainer-Dokuments (Ungültiges zählt 0). */
export function livePointsSum(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  let sum = 0;
  for (const delta of Object.values(value as Record<string, unknown>)) sum += typeof delta === 'number' ? normalizePoints(delta) : 0;
  return normalizePoints(sum);
}

/** Punkte eines Trainer-Dokuments: eingetragener Grundwert (`points`) plus alle Live-Änderungen. */
export function pointsFromDoc(data: Readonly<Record<string, unknown>> | null | undefined): number {
  if (!data) return 0;
  return normalizePoints(normalizePoints(data['points']) + livePointsSum(data[LIVE_POINTS_FIELD]));
}

/** Zählen die Punkte dieses Events? Training immer, Spiel nur mit „Punkte vergeben: ja“. */
export function countsPoints(event: Pick<TeamEvent, 'type' | 'pointsEnabled'>): boolean {
  return event.type === 'Training' || event.pointsEnabled === true;
}

/** Punkte, die für dieses Event zählen (0, wenn das Event keine Punkte vergibt). */
export function countedPoints(entry: PointsEntry): number {
  return countsPoints(entry.event) ? normalizePoints(entry.points) : 0;
}

/** Summe aller zählenden Punkte. */
export function totalPoints(entries: readonly PointsEntry[]): number {
  return entries.reduce((sum, entry) => sum + countedPoints(entry), 0);
}

/**
 * Punkteverlauf: nur Events, die Punkte vergeben, älteste zuerst, mit laufender Summe. Events ohne Punkte
 * (Spiel auf „nein“) tauchen nicht auf; ein Event, das Punkte vergibt, aber 0 hat, bleibt als 0 sichtbar.
 * Events, an denen der Spieler nicht bewertet wurde (`rated === false`) und die 0 Punkte haben, werden nicht gelistet
 * (SCRUM-226). Hat er dort Punkte ≠ 0 (z. B. live vergeben, ohne Note), bleibt die Zeile sichtbar. So ist die laufende
 * Summe der letzten Zeile immer gleich `totalPoints`.
 */
export function pointsHistory(entries: readonly PointsEntry[]): PointsHistoryRow[] {
  const counted = entries
    .filter((entry) => countsPoints(entry.event))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.title.localeCompare(b.event.title, 'de'));
  let total = 0;
  const rows: PointsHistoryRow[] = [];
  for (const entry of counted) {
    const points = normalizePoints(entry.points);
    total += points;
    if (entry.rated !== false || points !== 0) rows.push({ event: entry.event, points, total });
  }
  return rows;
}
