/**
 * Spielerbewertung je Event: Modell, Gesamtnote und die reine Logik für Änderungen und Fortschritt.
 * Das Dokument `teams/{teamId}/events/{eventId}/ratings/{playerId}` ist mit der bisherigen App
 * identisch (siehe outputs/team-manager/app.js: normalizeRating, calculatedGrade, updateRating).
 * Noten sind Schulnoten: 1 = sehr gut … 6 = ungenügend; kleiner ist besser.
 */

export const ATTENDANCES = ['open', 'present', 'limited', 'absent', 'excluded'] as const;
export type Attendance = (typeof ATTENDANCES)[number];

export const ATTENDANCE_LABELS: Readonly<Record<Attendance, string>> = {
  open: 'Offen',
  present: 'Anwesend',
  limited: 'Teilweise',
  absent: 'Fehlt',
  excluded: 'Nicht im Kader',
};

/** Die vier Teilnoten in der Reihenfolge der Bewertungsmatrix. */
export const GRADE_FIELDS = ['effort', 'technique', 'tactics', 'comprehension'] as const;
export type GradeField = (typeof GRADE_FIELDS)[number];

export const GRADE_LABELS: Readonly<Record<GradeField, string>> = {
  effort: 'Einsatz',
  technique: 'Fehlerquote',
  tactics: 'Entscheidungsfindung',
  comprehension: 'Lernfähigkeit',
};

/**
 * Gewichtung der Gesamtnote: keine Teilnote darf allein dominieren. Einsatz und Fehlerquote bleiben mit
 * 30 % die stärksten Faktoren, Entscheidungsfindung ist mit 25 % nahezu gleichwertig und Lernfähigkeit
 * bekommt mit 15 % ein Gewicht, das sie tatsächlich beeinflussen kann (gleiche Werte wie die bisherige App).
 */
export const GRADE_WEIGHTS: Readonly<Record<GradeField, number>> = { effort: 0.3, technique: 0.3, tactics: 0.25, comprehension: 0.15 };

export const MIN_GRADE = 1;
export const MAX_GRADE = 6;
export const MAX_GOALS_OR_ASSISTS = 20;
export const MAX_NOTE_LENGTH = 1000;

export type CountField = 'minutes' | 'goals' | 'assists';
export type RatingField = 'attendance' | GradeField | CountField | 'note';

export interface Rating {
  readonly attendance: Attendance;
  readonly effort: number | null;
  readonly technique: number | null;
  readonly tactics: number | null;
  readonly comprehension: number | null;
  readonly minutes: number | null;
  readonly goals: number | null;
  readonly assists: number | null;
  /** Rückmeldung, die Spieler und Eltern in ihrem Profil sehen. */
  readonly note: string;
  /** Von der Abwesenheits-Automatik gesetzt und seither nicht angefasst. Eine Handänderung nimmt die Markierung weg. */
  readonly autoAbsence: boolean;
}

export const BLANK_RATING: Rating = {
  attendance: 'open',
  effort: null,
  technique: null,
  tactics: null,
  comprehension: null,
  minutes: null,
  goals: null,
  assists: null,
  note: '',
  autoAbsence: false,
};

export function roundGrade(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Gesamtnote; null bei fehlender Teilnote sowie bei „Fehlt“ und „Nicht im Kader“. */
export function calculatedGrade(rating: Rating): number | null {
  if (rating.attendance === 'absent' || rating.attendance === 'excluded') return null;
  let sum = 0;
  for (const field of GRADE_FIELDS) {
    const grade = rating[field];
    if (grade === null) return null;
    sum += grade * GRADE_WEIGHTS[field];
  }
  return roundGrade(sum);
}

/** „2,3“; ohne Note „–“. */
export function gradeLabel(grade: number | null): string {
  return grade === null ? '–' : grade.toFixed(1).replace('.', ',');
}

function gradeValue(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= MIN_GRADE && number <= MAX_GRADE ? number : null;
}

function count(value: unknown, max: number): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.round(number), max) : null;
}

/** Dokument → Bewertung; ältere Dokumente mit nur einer Gesamtnote füllen alle vier Teilnoten damit. */
export function ratingFromDoc(data: Readonly<Record<string, unknown>> | undefined): Rating {
  if (!data) return BLANK_RATING;
  const fallback = gradeValue(data['grade']);
  const grade = (field: GradeField) => gradeValue(data[field]) ?? fallback;
  const attendance = ATTENDANCES.find((value) => value === data['attendance']) ?? 'open';
  return {
    attendance,
    effort: grade('effort'),
    technique: grade('technique'),
    tactics: grade('tactics'),
    comprehension: grade('comprehension'),
    minutes: count(data['minutes'], 999),
    goals: count(data['goals'], MAX_GOALS_OR_ASSISTS),
    assists: count(data['assists'], MAX_GOALS_OR_ASSISTS),
    note: typeof data['note'] === 'string' ? data['note'] : '',
    autoAbsence: data['autoAbsence'] === true,
  };
}

