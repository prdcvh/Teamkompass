/**
 * Gesundheitsgründe in Bewertungen (SCRUM-248): Die Automatik schreibt bei „Fehlt“ den Grund in die Rückmeldung
 * („Verletzt (ca. bis …)“, „Verletzung: Zerrung (bis …)“, „Abgesagt: krank“). Spieler und Eltern lesen diese Rückmeldung.
 * Bei widerrufener Einwilligung schreibt die Automatik deshalb nur noch einen neutralen Text; vorhandene Gründe entfernt
 * der Trainer nach Rückfrage über die Aufgabe „Gesundheitsdaten prüfen und löschen“ – nie automatisch.
 */
import type { Rating } from '../ratings/rating';

/** Rückmeldung der Abwesenheits-Automatik ohne Grund. */
export const NEUTRAL_ABSENCE_NOTE = 'Fehlt';
/** Rückmeldung einer Absage ohne Grund (wie `rsvpAbsenceNote` ohne Grund). */
export const NEUTRAL_RSVP_NOTE = 'Abgesagt';

const RSVP_REASON_PREFIX = `${NEUTRAL_RSVP_NOTE}: `;
/** Endung der Gründe aus `unavailabilityReason`: „(ca. bis TT.MM.JJJJ)“, „(bis TT.MM.JJJJ)“, „(Ende offen)“, „(bis auf Weiteres)“. */
const AUTO_REASON_END = /\((?:(?:ca\. )?bis \d{2}\.\d{2}\.\d{4}|Ende offen|bis auf Weiteres)\)$/;

/**
 * Die Bewertung ohne den automatisch eingetragenen Grund – oder null, wenn die Rückmeldung keinen solchen Grund enthält.
 * Erkannt werden von der Automatik markierte Einträge sowie „Fehlt“-Einträge, deren Rückmeldung genau wie ein
 * automatischer Grund aussieht (auch wenn die Bewertung später von Hand geändert wurde). Freitext des Trainers bleibt.
 * Anwesenheit und Markierungen bleiben unverändert; nur die Rückmeldung wird neutral.
 */
export function ratingWithoutReason(rating: Rating): Rating | null {
  const note = rating.note.trim();
  if (!note || note === NEUTRAL_ABSENCE_NOTE || note === NEUTRAL_RSVP_NOTE) return null;
  if (note.startsWith(RSVP_REASON_PREFIX) && (rating.rsvpAbsence || rating.attendance === 'absent')) {
    return { ...rating, note: NEUTRAL_RSVP_NOTE };
  }
  if (rating.autoAbsence || (rating.attendance === 'absent' && AUTO_REASON_END.test(note))) {
    return { ...rating, note: NEUTRAL_ABSENCE_NOTE };
  }
  return null;
}
