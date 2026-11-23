import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { formatDate } from '../../core/events/event';
import { ageGroupLabel, pathFitsPlayer, pathView, positionLabel, progressText } from '../../core/learning/learning-path';
import { LearningService } from '../../core/learning/learning.service';
import type { Player } from '../../core/player/player';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';

/**
 * Lernpfad des eigenen Spielers (SCRUM-192): Stand, nächster Schritt mit kurzer Einheit und Aufgabe für zu Hause.
 * Nur Spieler und Eltern; Eltern sehen denselben Fortschritt (Lernpfade haben keine Noten). Die Regeln geben ihnen nur den
 * Fortschritt des eigenen Spielers. Ohne passende Pfade (oder solange die Regeln die Lernpfade noch nicht kennen) bleibt
 * der Bereich leer.
 */
@Component({
  selector: 'tk-learning-panel',
  imports: [Card, Chip],
  templateUrl: './learning-panel.html',
  styleUrl: './learning-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningPanel {
  private readonly learning = inject(LearningService);
  private readonly role = inject(SessionService).role;
  private readonly team = inject(CurrentTeam);

  readonly player = input.required<Player>();

  protected readonly formatDate = formatDate;
  protected readonly progressText = progressText;
  protected readonly positionLabel = positionLabel;
  protected readonly ageGroupLabel = ageGroupLabel;
  private readonly allowed = computed(() => this.role() === 'player' || this.role() === 'parent');
  protected readonly parent = computed(() => this.role() === 'parent');

  /** Pfade für Position und Altersklasse des Spielers, dazu jeder Pfad, in dem schon etwas bestätigt ist. */
  protected readonly views = computed(() => {
    if (!this.allowed() || this.learning.load() !== 'ready') return [];
    const player = this.player();
    const progress = this.learning.progressOf(player.id);
    return this.learning
      .paths()
      .map((path) => pathView(path, progress))
      .filter((view) => view.done > 0 || pathFitsPlayer(view.path, player, this.team.label()));
  });

  constructor() {
    effect(() => {
      if (this.allowed()) untracked(() => this.learning.start());
    });
  }
}
