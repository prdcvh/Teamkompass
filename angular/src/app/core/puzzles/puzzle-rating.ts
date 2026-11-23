/**
 * Rätsel-Wertung ähnlich Elo und Auswertung für den Trainer (SCRUM-193). Reine Funktionen: die Wertung wird nie
 * gespeichert, sondern immer aus den Antworten berechnet (siehe puzzle.ts).
 */
import {
  type Puzzle,
  type PuzzleAnswer,
  type PuzzleSolution,
  K_FACTOR,
  MIN_ANSWERS_FOR_INSIGHT,
  START_RATING,
  UNDERSTOOD_SHARE,
  levelRating,
} from './puzzle';

// ---------------------------------------------------------------------------------------------------------------
// Wertung (ähnlich Elo)
// ---------------------------------------------------------------------------------------------------------------

/** Erwartete Trefferchance des Spielers gegen ein Rätsel dieser Stärke (0–1), wie bei Elo. */
export function expectedScore(playerRating: number, puzzleRating: number): number {
  return 1 / (1 + 10 ** ((puzzleRating - playerRating) / 400));
}

/**
 * Änderung der Wertung nach einem Rätsel (ganze Zahl): K × (Ergebnis − Erwartung). Richtig bei einem schweren Rätsel
 * bringt mehr als richtig bei einem leichten; falsch bei einem leichten kostet mehr als falsch bei einem schweren.
 */
export function ratingDelta(playerRating: number, puzzleRating: number, solved: boolean): number {
  return Math.round(K_FACTOR * ((solved ? 1 : 0) - expectedScore(playerRating, puzzleRating)));
}

export interface RatingStep {
  readonly puzzle: Puzzle;
  readonly choice: number;
  readonly solved: boolean;
  readonly before: number;
  readonly delta: number;
  readonly after: number;
  readonly answeredAt: number;
}

export interface RatingHistory {
  /** Aktuelle Wertung (Start {@link START_RATING}). */
  readonly rating: number;
  /** Ausgewertete Rätsel in zeitlicher Reihenfolge. */
  readonly steps: readonly RatingStep[];
  readonly solved: number;
}

/**
 * Wertung eines Spielers aus seinen Antworten, in zeitlicher Reihenfolge. Antworten auf gelöschte Rätsel, ohne bekannte
 * Lösung oder mit einer Wahl, die es (nach einer Änderung) nicht mehr gibt, zählen nicht.
 */
export function ratingHistory(
  answers: readonly PuzzleAnswer[],
  puzzles: ReadonlyMap<string, Puzzle>,
  solutions: ReadonlyMap<string, PuzzleSolution>,
): RatingHistory {
  let rating = START_RATING;
  const steps: RatingStep[] = [];
  const ordered = [...answers].sort((a, b) => a.answeredAt - b.answeredAt || a.puzzleId.localeCompare(b.puzzleId));
  const seen = new Set<string>();
  for (const answer of ordered) {
    const puzzle = puzzles.get(answer.puzzleId);
    const solution = solutions.get(answer.puzzleId);
    if (!puzzle || !solution || seen.has(answer.puzzleId) || answer.choice >= puzzle.answers.length || solution.correct >= puzzle.answers.length) continue;
    seen.add(answer.puzzleId);
    const solved = answer.choice === solution.correct;
    const delta = ratingDelta(rating, levelRating(puzzle.level), solved);
    steps.push({ puzzle, choice: answer.choice, solved, before: rating, delta, after: rating + delta, answeredAt: answer.answeredAt });
    rating += delta;
  }
  return { rating, steps, solved: steps.filter((step) => step.solved).length };
}

/** „+12“, „−8“, „±0“. */
export function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '±0';
}

// ---------------------------------------------------------------------------------------------------------------
// Auswertung für den Trainer
// ---------------------------------------------------------------------------------------------------------------

export interface PuzzleInsight {
  readonly puzzle: Puzzle;
  readonly solution: PuzzleSolution | null;
  readonly total: number;
  readonly correct: number;
  /** Anteil richtiger Antworten (0–1); null ohne Antworten oder Lösung. */
  readonly share: number | null;
  /** Wie oft jede Antwort gewählt wurde (gleiche Reihenfolge wie die Antworten). */
  readonly counts: readonly number[];
  /** Häufigste falsche Antwort (Index) oder null. */
  readonly commonMistake: number | null;
  /** Genug Antworten und weniger als die Hälfte richtig: das Team versteht die Situation noch nicht. */
  readonly notUnderstood: boolean;
}

export function puzzleInsight(puzzle: Puzzle, solution: PuzzleSolution | null, answers: readonly PuzzleAnswer[]): PuzzleInsight {
  const counts = puzzle.answers.map(() => 0);
  const seen = new Set<string>();
  for (const answer of answers) {
    if (answer.puzzleId !== puzzle.id || seen.has(answer.playerId) || answer.choice >= counts.length) continue;
    seen.add(answer.playerId);
    counts[answer.choice] += 1;
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  const valid = solution !== null && solution.correct < counts.length;
  const correct = valid ? counts[solution.correct] : 0;
  const share = valid && total > 0 ? correct / total : null;
  let commonMistake: number | null = null;
  if (valid) {
    counts.forEach((count, index) => {
      if (index !== solution.correct && count > 0 && (commonMistake === null || count > counts[commonMistake])) commonMistake = index;
    });
  }
  return { puzzle, solution, total, correct, share, counts, commonMistake, notUnderstood: share !== null && total >= MIN_ANSWERS_FOR_INSIGHT && share < UNDERSTOOD_SHARE };
}

/** Alle Rätsel mit Auswertung; noch nicht verstandene zuerst (schlechteste Quote vorn), dann der Rest wie sortiert. */
export function teamInsights(
  puzzles: readonly Puzzle[],
  solutions: ReadonlyMap<string, PuzzleSolution>,
  answers: readonly PuzzleAnswer[],
): PuzzleInsight[] {
  const insights = puzzles.map((puzzle) => puzzleInsight(puzzle, solutions.get(puzzle.id) ?? null, answers));
  const open = insights.filter((entry) => entry.notUnderstood).sort((a, b) => (a.share ?? 0) - (b.share ?? 0));
  return [...open, ...insights.filter((entry) => !entry.notUnderstood)];
}

export function percent(share: number | null): string {
  return share === null ? '–' : `${Math.round(share * 100)} %`;
}
