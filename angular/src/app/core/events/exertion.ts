/**
 * Anstrengung (0–10) und Dauer eines Termins (SCRUM-137). Die Belastung eines Termins ist Minuten × Anstrengung.
 */
import type { TeamEvent } from './event';

/** Dauer, wenn nichts eingetragen ist: Training 90 Minuten, Spiel 90 Minuten Spieldauer. */
const DEFAULT_MINUTES = 90;

/** Anstrengung 0–10 mit Worten (angelehnt an die Borg-CR10-Skala). Belastung eines Termins = Minuten × Anstrengung. */
const EXERTION_WORDS = ['Ruhe', 'sehr leicht', 'leicht', 'mittel', 'etwas schwer', 'schwer', 'ziemlich schwer', 'sehr schwer', 'sehr, sehr schwer', 'fast maximal', 'maximal'] as const;
export const EXERTIONS: readonly { value: number; label: string }[] = EXERTION_WORDS.map((word, value) => ({ value, label: `${value} · ${word}` }));
export const DEFAULT_EXERTION = 5;
/** Dauer eines Trainings, wenn nichts eingetragen ist (SCRUM-137). */
export const DEFAULT_TRAINING_DURATION = DEFAULT_MINUTES;

/** Bisherige Termine kennen nur die Intensität 1/2/3; sie wird als 3/5/7 gelesen (keine Migration nötig). */
const LEGACY_INTENSITY_EXERTION: Readonly<Record<number, number>> = { 1: 3, 2: 5, 3: 7 };

export function exertionFromLegacyIntensity(intensity: unknown): number {
  return LEGACY_INTENSITY_EXERTION[Number(intensity)] ?? DEFAULT_EXERTION;
}

/** Das alte Feld `intensity` (1–3) wird beim Speichern passend mitgeführt, damit ältere Stände lesbar bleiben. */
export function legacyIntensityForExertion(exertion: number): number {
  return exertion <= 4 ? 1 : exertion <= 6 ? 2 : 3;
}

export function exertionLabel(exertion: number): string {
  return EXERTIONS[Math.min(10, Math.max(0, Math.round(exertion)))].label;
}

/** Geplante Dauer in Minuten: Spiele nutzen die Spieldauer, Trainings die eingetragene Dauer (Standard 90). */
export function plannedMinutes(event: Pick<TeamEvent, 'type' | 'matchDuration' | 'durationMinutes'>): number {
  if (event.type === 'Spiel') return event.matchDuration && event.matchDuration > 0 ? event.matchDuration : DEFAULT_MINUTES;
  return event.durationMinutes && event.durationMinutes > 0 ? event.durationMinutes : DEFAULT_TRAINING_DURATION;
}
