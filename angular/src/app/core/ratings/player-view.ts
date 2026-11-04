/**
 * Kopien einer Bewertung für die Spieleransicht (SCRUM-115). Firestore kann nur ganze Dokumente sperren, deshalb gibt
 * es neben der vollständigen Bewertung `events/{eventId}/ratings/{playerId}` (nur Trainer, mit Kommentar) zwei Kopien,
 * die der Trainer-Client im selben Schreibvorgang mitschreibt:
 * - `ratingValues/{playerId}`: Werte (Anwesenheit, Minuten, Tore, Vorlagen) – Spieler und Eltern lesen sie immer.
 * - `ratingGrades/{playerId}`: Noten (Teilnoten, Gesamtnote, Skala) mit Server-Zeitpunkt `ratedAt` – lesbar nur bei einer
 *   gültigen Freigabe und nur, wenn die Note bis zum Klick auf „Bewertung veröffentlichen“ vergeben wurde.
 * Der Kommentar (`note`) steht in keiner Kopie: Spieler und Eltern sehen ihn nie.
 */
import { GRADE_FIELDS, type Rating, docFromRating, ratingFromDoc } from './rating';

/** Version der Kopien; das Kennzeichen `meta/playerView` mit dieser Version heißt „alle Kopien sind angelegt“. */
export const PLAYER_VIEW_VERSION = 1;

type Doc = Readonly<Record<string, unknown>>;

/**
 * Platzhalter für „Server-Zeit“ in reinen Schreiblisten (Sicherung einspielen): {@link BackupApi} ersetzt ihn beim
 * Schreiben durch `serverTimestamp()` – die Regeln verlangen für `ratedAt` die Server-Zeit.
 */
export const SERVER_TIME = '__serverTime__';

/** Felder der Werte-Kopie (gleiche Leerwerte wie die Bewertung: '' statt null). */
export function valuesDoc(playerId: string, data: Doc): Record<string, unknown> {
  const full = docFromRating(ratingFromDoc(data));
  return { playerId, attendance: full['attendance'], minutes: full['minutes'], goals: full['goals'], assists: full['assists'] };
}

/** Felder der Noten-Kopie ohne `ratedAt` (den setzt der Schreibvorgang als Server-Zeit). */
export function gradesDoc(playerId: string, data: Doc): Record<string, unknown> {
  const rating = ratingFromDoc(data);
  const full = docFromRating(rating);
  const doc: Record<string, unknown> = { playerId, grade: full['grade'] };
  for (const field of GRADE_FIELDS) doc[field] = full[field];
  if (rating.scale !== undefined) doc['scale'] = rating.scale;
  return doc;
}

/**
 * Haben sich die Noten geändert? Nur dann wird die Noten-Kopie neu geschrieben (und bekommt einen neuen Zeitpunkt):
 * Eine spätere Änderung von Minuten, Toren oder Kommentar darf veröffentlichte Noten nicht wieder verbergen.
 * Unbekannter Vorzustand (`undefined`) oder keine Bewertung (`null`) zählt als Änderung.
 */
export function gradesChanged(previous: Doc | null | undefined, next: Doc): boolean {
  if (!previous) return true;
  const a = gradesDoc('', previous);
  const b = gradesDoc('', next);
  return Object.keys({ ...a, ...b }).some((key) => a[key] !== b[key]);
}

/**
 * Bewertung, wie Spieler und Eltern sie sehen: Werte aus der Werte-Kopie, Noten nur, wenn die Noten-Kopie lesbar war
 * (sonst leer), nie ein Kommentar. `null`, wenn es zu diesem Termin keine Werte gibt.
 */
export function playerRating(values: Doc | null, grades: Doc | null): Rating | null {
  if (!values) return null;
  const rating = ratingFromDoc({ ...(grades ?? {}), attendance: values['attendance'], minutes: values['minutes'], goals: values['goals'], assists: values['assists'] });
  return { ...rating, note: '', autoAbsence: false };
}
