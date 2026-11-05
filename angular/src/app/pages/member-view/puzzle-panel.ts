import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import type { Player } from '../../core/player/player';
import { type Puzzle, formatSeconds, levelLabel, videoLinkAt } from '../../core/puzzles/puzzle';
import { deltaLabel } from '../../core/puzzles/puzzle-rating';
import { PuzzleService } from '../../core/puzzles/puzzle.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';

/**
 * Situationsrätsel in der Ansicht von Spieler und Eltern (SCRUM-193): das nächste offene Rätsel, nach der Antwort sofort
 * die Erklärung und die Änderung der eigenen Rätsel-Wertung, darunter die erledigten Rätsel. Die Wertung sehen nur der
 * Spieler selbst, seine Eltern und der Trainer – es gibt keine Rangliste. Eltern lesen nur mit; antworten kann nur der
 * Spieler mit seinem eigenen Zugang. Ohne Rätsel (oder solange die Regeln sie noch nicht kennen) bleibt der Bereich leer.
 */
@Component({
  selector: 'tk-puzzle-panel',
  imports: [Button, Card, Chip],
  templateUrl: './puzzle-panel.html',
  styleUrl: './puzzle-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuzzlePanel {
  protected readonly puzzles = inject(PuzzleService);
  private readonly role = inject(SessionService).role;

  readonly player = input.required<Player>();

  protected readonly levelLabel = levelLabel;
  protected readonly deltaLabel = deltaLabel;
  protected readonly formatSeconds = formatSeconds;
  protected readonly videoLinkAt = videoLinkAt;
  private readonly allowed = computed(() => this.role() === 'player' || this.role() === 'parent');
  protected readonly parent = computed(() => this.role() === 'parent');
  protected readonly ready = computed(() => this.allowed() && this.puzzles.load() === 'ready' && this.puzzles.puzzles().length > 0);

  /** Gerade beantwortetes Rätsel, dessen Erklärung angezeigt wird (bis „Nächstes Rätsel“). */
  protected readonly revealed = signal<string | null>(null);
  /** Aufgeklappte Erklärung in der Liste der erledigten Rätsel. */
  protected readonly opened = signal<string | null>(null);

  protected readonly history = computed(() => this.puzzles.historyOf(this.player().id));
  private readonly answered = computed(() => new Set(this.puzzles.answersOf(this.player().id).map((answer) => answer.puzzleId)));
  protected readonly open = computed(() => this.puzzles.puzzles().filter((puzzle) => !this.answered().has(puzzle.id)));
  /** Erledigte Rätsel, neueste zuerst. */
  protected readonly done = computed(() => [...this.history().steps].reverse());

  /** Was gerade groß angezeigt wird: die Erklärung zum eben beantworteten Rätsel, sonst das nächste offene. */
  protected readonly current = computed<{ puzzle: Puzzle; answered: boolean } | null>(() => {
    const revealed = this.revealed();
    const map = this.puzzles.puzzleMap();
    if (revealed && map.has(revealed)) return { puzzle: map.get(revealed)!, answered: true };
    const next = this.open()[0];
    return next ? { puzzle: next, answered: false } : null;
  });

  constructor() {
    effect(() => {
      if (this.allowed()) untracked(() => this.puzzles.start());
    });
  }

  protected choose(puzzle: Puzzle, index: number): void {
    if (this.parent()) return;
    if (this.puzzles.answer(puzzle.id, index)) this.revealed.set(puzzle.id);
  }

  protected next(): void {
    this.revealed.set(null);
  }

  protected toggle(id: string): void {
    this.opened.update((current) => (current === id ? null : id));
  }

  protected choiceOf(puzzleId: string): number | null {
    return this.puzzles.answerFor(this.player().id, puzzleId)?.choice ?? null;
  }

  protected stepOf(puzzleId: string) {
    return this.history().steps.find((step) => step.puzzle.id === puzzleId) ?? null;
  }

  protected solutionOf(puzzleId: string) {
    return this.puzzles.solutions().get(puzzleId) ?? null;
  }

  /** Zustand einer Antwort-Schaltfläche nach dem Antworten: richtig, falsch gewählt oder neutral. */
  protected answerState(puzzleId: string, index: number): 'correct' | 'wrong' | null {
    const solution = this.solutionOf(puzzleId);
    if (!solution) return null;
    if (index === solution.correct) return 'correct';
    return this.choiceOf(puzzleId) === index ? 'wrong' : null;
  }
}
