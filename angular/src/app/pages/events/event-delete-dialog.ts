import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { TeamEvent } from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import { PlanningService } from '../../core/planning/planning.service';
import { deleteChoice, parseSeriesEventId } from '../../core/planning/series-events';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Ergebnis der Rückfrage: `series` = „Alle Termine der Serie“ wurde gestartet (Fortschritt steht im PlanningService). */
export interface EventDeleted {
  readonly series: boolean;
}

/**
 * Rückfrage „Event löschen?“ inkl. Serien-Auswahl (SCRUM-222): nur diesen Termin oder alle Termine der Serie.
 * Aus der Eventliste herausgelöst (SCRUM-285), damit Eventliste und Bewertungsseite dieselbe Löschlogik nutzen.
 */
@Component({
  selector: 'tk-event-delete-dialog',
  imports: [Button, Dialog],
  templateUrl: './event-delete-dialog.html',
  styleUrl: './event-delete-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDeleteDialog {
  private readonly events = inject(EventsService);
  private readonly planning = inject(PlanningService);

  /** Zu löschendes Event; null = Dialog zu. */
  readonly event = input<TeamEvent | null>(null);
  readonly closed = output<void>();
  readonly deleted = output<EventDeleted>();

  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  /** Rückfrage zum gewählten Termin: normal oder Serien-Termin mit Auswahl (SCRUM-222). */
  protected readonly choice = computed(() => {
    const event = this.event();
    return event ? deleteChoice(event.id, this.planning.series().map((series) => series.id), this.planning.load() === 'ready') : null;
  });

  constructor() {
    effect(() => {
      const id = this.event()?.id ?? null;
      untracked(() => {
        this.failed.set(false);
        const parsed = id ? parseSeriesEventId(id) : null;
        if (parsed) {
          // Serien-Termin: Planung laden und nachsehen, wie viele Termine der Serie bewertet sind (Vorschau im Dialog).
          this.planning.start();
          void this.planning.loadProtection(parsed.seriesId);
        }
      });
    });
  }

  /** Was „Alle Termine der Serie“ mit den künftigen Terminen macht (inkl. Zahl der bleibenden); null, solange geprüft wird. */
  protected seriesPreview(): string | null {
    const choice = this.choice();
    return choice?.kind === 'series' ? this.planning.deletePreview(choice.seriesId) : null;
  }

  protected cancel(): void {
    this.closed.emit();
  }

  /** „Alle Termine der Serie“: dieselbe Löschlogik wie in der Serienverwaltung. */
  protected confirmSeries(): void {
    const choice = this.choice();
    if (choice?.kind !== 'series' || !choice.allAvailable) return;
    this.planning.deleteSeries(choice.seriesId);
    this.deleted.emit({ series: true });
  }

  protected async confirm(): Promise<void> {
    const event = this.event();
    if (!event || this.busy()) return; // Doppelklick: nur ein Löschlauf
    this.busy.set(true);
    this.failed.set(false);
    try {
      if (await this.events.remove(event.id)) this.deleted.emit({ series: false });
      else this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
