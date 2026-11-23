/**
 * Serien („Streaks“) für Check-in und Lernpfad-Aufgaben (SCRUM-194). Reine Funktionen ohne Firebase und ohne Uhr
 * (die aktuelle Zeit wird übergeben), damit sie sich einfach testen lassen.
 *
 * Grundsätze (für Kinder: kein Druck):
 * - Es gibt nur die eigene Serie, nie eine Rangliste und nie einen Vergleich zwischen Spielern.
 * - Pausen schützen die Serie: Ein Termin oder eine Woche in einer Pause (Ferien, Winterpause usw. aus SCRUM-148) oder
 *   in einer eingetragenen Abwesenheit bzw. Verletzung zählt weder für noch gegen die Serie – sie bleibt stehen.
 * - Was noch offen ist (Frist läuft), reißt die Serie nie.
 *
 * Check-in-Serie: Der Check-in (SCRUM-138) gehört zu einem Termin, nicht zu einem Kalendertag. Darum zählt die Serie
 * „Termine in Folge, bei denen du deine Anstrengung angegeben hast“. Gefragt wird nur, wer beim Termin war
 * (anwesend/eingeschränkt); wer nicht da war, wird nicht gefragt und verliert deshalb nichts.
 *
 * Lern-Serie: Der Trainer bestätigt Stufen eines Lernpfads (SCRUM-192). Die Serie zählt Kalenderwochen (Montag bis
 * Sonntag) in Folge, in denen mindestens eine Stufe bestätigt wurde.
 *
 * Schulferien (SCRUM-186) braucht es hier nicht eigens: Das Bundesland steht nur in den Teameinstellungen (nur Trainer).
 * Ferien, in denen das Team pausiert, trägt der Trainer als Pause ein; ohne Termine gibt es ohnehin keinen Check-in,
 * der fehlen könnte.
 */
import type { TeamEvent } from '../events/event';
import { type PlanningBreak, isInBreak } from '../planning/breaks';
import type { EventRating } from '../profile/profile';
import { type Absence, absenceCoversDate } from '../records/absence';
import { reportWindow } from '../self-report/self-report';
import { addDays, isIsoDate, todayIso } from '../shared/dates';

/** Alles, was die Serie schützt: Pausen des Teams und Abwesenheiten/Verletzungen des Spielers. */
export interface StreakPauses {
  readonly breaks: readonly Pick<PlanningBreak, 'startDate' | 'endDate'>[];
  readonly absences: readonly Absence[];
}

export const NO_PAUSES: StreakPauses = { breaks: [], absences: [] };

/** Ist der Tag durch eine Pause oder Abwesenheit (auch eine Verletzung ohne Enddatum) geschützt? */
export function isPauseDay(date: string, pauses: StreakPauses): boolean {
  return isInBreak(date, pauses.breaks) || pauses.absences.some((absence) => absenceCoversDate(absence, date));
}

export type CheckInState =
  /** Angegeben und gezählt. */
  | 'answered'
  /** Frist vorbei, nichts angegeben: beendet die Serie. */
  | 'missed'
  /** Pause/Abwesenheit: zählt weder dafür noch dagegen. */
  | 'pause'
  /** Frist läuft noch (oder Termin liegt in der Zukunft): offen, reißt nichts. */
  | 'open'
  /** Spieler war nicht dabei bzw. wurde nicht eingetragen: wird nicht gefragt. */
  | 'not-asked';

const tookPart = (item: EventRating) => item.rating?.attendance === 'present' || item.rating?.attendance === 'limited';

/** Wie zählt dieser Termin für die Check-in-Serie? */
export function checkInState(item: EventRating, answered: ReadonlySet<string>, pauses: StreakPauses, now: Date): CheckInState {
  if (isPauseDay(item.event.date, pauses)) return 'pause';
  if (!tookPart(item)) return 'not-asked';
  if (answered.has(item.event.id)) return 'answered';
  const window = reportWindow(item.event);
  // Kein berechenbares Fristende: lieber offen lassen als eine Serie zu Unrecht zu beenden.
  return window && now >= window.closes ? 'missed' : 'open';
}

export interface StreakResult {
  /** Aktuelle Serie. */
  readonly current: number;
  /** Längste Serie bisher. */
  readonly best: number;
  /** Der heutige Tag liegt in einer Pause oder Abwesenheit: die Serie ruht. */
  readonly pausedToday: boolean;
}

const byDate = (a: TeamEvent, b: TeamEvent) =>
  a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id);

