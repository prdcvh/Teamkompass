import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { TeamEvent } from '../../core/events/event';
import type { Player } from '../../core/player/player';
import {
  DECISIONS,
  DECISION_CRITERIA,
  DECISION_LABELS,
  type Decision,
  EXECUTIONS,
  EXECUTION_LABELS,
  type Execution,
  MAX_CONTEXT,
  MAX_MINUTE,
  MAX_VIDEO_URL,
  MIN_CASES,
  SITUATION_LABELS,
  SITUATION_TYPES,
  type SituationType,
  type TacticScene,
  type TacticSceneDraft,
  type TacticSceneErrors,
  emptySceneDraft,
} from '../../core/tactics/tactic-scene';
import { TacticScenesStore } from '../../core/tactics/tactic-scenes.store';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip, type Tone } from '../../ui/chip/chip';

/**
 * Taktikdiagnostik am Termin (SCRUM-267): Trainer erfasst einzelne Spielszenen je Spieler und ordnet Entscheidung und
 * Ausführung GETRENNT ein. Die Kennzahlen stehen im Spielerprofil. Nur für Trainer (die Seite blendet das Feld für
 * alle anderen Rollen aus, die Regeln sperren die Daten).
 */
@Component({
  selector: 'tk-tactic-scenes-panel',
  imports: [RouterLink, Button, Card, Chip],
  templateUrl: './tactic-scenes-panel.html',
  styleUrl: './tactic-scenes-panel.css',
  providers: [TacticScenesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TacticScenesPanel {
  readonly event = input.required<TeamEvent>();
  readonly players = input.required<readonly Player[]>();

  protected readonly store = inject(TacticScenesStore);

  protected readonly decisions = DECISIONS;
  protected readonly decisionLabels = DECISION_LABELS;
  protected readonly decisionCriteria = DECISION_CRITERIA;
  protected readonly executions = EXECUTIONS;
  protected readonly executionLabels = EXECUTION_LABELS;
  protected readonly situations = SITUATION_TYPES;
  protected readonly situationLabels = SITUATION_LABELS;
  protected readonly limits = { context: MAX_CONTEXT, minute: MAX_MINUTE, video: MAX_VIDEO_URL, cases: MIN_CASES };

  protected readonly draft = signal<TacticSceneDraft>(emptySceneDraft());
  protected readonly errors = signal<TacticSceneErrors>({});
  protected readonly busy = signal(false);
  protected readonly saved = signal('');
  /** Szene, deren Löschen gerade bestätigt werden muss. */
  protected readonly confirmDelete = signal<string | null>(null);

  private readonly names = computed(() => new Map(this.players().map((player) => [player.id, `${player.number} · ${player.name}`])));

  constructor() {
    effect(() => {
      const id = this.event().id;
      untracked(() => {
        this.store.watch({ field: 'eventId', value: id });
        this.draft.set(emptySceneDraft());
        this.errors.set({});
        this.saved.set('');
      });
    });
  }

  protected nameOf(scene: TacticScene): string {
    return this.names().get(scene.playerId) ?? 'Spieler nicht mehr im Kader';
  }

  protected decisionTone(decision: Decision): Tone {
    return decision === 'good' ? 'green' : decision === 'poor' ? 'red' : 'neutral';
  }

  protected executionTone(execution: Execution): Tone {
    return execution === 'success' ? 'green' : execution === 'fail' ? 'amber' : 'neutral';
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected update(change: Partial<TacticSceneDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.saved.set('');
  }

  protected setDecision(decision: Decision): void {
    // Ausführung gibt es nur bei sinnvoller Entscheidung.
    this.update(decision === 'good' ? { decision } : { decision, execution: '' });
  }

  protected toggleSituation(type: SituationType, checked: boolean): void {
    const current = this.draft().situations;
    this.update({ situations: checked ? SITUATION_TYPES.filter((entry) => entry === type || current.includes(entry)) : current.filter((entry) => entry !== type) });
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    const draft = this.draft();
    const errors = await this.store.add(draft, this.event(), this.players().map((player) => player.id));
    this.busy.set(false);
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) {
      const name = this.names().get(draft.playerId) ?? '';
      // Spieler bleibt gewählt: meist folgen mehrere Szenen desselben Spielers.
      this.draft.set(emptySceneDraft(draft.playerId));
      this.saved.set(`Szene für ${name} gespeichert.`);
    }
  }

  protected askDelete(scene: TacticScene): void {
    this.confirmDelete.set(scene.id);
  }

  protected cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  protected async remove(scene: TacticScene): Promise<void> {
    this.confirmDelete.set(null);
    await this.store.remove(scene);
  }
}
