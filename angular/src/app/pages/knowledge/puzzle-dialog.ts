import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  MAX_ANSWERS,
  MAX_PUZZLE_ANSWER,
  MAX_PUZZLE_EXPLANATION,
  MAX_PUZZLE_QUESTION,
  MAX_PUZZLE_TITLE,
  MIN_ANSWERS,
  PUZZLE_LEVELS,
  type Puzzle,
  type PuzzleDraft,
  type PuzzleErrors,
  type PuzzleLevel,
  type PuzzleMedia,
  draftFromPuzzle,
  emptyPuzzleDraft,
} from '../../core/puzzles/puzzle';
import { PuzzleService } from '../../core/puzzles/puzzle.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Situationsrätsel (SCRUM-193) anlegen oder ändern: Szene (Bild oder Video mit Zeitmarke), Frage, 2–4 Antworten, Erklärung. */
@Component({
  selector: 'tk-puzzle-dialog',
  imports: [Dialog, Button],
  templateUrl: './puzzle-dialog.html',
  styleUrls: ['./entry-dialog.css', './puzzle-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuzzleDialog {
  private readonly puzzles = inject(PuzzleService);

  readonly open = input(false);
  /** Zu bearbeitendes Rätsel; leer = neues Rätsel. */
  readonly puzzle = input<Puzzle | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<Puzzle>();

  protected readonly limits = { title: MAX_PUZZLE_TITLE, question: MAX_PUZZLE_QUESTION, answer: MAX_PUZZLE_ANSWER, explanation: MAX_PUZZLE_EXPLANATION, min: MIN_ANSWERS, max: MAX_ANSWERS };
  protected readonly levels = PUZZLE_LEVELS;
  protected readonly draft = signal<PuzzleDraft>(emptyPuzzleDraft());
  protected readonly errors = signal<PuzzleErrors>({});
  protected readonly editing = computed(() => this.puzzle() !== null);
  protected readonly heading = computed(() => (this.editing() ? 'Rätsel bearbeiten' : 'Rätsel anlegen'));
  /** Schon gegebene Antworten auf dieses Rätsel (Hinweis: Änderungen wirken auf die Wertungen). */
  protected readonly answered = computed(() => {
    const puzzle = this.puzzle();
    return puzzle ? this.puzzles.answers().filter((answer) => answer.puzzleId === puzzle.id).length : 0;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const puzzle = this.puzzle();
      untracked(() => {
        this.draft.set(puzzle ? draftFromPuzzle(puzzle, this.puzzles.solutions().get(puzzle.id) ?? null) : emptyPuzzleDraft());
        this.errors.set({});
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected patch(change: Partial<PuzzleDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected setMedia(media: PuzzleMedia): void {
    this.patch({ media });
  }

  protected setLevel(event: Event): void {
    this.patch({ level: Number(this.value(event)) as PuzzleLevel });
  }

  protected setAnswer(index: number, text: string): void {
    this.draft.update((draft) => ({ ...draft, answers: draft.answers.map((answer, i) => (i === index ? text : answer)) }));
  }

  protected addAnswer(): void {
    if (this.draft().answers.length >= MAX_ANSWERS) return;
    this.draft.update((draft) => ({ ...draft, answers: [...draft.answers, ''] }));
  }

  protected removeAnswer(index: number): void {
    this.draft.update((draft) => {
      if (draft.answers.length <= MIN_ANSWERS) return draft;
      const correct = index === draft.correct ? 0 : index < draft.correct ? draft.correct - 1 : draft.correct;
      return { ...draft, answers: draft.answers.filter((_, i) => i !== index), correct };
    });
    this.errors.set({});
  }

  protected answerError(index: number): string {
    return this.errors().answer?.[index] ?? '';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.puzzles.savePuzzle(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const puzzle = this.puzzle();
    if (puzzle) this.deleteRequested.emit(puzzle);
  }
}
