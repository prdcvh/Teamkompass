/**
 * Stimmigkeitsprüfung einer Spielbewertung (SCRUM-395): Die Summe der Einsatzminuten soll Spieldauer × 11 ergeben,
 * die Summe der Tore soll der Summe der Vorlagen entsprechen. Es wird nur geprüft und die Differenz benannt;
 * nichts wird korrigiert und nichts blockiert das Speichern. Reine Funktionen ohne Angular.
 */
import type { Rating } from './rating';

/** Spieler pro Mannschaft auf dem Feld (Elfer-Fußball), Grundlage für das Minuten-Soll. */
export const PLAYERS_ON_PITCH = 11;

/**
 * - `unrecorded`: noch nichts eingetragen (kein Fehler, kein „0“)
 * - `ok`: stimmt überein
 * - `short`: es fehlt etwas (Minuten fehlen / Vorlagen fehlen)
 * - `over`: es ist etwas zu viel (Minuten zu viel) bzw. es gibt mehr Vorlagen als Tore
 */
export type ConsistencyStatus = 'unrecorded' | 'ok' | 'short' | 'over';

export interface MinutesCheck {
  readonly status: ConsistencyStatus;
  /** Spieldauer × 11. */
  readonly expected: number;
  /** Summe der eingetragenen Spielerminuten. */
  readonly actual: number;
  /** actual − expected: negativ = es fehlen Minuten, positiv = zu viele. */
  readonly delta: number;
  readonly message: string;
}

export interface GoalsCheck {
  readonly status: ConsistencyStatus;
  readonly goals: number;
  readonly assists: number;
  /** assists − goals: negativ = es fehlen Vorlagen, positiv = mehr Vorlagen als Tore. */
  readonly delta: number;
  readonly message: string;
}

export interface MatchConsistency {
  readonly minutes: MinutesCheck;
  readonly goals: GoalsCheck;
  /** Mindestens eine Abweichung (Warnung) vorhanden. */
  readonly hasWarning: boolean;
  /** Beide Prüfungen sind erfasst und stimmen: ruhiger „passt“-Hinweis. */
  readonly allOk: boolean;
  /** Es wurde noch nichts eingetragen: die Anzeige bleibt weg. */
  readonly nothingEntered: boolean;
}

type Counts = Pick<Rating, 'minutes' | 'goals' | 'assists'>;

function sum(values: readonly (number | null | undefined)[]): { total: number; any: boolean } {
  let total = 0;
  let any = false;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    total += value;
    any = true;
  }
  return { total, any };
}

const unit = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function checkMinutes(ratings: readonly Counts[], matchDuration: number): MinutesCheck {
  const expected = matchDuration * PLAYERS_ON_PITCH;
  const { total, any } = sum(ratings.map((rating) => rating.minutes));
  if (!any) return { status: 'unrecorded', expected, actual: 0, delta: 0, message: 'Minuten noch nicht erfasst' };
  const delta = total - expected;
  if (delta === 0) return { status: 'ok', expected, actual: total, delta, message: `Minuten passen (${expected})` };
  const base = `Spieldauer ${matchDuration} × ${PLAYERS_ON_PITCH} = ${expected} Minuten, eingetragen ${total}`;
  const message = delta < 0 ? `Es ${delta === -1 ? 'fehlt' : 'fehlen'} ${unit(-delta, 'Minute', 'Minuten')}. ${base}.` : `${unit(delta, 'Minute', 'Minuten')} zu viel. ${base}.`;
  return { status: delta < 0 ? 'short' : 'over', expected, actual: total, delta, message };
}

export function checkGoalsAndAssists(ratings: readonly Counts[]): GoalsCheck {
  const goals = sum(ratings.map((rating) => rating.goals));
  const assists = sum(ratings.map((rating) => rating.assists));
  if (!goals.any && !assists.any) return { status: 'unrecorded', goals: 0, assists: 0, delta: 0, message: 'Tore und Vorlagen noch nicht erfasst' };
  const delta = assists.total - goals.total;
  const head = `${unit(goals.total, 'Tor', 'Tore')}, ${unit(assists.total, 'Vorlage', 'Vorlagen')}`;
  if (delta === 0) return { status: 'ok', goals: goals.total, assists: assists.total, delta, message: `Tore und Vorlagen passen (${head})` };
  const message = delta < 0 ? `${head}: ${unit(-delta, 'Vorlage', 'Vorlagen')} ${delta === -1 ? 'fehlt' : 'fehlen'}` : `${head}: ${unit(delta, 'Tor', 'Tore')} ${delta === 1 ? 'fehlt' : 'fehlen'}`;
  return { status: delta < 0 ? 'short' : 'over', goals: goals.total, assists: assists.total, delta, message };
}

/** Prüft ein Spiel; `ratings` sind die Bewertungen aller Spieler des Kaders (fehlende Bewertung = nichts eingetragen). */
export function checkMatchConsistency(ratings: readonly Counts[], matchDuration: number): MatchConsistency {
  const minutes = checkMinutes(ratings, matchDuration);
  const goals = checkGoalsAndAssists(ratings);
  const warning = (status: ConsistencyStatus) => status === 'short' || status === 'over';
  return {
    minutes,
    goals,
    hasWarning: warning(minutes.status) || warning(goals.status),
    allOk: minutes.status === 'ok' && goals.status === 'ok',
    nothingEntered: minutes.status === 'unrecorded' && goals.status === 'unrecorded',
  };
}
