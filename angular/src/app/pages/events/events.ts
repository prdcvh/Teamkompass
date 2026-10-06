import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { LayoutService } from '../../core/layout.service';
import {
  EVENT_SORT_OPTIONS,
  EVENT_TYPES,
  INTENSITIES,
  type EventSort,
  type EventTypeFilter,
  type TeamEvent,
  filterEvents,
  formatDate,
  groupByMonth,
  resultText,
  sortEvents,
} from '../../core/event';
import { EventsService } from '../../core/events.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { EventDialog } from './event-dialog';

/** Events (Training/Spiel): Liste mit Suche und Typfilter, anlegen, nachträglich bearbeiten und löschen. */
@Component({
  selector: 'app-events',
  imports: [Button, Card, Dialog, Icon, EventDialog],
  templateUrl: './events.html',
  styleUrl: './events.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Events implements OnInit {
  protected readonly events = inject(EventsService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  protected readonly typeOptions = EVENT_TYPES;
  protected readonly sortOptions = EVENT_SORT_OPTIONS;

  protected readonly query = signal('');
  protected readonly type = signal<EventTypeFilter>('all');
  protected readonly sort = signal<EventSort>('date-desc');

  /** Dialog-Zustand: `editing` = null und `dialogOpen` = true bedeutet „neues Event“. */
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<TeamEvent | null>(null);
  protected readonly deleting = signal<TeamEvent | null>(null);
  protected readonly deleteFailed = signal(false);
  protected readonly deleteBusy = signal(false);

  protected readonly visible = computed(() =>
    sortEvents(filterEvents(this.events.events(), { query: this.query(), type: this.type() }), this.sort()),
  );
  protected readonly months = computed(() => groupByMonth(this.visible()));
  protected readonly filtering = computed(() => this.query().trim() !== '' || this.type() !== 'all');

  ngOnInit(): void {
    this.events.start();
  }

  protected formatDate = formatDate;
  protected resultText = resultText;

  protected intensityLabel(event: TeamEvent): string {
    return INTENSITIES.find((entry) => entry.value === event.intensity)?.label ?? '–';
  }

  /** „vs. Gegner · Ort“ bzw. nur der Ort. */
  protected detail(event: TeamEvent): string {
    return [event.opponent ? `vs. ${event.opponent}` : '', event.location].filter(Boolean).join(' · ');
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(event: TeamEvent): void {
    if (!this.events.canWrite()) return;
    this.editing.set(event);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected askDelete(event: TeamEvent): void {
    this.dialogOpen.set(false);
    this.deleteFailed.set(false);
    this.deleting.set(event);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const event = this.deleting();
    if (!event) return;
    if (this.deleteBusy()) return; // Doppelklick: nur ein Löschlauf
    this.deleteBusy.set(true);
    this.deleteFailed.set(false);
    try {
      const ok = await this.events.remove(event.id);
      if (ok) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }

  protected resetFilters(): void {
    this.query.set('');
    this.type.set('all');
  }

  protected retry(): void {
    this.events.stop();
    this.events.start();
  }
}
