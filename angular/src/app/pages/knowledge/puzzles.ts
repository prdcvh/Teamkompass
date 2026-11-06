import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SquadService } from '../../core/player/squad.service';
import { type Puzzle, MIN_ANSWERS_FOR_INSIGHT, formatSeconds, levelLabel } from '../../core/puzzles/puzzle';
import { type PuzzleInsight, percent } from '../../core/puzzles/puzzle-rating';
import { PuzzleService } from '../../core/puzzles/puzzle.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';
import { Dialog } from '../../ui/dialog/dialog';
import { PuzzleDialog } from './puzzle-dialog';

/**
 * Situationsrätsel im Tab „Wissen“ (SCRUM-193, nur Trainer): Rätsel anlegen, sehen, welche Situationen das Team noch nicht
 * versteht, und die Rätsel-Wertung je Spieler. Die Wertungen stehen nach Rückennummer, nicht nach Höhe – es ist keine
 * Rangliste, und Spieler sehen nur ihre eigene.
 */
@Component({
  selector: 'tk-puzzles',
  imports: [Button, Card, Chip, Dialog, PuzzleDialog],
  templateUrl: './puzzles.html',
  styleUrl: './puzzles.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Puzzles implements OnInit {
  protected readonly puzzles = inject(PuzzleService);
  private readonly squad = inject(SquadService);

  protected readonly levelLabel = levelLabel;
  protected readonly percent = percent;
  protected readonly formatSeconds = formatSeconds;
  protected readonly minAnswers = MIN_ANSWERS_FOR_INSIGHT;

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Puzzle | null>(null);
  protected readonly deleting = signal<Puzzle | null>(null);
  protected readonly ratingsOpen = signal(false);

  protected readonly insights = computed(() => this.puzzles.insights());
  protected readonly notUnderstood = computed(() => this.insights().filter((entry) => entry.notUnderstood));
  /** Wertung je Spieler, nach Rückennummer (bewusst nicht nach Höhe sortiert). */
  protected readonly ratings = computed(() =>
    [...this.squad.players()]
      .sort((a, b) => a.number - b.number)
      .map((player) => ({ player, history: this.puzzles.historyOf(player.id) })),
  );

  ngOnInit(): void {
    this.puzzles.start();
    this.squad.start();
  }

  protected bar(insight: PuzzleInsight, index: number): number {
    return insight.total === 0 ? 0 : Math.round((insight.counts[index] / insight.total) * 100);
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(puzzle: Puzzle): void {
    this.editing.set(puzzle);
    this.dialogOpen.set(true);
  }

  protected askDelete(puzzle: Puzzle): void {
    this.dialogOpen.set(false);
    this.deleting.set(puzzle);
  }

  protected confirmDelete(): void {
    const puzzle = this.deleting();
    if (puzzle) this.puzzles.deletePuzzle(puzzle.id);
    this.deleting.set(null);
  }
}
