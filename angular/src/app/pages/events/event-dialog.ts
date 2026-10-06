import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  EVENT_TYPES,
  type EventDraft,
  type EventErrors,
  INTENSITIES,
  MAX_MATCH_DURATION,
  MAX_NOTES_LENGTH,
  MAX_SCORE,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  type TeamEvent,
  TRAINING_FOCUSES,
  draftFromEvent,
  emptyDraft,
} from '../../core/event';
import { EventsService } from '../../core/events.service';
import { todayIso } from '../../core/player';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Event anlegen/bearbeiten. Spielfelder (Gegner, Dauer, Ergebnis) erscheinen nur bei Spielen, Trainingsfokus nur bei Trainings. */
@Component({
  selector: 'tk-event-dialog',
  imports: [Dialog, Button],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDialog {
  private readonly events = inject(EventsService);

  readonly open = input(false);
  /** Zu bearbeitendes Event; leer = neues Event anlegen. */
  readonly event = input<TeamEvent | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<TeamEvent>();

  protected readonly types = EVENT_TYPES;
  protected readonly intensities = INTENSITIES;
  protected readonly focuses = TRAINING_FOCUSES;
  protected readonly limits = { title: MAX_TITLE_LENGTH, text: MAX_TEXT_LENGTH, notes: MAX_NOTES_LENGTH, score: MAX_SCORE, duration: MAX_MATCH_DURATION };

  protected readonly draft = signal<EventDraft>(emptyDraft(todayIso()));
  protected readonly errors = signal<EventErrors>({});
  protected readonly editing = computed(() => this.event() !== null);
  protected readonly title = computed(() => (this.editing() ? 'Event bearbeiten' : 'Event anlegen'));

  constructor() {
    // Beim Öffnen frisch befüllen: bearbeiten = Werte des Events, anlegen = Standardwerte mit heutigem Datum.
    effect(() => {
      if (!this.open()) return;
      const event = this.event();
      untracked(() => {
        this.draft.set(event ? draftFromEvent(event) : emptyDraft(todayIso()));
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<EventDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.events.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const event = this.event();
    if (event) this.deleteRequested.emit(event);
  }
}
