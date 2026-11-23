import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { formatDate } from '../../core/events/event';
import { type PathView, confirmedSummary, progressText } from '../../core/learning/learning-path';
import { LearningService } from '../../core/learning/learning.service';
import type { Player } from '../../core/player/player';

/**
 * Bestätigte Lernpfad-Stufen im Kompetenzprofil (SCRUM-192). Nur für Trainer, Spieler und Eltern – Medizin und Scout
 * lesen keinen Fortschritt (Regeln) und sehen hier nichts. Keine Noten, nur Stufen.
 */
@Component({
  selector: 'tk-learning-summary',
  template: `
    @if (visible()) {
      <h2>Lernpfade</h2>
      @if (summary().length === 0) {
        <p class="muted">Noch keine Lernpfad-Stufe bestätigt.</p>
      } @else {
        <ul class="learning" data-testid="learning-summary">
          @for (view of summary(); track view.path.id) {
            <li>
              <div class="line">
                <strong>{{ view.path.title }}</strong><span>{{ view.done }}/{{ view.total }}</span>
              </div>
              <progress [max]="view.total" [value]="view.done" [attr.aria-label]="view.path.title + ': ' + progressText(view)"></progress>
              <small>
                Bestätigt:
                @for (level of done(view); track level.level.id; let last = $last) {
                  Stufe {{ level.number }} {{ level.level.title }} ({{ formatDate(level.confirmedAt) }}){{ last ? '' : ';' }}
                }
              </small>
              @if (view.next; as next) {
                <small class="next">Nächster Schritt: Stufe {{ next.number }} – {{ next.level.title }}</small>
              }
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    :host { display: contents; }
    h2 { margin: var(--tk-space-4) 0 var(--tk-space-3); font-size: var(--tk-text-lg); }
    p { margin: 0; }
    .muted, small { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    .learning { display: grid; gap: var(--tk-space-3); margin: 0; padding: 0; list-style: none; }
    .learning li { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
    .line { display: flex; justify-content: space-between; gap: var(--tk-space-2); }
    .next { color: var(--tk-ink); }
    progress { width: 100%; height: 8px; accent-color: var(--tk-green); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningSummary {
  private readonly learning = inject(LearningService);
  private readonly role = inject(SessionService).role;

  readonly player = input.required<Player>();

  protected readonly formatDate = formatDate;
  protected readonly progressText = progressText;
  private readonly allowed = computed(() => ['trainer', 'player', 'parent'].includes(this.role() ?? ''));
  protected readonly visible = computed(() => this.allowed() && this.learning.load() === 'ready' && this.learning.paths().length > 0);
  protected readonly summary = computed(() => confirmedSummary(this.learning.paths(), this.learning.progressOf(this.player().id)));

  constructor() {
    effect(() => {
      if (this.allowed()) untracked(() => this.learning.start());
    });
  }

  protected done(view: PathView) {
    return view.levels.filter((level) => level.state === 'done');
  }
}
