import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { formatDate } from '../../core/events/event';
import { type LearningPath, type PathView, ageGroupLabel, pathFitsPlayer, pathView, positionLabel, progressText } from '../../core/learning/learning-path';
import { LearningService } from '../../core/learning/learning.service';
import type { Player } from '../../core/player/player';
import { SquadService } from '../../core/player/squad.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';
import { Dialog } from '../../ui/dialog/dialog';
import { PathDialog } from './path-dialog';

interface PlayerRow {
  readonly player: Player;
  readonly view: PathView;
}

/**
 * Lernpfade im Tab „Wissen“ (SCRUM-192, nur Trainer): Pfade anlegen und je Spieler die nächste Stufe bestätigen (oder die
 * letzte zurücknehmen). Bestätigte Stufen erscheinen im Kompetenzprofil des Spielers.
 */
@Component({
  selector: 'tk-learning-paths',
  imports: [Button, Card, Chip, Dialog, PathDialog],
  templateUrl: './learning-paths.html',
  styleUrl: './learning-paths.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningPaths implements OnInit {
  protected readonly learning = inject(LearningService);
  private readonly squad = inject(SquadService);
  private readonly team = inject(CurrentTeam);

  protected readonly positionLabel = positionLabel;
  protected readonly ageGroupLabel = ageGroupLabel;
  protected readonly progressText = progressText;
  protected readonly formatDate = formatDate;

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<LearningPath | null>(null);
  protected readonly deleting = signal<LearningPath | null>(null);
  /** Pfad, dessen Spielerliste aufgeklappt ist. */
  protected readonly expanded = signal<string | null>(null);

  private readonly players = computed(() => [...this.squad.players()].sort((a, b) => a.number - b.number));
  protected readonly squadReady = computed(() => this.squad.load() === 'ready');

  ngOnInit(): void {
    this.learning.start();
    this.squad.start();
  }

  /** Spieler, für die der Pfad gilt, mit ihrem Stand. */
  protected rows(path: LearningPath): PlayerRow[] {
    const label = this.team.label();
    return this.players()
      .filter((player) => pathFitsPlayer(path, player, label))
      .map((player) => ({ player, view: pathView(path, this.learning.progressOf(player.id)) }));
  }

  /** Pfad mit Altersklasse, die nicht zum Team passt: niemand im Team sieht ihn. */
  protected otherAgeGroup(path: LearningPath): boolean {
    return path.ageGroup !== '' && !pathFitsPlayer({ ...path, position: '' }, { positions: [] }, this.team.label());
  }

  protected toggle(path: LearningPath): void {
    this.expanded.update((id) => (id === path.id ? null : path.id));
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(path: LearningPath): void {
    this.editing.set(path);
    this.dialogOpen.set(true);
  }

  protected askDelete(path: LearningPath): void {
    this.dialogOpen.set(false);
    this.deleting.set(path);
  }

  protected confirmDelete(): void {
    const path = this.deleting();
    if (path) this.learning.deletePath(path.id);
    this.deleting.set(null);
  }

  protected confirm(row: PlayerRow): void {
    this.learning.confirmNext(row.player.id, row.view.path.id);
  }

  protected undo(row: PlayerRow): void {
    this.learning.undoLast(row.player.id, row.view.path.id);
  }
}
