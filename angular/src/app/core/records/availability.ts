/**
 * Verfügbarkeit eines Spielers aus Status und Abwesenheiten: Grund der Nichtverfügbarkeit, Anzeige-Status und
 * die automatische „Fehlt“-Bewertung (wie outputs/team-manager/app.js: unavailabilityReason, applyAutoAbsence).
 */
import { formatDate } from '../dates';
import type { Player } from '../player/player';
import { BLANK_RATING, type Rating } from '../rating';
import { type Absence, absenceTitle, activeAbsenceOn, isInjuryAbsence } from './absence';

/**
 * Warum ist der Spieler an diesem Tag nicht verfügbar? Der Status „Verletzt“ mit „ca. verletzt bis“ und eingetragene
 * Abwesenheiten führen beide dazu, dass der Spieler für Events in diesem Zeitraum als „Fehlt“ vorbelegt wird.
 */
export function unavailabilityReason(player: Player, absences: readonly Absence[], date: string): string | null {
  if (!date) return null;
  if (player.status === 'Verletzt' && player.injuryUntil && date <= player.injuryUntil) {
    return `Verletzt (ca. bis ${formatDate(player.injuryUntil)})`;
  }
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