/**
 * Bewertung → Dokumentfelder (gleiche Feldnamen und Leerwerte wie die bisherige App: '' statt null).
 * `autoAbsence` wird nur geschrieben, wenn es gesetzt ist oder gerade zurückgenommen wurde (`clearAuto`).
 */
export function docFromRating(rating: Rating, options: { clearAuto?: boolean } = {}): Record<string, unknown> {
  const grade = calculatedGrade(rating);
  const doc: Record<string, unknown> = {
    attendance: rating.attendance,
    grade: grade ?? '',
    effort: rating.effort ?? '',
    technique: rating.technique ?? '',
    tactics: rating.tactics ?? '',
    comprehension: rating.comprehension ?? '',
    minutes: rating.minutes ?? '',
    goals: rating.goals ?? '',
    assists: rating.assists ?? '',
    note: rating.note,
  };
  if (rating.autoAbsence) doc['autoAbsence'] = true;
  else if (options.clearAuto) doc['autoAbsence'] = false;
  return doc;
}

export interface RatingChange {
  readonly rating: Rating;
  /** Die Handänderung hat eine automatisch gesetzte Abwesenheit zur normalen gemacht. */
  readonly clearedAuto: boolean;
}

/**
 * Wendet eine Eingabe auf eine Bewertung an (wie `updateRating` der bisherigen App):
 * - Teilnoten und Zahlen kommen als Text aus dem Formular; leer = nicht erfasst.
 * - Minuten sind auf 0 bis Spieldauer begrenzt, Tore/Vorlagen auf 0 bis 20.
 * - „Fehlt“ und „Nicht im Kader“ löschen Noten, Minuten, Tore und Vorlagen.
 * - Eine Handänderung macht aus einer automatisch gesetzten Abwesenheit eine normale.
 */
export function applyChange(rating: Rating, field: RatingField, value: string, matchDuration: number): RatingChange {
  const clearedAuto = rating.autoAbsence;
  let next: Rating = { ...rating, autoAbsence: false };
  switch (field) {
    case 'attendance': {
      const attendance = ATTENDANCES.find((entry) => entry === value);
      if (!attendance) return { rating, clearedAuto: false };
      next = { ...next, attendance };
      if (attendance === 'absent' || attendance === 'excluded') {
        next = { ...next, effort: null, technique: null, tactics: null, comprehension: null, minutes: null, goals: null, assists: null };
      }
      break;
    }
    case 'effort':
    case 'technique':
    case 'tactics':
    case 'comprehension':
      next = { ...next, [field]: gradeValue(value) };
      break;
    case 'minutes':
      next = { ...next, minutes: count(value, Math.max(0, matchDuration)) };
      break;
    case 'goals':
    case 'assists':
      next = { ...next, [field]: count(value, MAX_GOALS_OR_ASSISTS) };
      break;
    case 'note':
      next = { ...next, note: value.slice(0, MAX_NOTE_LENGTH) };
      break;
  }
  return { rating: next, clearedAuto };
}

export type RatingView = 'all' | 'present' | 'missing';
export const RATING_VIEWS: readonly { readonly key: RatingView; readonly label: string }[] = [
  { key: 'all', label: 'Alle Spieler' },
  { key: 'present', label: 'Nur anwesend' },
  { key: 'missing', label: 'Nur fehlend' },
];

/** Filter der Bewertungsansicht („fehlend“ umfasst auch noch offene Spieler, wie in der bisherigen App). */
export function matchesView(rating: Rating, view: RatingView): boolean {
  if (view === 'present') return rating.attendance === 'present' || rating.attendance === 'limited';
  if (view === 'missing') return rating.attendance === 'absent' || rating.attendance === 'excluded' || rating.attendance === 'open';
  return true;
}

/** Erfasst ist, wer eine Gesamtnote hat oder bewusst als fehlend bzw. nicht im Kader markiert wurde. */
export function isRated(rating: Rating): boolean {
  return calculatedGrade(rating) !== null || rating.attendance === 'absent' || rating.attendance === 'excluded';
}

export function progress(ratings: readonly Rating[]): { done: number; total: number; share: number } {
  const done = ratings.filter(isRated).length;
  const total = ratings.length;
  return { done, total, share: total ? Math.round((done / total) * 100) : 0 };
}
