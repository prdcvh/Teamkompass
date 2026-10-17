import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { EXERTIONS } from '../../core/events/event';
import { type TrainingSeries, seriesTitle, weekdayLabel } from '../../core/planning/planning';
import { EventsService } from '../../core/events/events.service';
import { PlanningService } from '../../core/planning/planning.service';
import { formatDate } from '../../core/shared/dates';
import { SyncService } from '../../core/shell/sync.service';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { SeriesDialog } from './series-dialog';

/** Planung (nur Trainer): Trainingsserien verwalten. Beim Speichern entstehen die Trainings als Events. */
@Component({
  selector: 'app-planning',
  imports: [Button, Card, Dialog, SeriesDialog],
  templateUrl: './planning.html',
  styleUrl: './planning.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Planning implements OnInit {
  protected readonly planning = inject(PlanningService);
  protected readonly sync = inject(SyncService);
  private readonly events = inject(EventsService);
  private readonly settings = inject(TeamSettingsService);

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<TrainingSeries | null>(null);
  protected readonly deleting = signal<TrainingSeries | null>(null);

  protected readonly title = seriesTitle;
  protected readonly weekday = weekdayLabel;
  protected readonly formatDate = formatDate;

  ngOnInit(): void {
    this.planning.start();
    // Die vorhandenen Events werden für die Vorschau und das Anlegen der Serien-Trainings gebraucht.
    this.events.start();
    // Der Standardort belegt neue Serien vor; ohne ihn bleibt das Ortsfeld leer.
    this.settings.start();
  }

  protected exertion(series: TrainingSeries): string {
    return EXERTIONS.find((entry) => entry.value === series.exertion)?.label ?? '';
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(series: TrainingSeries): void {
    this.editing.set(series);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected askDelete(series: TrainingSeries): void {
    this.dialogOpen.set(false);
    this.deleting.set(series);
    void this.planning.loadProtection(series.id);
  }

  /** Was beim Löschen mit den künftigen Terminen passiert; null, solange geprüft wird. */
  protected deletePreview(series: TrainingSeries | null): string | null {
    return series ? this.planning.deletePreview(series.id) : null;
  }

  protected confirmDelete(): void {
    const series = this.deleting();
    if (series) this.planning.deleteSeries(series.id);
    this.deleting.set(null);
  }
}
