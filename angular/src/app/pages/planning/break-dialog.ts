import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MAX_TITLE_LENGTH } from '../../core/events/event';
import { type BreakDraft, type BreakErrors, type PlanningBreak, draftFromBreak, emptyBreakDraft } from '../../core/planning/breaks';
import { PlanningService } from '../../core/planning/planning.service';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Pause (Ferien, Winter-/Sommerpause) anlegen oder ändern. Die Vorschau nennt, welche Serien-Trainings wegfallen oder zurückkommen. */
@Component({
  selector: 'tk-break-dialog',
  imports: [Dialog, Button],
  templateUrl: './break-dialog.html',
  styleUrl: './break-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakDialog {
  private readonly planning = inject(PlanningService);

  readonly open = input(false);
  /** Zu bearbeitende Pause; leer = neue Pause. */
  readonly entry = input<PlanningBreak | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<PlanningBreak>();

  protected readonly maxName = MAX_TITLE_LENGTH;
  protected readonly draft = signal<BreakDraft>(emptyBreakDraft(todayIso()));
  protected readonly errors = signal<BreakErrors>({});
  protected readonly editing = computed(() => this.entry() !== null);
  protected readonly heading = computed(() => (this.editing() ? 'Pause bearbeiten' : 'Pause anlegen'));
  /** Was beim Speichern passiert, z. B. „In der Pause „Herbstferien“: 4 Trainings fallen weg.“ */
  protected readonly preview = computed(() => this.planning.previewBreak(this.draft()));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const entry = this.entry();
      untracked(() => {
        this.draft.set(entry ? draftFromBreak(entry) : emptyBreakDraft(todayIso()));
        this.errors.set({});
        this.planning.breakProtection.set(null);
      });
    });
    // Sobald der Zeitraum gültig ist, nachsehen, welche Termine darin schon bewertet sind (für die Vorschau).
    effect(() => {
      if (!this.open()) return;
      const draft = this.draft();
      untracked(() => void this.planning.loadBreakProtection(draft));
    });
  }

  protected patch(change: Partial<BreakDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.planning.saveBreak(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const entry = this.entry();
    if (entry) this.deleteRequested.emit(entry);
  }
}
