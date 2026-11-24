import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import type { Player } from '../../core/player/player';
import {
  DECISION_LABELS,
  EXECUTION_LABELS,
  MIN_CASES,
  type Ratio,
  SITUATION_LABELS,
  metricsByEventType,
  metricsByMonth,
  metricsBySituation,
  ratioShort,
  ratioText,
  sceneMetrics,
} from '../../core/tactics/tactic-scene';
import { TacticScenesStore } from '../../core/tactics/tactic-scenes.store';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Taktikdiagnostik im Spielerprofil (SCRUM-267): Entscheidungsqualität und Ausführungsquote aus den kodierten
 * Szenen, immer mit Nenner, Stichprobe, Zeitfenster und Mindestfallzahl; dazu der Vergleich je Ereignistyp,
 * Terminart und Monat. Nur Trainer (die Regeln sperren die Szenen für alle anderen Rollen).
 */
@Component({
  selector: 'tk-tactic-diagnostics-card',
  imports: [Button, Card],
  templateUrl: './tactic-diagnostics-card.html',
  styleUrl: './tactic-diagnostics-card.css',
  providers: [TacticScenesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TacticDiagnosticsCard {
  readonly player = input.required<Player>();

  protected readonly store = inject(TacticScenesStore);
  protected readonly metrics = computed(() => sceneMetrics(this.store.scenes()));
  protected readonly tables = computed(() => {
    const scenes = this.store.scenes();
    return [
      { key: 'situation', title: 'Nach Ereignistyp', first: 'Ereignistyp', groups: metricsBySituation(scenes) },
      { key: 'type', title: 'Spiel und Training', first: 'Termin', groups: metricsByEventType(scenes) },
      { key: 'month', title: 'Verlauf je Monat', first: 'Monat', groups: metricsByMonth(scenes) },
    ];
  });

  protected readonly minCases = MIN_CASES;
  protected readonly decisionLabels = DECISION_LABELS;
  protected readonly executionLabels = EXECUTION_LABELS;
  protected readonly situationLabels = SITUATION_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly ratioText = (value: Ratio) => ratioText(value);
  protected readonly ratioShort = ratioShort;

  constructor() {
    effect(() => {
      const id = this.player().id;
      untracked(() => this.store.watch({ field: 'playerId', value: id }));
    });
  }

  /** Langtext für Bildschirmleser und Tooltip der Kurzform in den Tabellen. */
  protected ratioTitle(value: Ratio): string {
    return value.value === null ? 'kein Wert' : `${value.count} von ${value.of}${value.reliable ? '' : ', unter der Mindestfallzahl'}`;
  }
}