/**
 * Check-in-Serie: Termine in Folge mit Check-in. `answered` sind die Event-IDs, zu denen der Spieler seine Anstrengung
 * angegeben hat. Pausen und nicht gefragte Termine werden übersprungen, offene Termine reißen die Serie nicht.
 */
export function checkInStreak(items: readonly EventRating[], answered: ReadonlySet<string>, pauses: StreakPauses, now: Date): StreakResult {
  let current = 0;
  let best = 0;
  for (const item of [...items].sort((a, b) => byDate(a.event, b.event))) {
    const state = checkInState(item, answered, pauses, now);
    if (state === 'answered') {
      current += 1;
      best = Math.max(best, current);
    } else if (state === 'missed') current = 0;
  }
  return { current, best, pausedToday: isPauseDay(todayIso(now), pauses) };
}

/** Montag der Woche, in der der Tag liegt (ISO-Datum). */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sonntag
  return addDays(date, -((day + 6) % 7));
}

/** Ist die ganze Woche (Mo–So) durch Pausen geschützt? */
function weekIsPause(monday: string, pauses: StreakPauses): boolean {
  return Array.from({ length: 7 }, (_, offset) => addDays(monday, offset)).every((day) => isPauseDay(day, pauses));
}

/** Längste Rückschau: 10 Jahre. Schützt vor einer Endlosschleife bei einer offenen Verletzung. */
const MAX_WEEKS = 520;

/**
 * Lern-Serie: Wochen in Folge mit mindestens einer vom Trainer bestätigten Stufe. `confirmedDates` sind die
 * Bestätigungsdaten (JJJJ-MM-TT). Eine Woche, die ganz in einer Pause liegt, wird übersprungen; die laufende Woche
 * reißt nie. Ist nichts mehr zu tun (alle Stufen geschafft, `nothingToDo`), bleibt die Serie ab der letzten
 * Bestätigung stehen, statt zu reißen.
 */
export function learningStreak(confirmedDates: readonly string[], pauses: StreakPauses, today: string, nothingToDo = false): StreakResult {
  const weeks = new Set(confirmedDates.filter(isIsoDate).map(weekStart));
  const pausedToday = isPauseDay(today, pauses);
  if (weeks.size === 0) return { current: 0, best: 0, pausedToday };

  const sorted = [...weeks].sort();
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const thisWeek = weekStart(today);
  let current = 0;
  let best = 0;
  let run = 0;
  let counting = true; // läuft noch die Serie bis „jetzt“?
  let week = nothingToDo && latest < thisWeek ? latest : thisWeek;
  for (let steps = 0; steps < MAX_WEEKS && week >= first; steps += 1, week = addDays(week, -7)) {
    if (weekIsPause(week, pauses)) continue;
    if (weeks.has(week)) {
      run += 1;
      best = Math.max(best, run);
      if (counting) current = run;
    } else if (week !== thisWeek) {
      run = 0;
      counting = false;
    }
  }
  return { current, best, pausedToday };
}

// ---------------------------------------------------------------------------------------------------------------
// Teamziel
// ---------------------------------------------------------------------------------------------------------------

export const MAX_CHECK_IN_GOAL = 10000;

export function isCheckInGoal(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_CHECK_IN_GOAL;
}

/** Zielwert aus dem Dokument `meta/settings`; null = kein Ziel gesetzt (oder unbrauchbar). */
export function checkInGoalFromDoc(doc: Readonly<Record<string, unknown>> | null): number | null {
  const raw = doc?.['checkInGoal'];
  return isCheckInGoal(raw) ? raw : null;
}

export function docFromCheckInGoal(goal: number | null): Record<string, unknown> {
  return { checkInGoal: goal };
}

export interface TeamGoalProgress {
  readonly count: number;
  readonly goal: number | null;
  /** 0–100, null ohne Ziel. */
  readonly percent: number | null;
  readonly reached: boolean;
}

/**
 * Teamziel „X Check-ins im Monat“: zählt alle Check-ins der Mannschaft zu Terminen im Monat (`month` = JJJJ-MM).
 * Es wird nur gezählt, nie nach Spielern aufgeschlüsselt oder verglichen.
 */
export function teamGoalProgress(checkInDates: readonly string[], month: string, goal: number | null): TeamGoalProgress {
  const count = checkInDates.filter((date) => date.startsWith(`${month}-`)).length;
  const percent = goal === null ? null : Math.min(100, Math.round((count / goal) * 100));
  return { count, goal, percent, reached: goal !== null && count >= goal };
}
