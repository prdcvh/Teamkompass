import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import type { Player } from '../../core/player/player';
import { HealthReasonsService } from '../../core/records/health-reasons.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** So viele Einträge zeigt die Liste; der Rest steht als Zahl darunter. */
const SHOWN = 8;

/**
 * Teil der Aufgabe „Gesundheitsdaten prüfen und löschen“ (SCRUM-248): Gründe, die die App früher in die Rückmeldung
 * einer Bewertung geschrieben hat („Verletzt (ca. bis …)“, „Abgesagt: krank“), und Absagen mit Grund. Spieler und Eltern
 * lesen die Bewertung; entfernt wird nur der Grund und nur nach Rückfrage.
 */
@Component({
  selector: 'tk-health-reasons-task',
  imports: [Button, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="reasons">
      <h4>Gründe in Bewertungen und Absagen</h4>
      @if (!service.ready()) {
        <p role="status">Bewertungen und Absagen werden geprüft …</p>
      } @else if (service.responseState() === 'error') {
        <p role="alert">Absagen konnten nicht gelesen werden.</p>
        <button tkButton size="sm" type="button" (click)="reload()">Erneut versuchen</button>
      } @else if (total() === 0) {
        <p class="done">Keine Gründe in Bewertungen oder Absagen gespeichert.</p>
      } @else {
        <p>{{ summary() }} Spieler und Eltern sehen die Rückmeldungen der Bewertungen.</p>
        <ul>
          @for (entry of shown(); track entry.key) {
            <li><span class="when">{{ entry.when }}</span> {{ entry.text }}</li>
          }
        </ul>
        @if (total() > shown().length) {
          <p>… und {{ total() - shown().length }} weitere.</p>
        }
        <button tkButton size="sm" type="button" class="danger" (click)="open.set(true)">Nur die Gründe entfernen</button>
      }
      <p class="hint">Was du selbst als Text in eine Rückmeldung geschrieben hast, erkennt die App nicht – bitte bei Bedarf in der Bewertung prüfen.</p>
    </div>

    <tk-dialog [open]="open()" title="Gründe entfernen?" (closed)="cancel()">
      <p>{{ dialogText() }}</p>
      @if (failed()) {
        <p class="error" role="alert">Nicht alles hat geklappt. Bitte Verbindung prüfen und erneut versuchen.</p>
      }
      <div class="confirm-actions">
        <button tkButton type="button" (click)="cancel()">Abbrechen</button>
        <button tkButton type="button" variant="primary" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Bitte warten …' : 'Gründe entfernen' }}</button>
      </div>
    </tk-dialog>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .reasons { display: grid; gap: var(--tk-space-2); justify-items: start; min-width: 0; }
    h4 { margin: 0; font-size: var(--tk-text-sm); font-weight: 700; }
    p { margin: 0; }
    ul { display: grid; gap: 4px; margin: 0; padding-left: 1.1em; }
    li, p { min-width: 0; overflow-wrap: anywhere; }
    .when { font-weight: 600; }
    .done { font-weight: 600; }
    .hint { opacity: 0.85; }
    button { max-width: 100%; white-space: normal; line-height: 1.25; text-align: left; padding-block: 8px; }
    .error { color: var(--tk-red-dark); }
    .confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--tk-space-2); margin-top: var(--tk-space-3); }
  `,
})
export class HealthReasonsTask {
  protected readonly service = inject(HealthReasonsService);

  readonly player = input.required<Player>();

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  private readonly entries = computed(() => [
    ...this.service.ratings().map(({ event, note }) => ({ key: `r${event.id}`, when: when(event), text: `Bewertung: „${note}“` })),
    ...this.service.responses().map(({ event, reason }) => ({ key: `a${event.id}`, when: when(event), text: `Absage: „${reason}“` })),
  ]);
  protected readonly total = computed(() => this.entries().length);
  protected readonly shown = computed(() => this.entries().slice(0, SHOWN));
  protected readonly summary = computed(() => {
    const ratings = this.service.ratings().length;
    const responses = this.service.responses().length;
    const parts = [];
    if (ratings) parts.push(`${ratings} Bewertung(en) mit Grund in der Rückmeldung`);
    if (responses) parts.push(`${responses} Absage(n) mit Grund`);
    return `${parts.join(' und ')}.`;
  });
  protected readonly dialogText = computed(
    () =>
      `Bei ${this.player().name} wird aus ${this.total() === 1 ? 'einem Eintrag' : `${this.total()} Einträgen`} nur der Grund entfernt. In der Bewertung steht danach nur „Fehlt“ bzw. „Abgesagt“; die Absage selbst bleibt bestehen. Das lässt sich nicht rückgängig machen.`,
  );

  constructor() {
    effect(() => {
      const id = this.player().id;
      untracked(() => void this.service.load(id));
    });
  }

  protected reload(): void {
    void this.service.load(this.player().id, true);
  }

  protected cancel(): void {
    this.open.set(false);
    this.failed.set(false);
  }

  protected async confirm(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      if (await this.service.removeAll(this.player().id)) this.open.set(false);
      else this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

function when(event: { readonly date: string; readonly title: string }): string {
  return `${formatDate(event.date)} ${event.title}:`;
}
