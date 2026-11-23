/**
 * Notenstufen (SCRUM-393): Beim Bewerten wählt der Trainer ein Schulnoten-Wort statt einer Zahl. Gespeichert und
 * gerechnet wird weiter mit der Zahl 1–6 (Feldnamen, Gewichtung und Durchschnitte bleiben unverändert); hier liegt die
 * eine, reine Zuordnung Zahl ↔ Wort und Durchschnitt → Wort.
 *
 * Bereichsgrenzen für einen Durchschnitt: auf die nächste ganze Note runden, ab .5 zur schlechteren Note
 * (1,0–1,49 sehr gut · 1,5–2,49 gut · 2,5–3,49 befriedigend · 3,5–4,49 ausreichend · 4,5–5,49 mangelhaft · ab 5,5 ungenügend).
 */

export interface GradeStep {
  /** Gespeicherte Note (1–6). */
  readonly value: number;
  /** Schulnoten-Wort. */
  readonly word: string;
}

export const GRADE_STEPS: readonly GradeStep[] = [
  { value: 1, word: 'sehr gut' },
  { value: 2, word: 'gut' },
  { value: 3, word: 'befriedigend' },
  { value: 4, word: 'ausreichend' },
  { value: 5, word: 'mangelhaft' },
  { value: 6, word: 'ungenügend' },
];

/** Wort zu einer ganzen Note 1–6; sonst null. */
export function gradeWord(value: number): string | null {
  return GRADE_STEPS.find((step) => step.value === value)?.word ?? null;
}

/** Stufe, in deren Notenbereich ein (auch gemittelter) Wert fällt; Werte außerhalb 1–6 werden an den Rand gelegt. */
export function stepForAverage(value: number): GradeStep {
  const index = Math.min(GRADE_STEPS.length, Math.max(1, Math.floor(value + 0.5))) - 1;
  return GRADE_STEPS[index];
}

/** „2,3“. */
export function gradeNumberText(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** „gut (2,3)“: Wort des Notenbereichs und in Klammern der Zahlendurchschnitt; ohne Wert „–“. */
export function gradeWithWord(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '–';
  // Wort und Zahl aus demselben auf eine Nachkommastelle gerundeten Wert, damit „sehr gut (1,5)“ nie vorkommt.
  const shown = Math.round(value * 10) / 10;
  return `${stepForAverage(shown).word} (${gradeNumberText(shown)})`;
}
