/**
 * Verfügbarkeit eines Spielers aus Status und Abwesenheiten: Grund der Nichtverfügbarkeit, Anzeige-Status und
 * die automatische „Fehlt“-Bewertung (wie Alt-App app.js: unavailabilityReason, applyAutoAbsence).
 */
import { formatDate } from '../shared/dates';
import type { Player } from '../player/player';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import { type Absence, absenceTitle, activeAbsenceOn, isInjuryAbsence } from './absence';

/** Grund in der Bewertung, wenn der Status „Verletzt“ ohne „ca. verletzt bis“ gesetzt ist (SCRUM-164). */
export const OPEN_INJURY_REASON = 'Verletzt (bis auf Weiteres)';

/** Status „Verletzt“ ohne Datum: gilt ab dem Tag, an dem er gesetzt wurde (`injuredSince`), bis auf Weiteres. */
export function isOpenInjury(player: Pick<Player, 'status' | 'injuryUntil'> | null | undefined): boolean {
  return player?.status === 'Verletzt' && !player.injuryUntil;
}

/**
 * Warum ist der Spieler an diesem Tag nicht verfügbar? Der Status „Verletzt“ (mit „ca. verletzt bis“ bis zu diesem
 * Datum, ohne Datum ab dem Tag, an dem er gesetzt wurde, bis auf Weiteres) und eingetragene Abwesenheiten führen
 * dazu, dass der Spieler für Events in diesem Zeitraum als „Fehlt“ vorbelegt wird.
 */
export function unavailabilityReason(player: Player, absences: readonly Absence[], date: string): string | null {
  if (!date) return null;
  if (player.status === 'Verletzt' && player.injuryUntil && date <= player.injuryUntil) {
    return `Verletzt (ca. bis ${formatDate(player.injuryUntil)})`;
  }
  if (isOpenInjury(player) && player.injuredSince && date >= player.injuredSince) return OPEN_INJURY_REASON;
  const absence = activeAbsenceOn(absences, date);
  if (!absence) return null;
  return `${absenceTitle(absence)} (${absence.to ? `bis ${formatDate(absence.to)}` : 'Ende offen'})`;
}

export type EffectiveStatus = Player['status'] | 'Gesperrt' | 'Abwesend';

/** Anzeige-Status: eine heute laufende Abwesenheit überlagert den manuell gesetzten Status. */
export function effectiveStatus(player: Player, absences: readonly Absence[], today: string): EffectiveStatus {
  const absence = activeAbsenceOn(absences, today);
  if (!absence) return player.status;
  if (isInjuryAbsence(absence)) return 'Verletzt';
  return absence.label.trim().toLowerCase().startsWith('sperre') ? 'Gesperrt' : 'Abwesend';
}

function hasRatingData(rating: Rating): boolean {
  return (
    rating.effort !== null || rating.technique !== null || rating.tactics !== null || rating.comprehension !== null ||
    rating.minutes !== null || rating.goals !== null || rating.assists !== null || rating.note !== ''
  );
}

/**
 * Setzt einen Spieler bei einer Abwesenheit/Verletzung automatisch auf „Fehlt“ und nimmt das wieder zurück,
 * wenn die Abwesenheit gelöscht oder verkürzt wird (SCRUM-18).
 * - Vorwärts: überschreibt nur Bewertungen, die noch komplett unbearbeitet sind („Offen“ ohne jede weitere
 *   Eingabe). Eine manuell gesetzte Anwesenheit sowie Teilnoten/Notizen bleiben unangetastet.
 * - Rückwärts: nur Einträge mit `autoAbsence`-Markierung. Die Markierung fällt weg, sobald jemand die Bewertung
 *   von Hand ändert; dann bleibt sie immer stehen.
 * Rückgabe: die neue Bewertung oder `null`, wenn sich nichts ändert.
 */
export function autoAbsenceRating(existing: Rating | null, reason: string | null): Rating | null {
  if (existing?.autoAbsence) {
    if (reason && existing.note === reason) return null;
    return reason ? { ...existing, note: reason } : { ...BLANK_RATING };
  }
  if (existing && existing.attendance !== 'open') return null;
  if (existing && hasRatingData(existing)) return null;
  if (!reason) return null;
  return { ...BLANK_RATING, attendance: 'absent', note: reason, autoAbsence: true };
}

/**
 * Der Status „Verletzt“ ohne Datum wird zurückgenommen: Vergangene Termine bleiben „Fehlt“ (der Spieler war ja
 * verletzt). Dazu verliert der automatisch gesetzte Eintrag seine Markierung und gilt ab dann wie von Hand gesetzt.
 * Rückgabe: die neue Bewertung oder `null`, wenn es nichts festzuhalten gibt.
 */
export function keepPastOpenInjury(existing: Rating | null): Rating | null {
  if (!existing?.autoAbsence || existing.note !== OPEN_INJURY_REASON) return null;
  return { ...existing, autoAbsence: false };
}
