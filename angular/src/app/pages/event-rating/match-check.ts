import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { MatchConsistency } from '../../core/ratings/match-consistency';

/**
 * Stimmigkeitshinweis einer Spielbewertung (SCRUM-395): Warnung mit Differenz, wenn Minuten oder Tore/Vorlagen nicht
 * zusammenpassen, sonst ein ruhiger „passt“-Hinweis. Rein informativ: nichts hier blockiert das Speichern.
 * Die Warnung steht als Text mit Symbol da, nicht nur als Farbe. Ohne Eingaben bleibt die Komponente leer.
 */
@Component({
  selector: 'tk-match-check',
  template: `
    @let result = check();
    @if (!result.nothingEntered) {
      @if (result.hasWarning) {
        <div class="box warn" role="status" aria-label="Hinweis zur Stimmigkeit">
          <strong class="head"><span aria-hidden="true">⚠</span> Bitte prüfen (Speichern ist trotzdem möglich)</strong>
          <ul>
            @if (result.minutes.status === 'short' || result.minutes.status === 'over') {
              <li>{{ result.minutes.message }}</li>
            }
            @if (result.goals.status === 'short' || result.goals.status === 'over') {
              <li>{{ result.goals.message }}</li>
            }
          </ul>
        </div>
      } @else if (result.allOk) {
        <p class="box ok" role="status"><span aria-hidden="true">✓</span> Minuten, Tore und Vorlagen passen</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .box {
      margin: 0 0 var(--tk-space-3);
      padding: var(--tk-space-2) var(--tk-space-3);
      border: 1px solid var(--tk-border, currentColor);
      border-radius: var(--tk-radius-md);
      font-size: var(--tk-text-sm, 14px);
      overflow-wrap: anywhere;
    }

    .warn {
      color: var(--tk-amber);
      background: var(--tk-soft-amber);
      border-color: var(--tk-amber);
    }

    .ok {
      color: var(--tk-green);
      background: var(--tk-soft-green);
      border-color: transparent;
    }

    .head {
      display: block;
    }

    ul {
      margin: var(--tk-space-1) 0 0;
      padding-left: var(--tk-space-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchCheck {
  readonly check = input.required<MatchConsistency>();
}
