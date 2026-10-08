import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  DETAIL_FIELDS,
  MAX_DETAIL_LENGTH,
  MAX_FORMATION_LENGTH,
  MAX_NAME_LENGTH,
  OPPONENT_STYLES,
  type Opponent,
  type OpponentDraft,
  type OpponentErrors,
  draftFromOpponent,
  emptyDraft,
} from '../../core/opponent';
import { OpponentsService } from '../../core/opponents.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

type TextKey = (typeof DETAIL_FIELDS)[number]['key'];

/** Gegner anlegen/bearbeiten. */
@Component({
  selector: 'tk-opponent-dialog',
  imports: [Dialog, Button],
  templateUrl: './opponent-dialog.html',
  styleUrl: './opponent-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpponentDialog {
  private readonly opponents = inject(OpponentsService);

  readonly open = input(false);
  /** Zu bearbeitender Gegner; leer = neuen anlegen. */
  readonly opponent = input<Opponent | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<Opponent>();

  protected readonly styles = OPPONENT_STYLES;
  protected readonly fields = DETAIL_FIELDS;
  protected readonly limits = { name: MAX_NAME_LENGTH, formation: MAX_FORMATION_LENGTH, detail: MAX_DETAIL_LENGTH };

  protected readonly draft = signal<OpponentDraft>(emptyDraft());
  protected readonly errors = signal<OpponentErrors>({});
  protected readonly editing = computed(() => this.opponent() !== null);
  protected readonly title = computed(() => (this.editing() ? 'Gegner bearbeiten' : 'Gegner erfassen'));

  constructor() {
    // Beim Öffnen frisch befüllen: bearbeiten = Werte des Gegners, anlegen = leer.
    effect(() => {
      if (!this.open()) return;
      const opponent = this.opponent();
      untracked(() => {
        this.draft.set(opponent ? draftFromOpponent(opponent) : emptyDraft());
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<OpponentDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected text(key: TextKey): string {
    return this.draft()[key];
  }

  protected setText(key: TextKey, event: Event): void {
    this.patch({ [key]: this.value(event) });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.opponents.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const opponent = this.opponent();
    if (opponent) this.deleteRequested.emit(opponent);
  }
}
