import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { INTENSITIES } from '../../core/events/event';
import { type TrainingSeries, seriesTitle, weekdayLabel } from '../../core/planning/planning';
import { PlanningService } from '../../core/planning/planning.service';
import { formatDate } from '../../core/shared/dates';
import { SyncService } from '../../core/shell/sync.service';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { SchoolHolidaysHint } from './school-holidays-hint';
import { SeriesDialog } from './series-dialog';

/** Planung (nur Trainer): Trainingsserien verwalten. Die Termine selbst entstehen erst in einem späteren Schritt (SCRUM-146). */
@Component({
  selector: 'app-planning',
  imports: [Button, Card, Dialog, SchoolHolidaysHint, SeriesDialog],
  templateUrl: './planning.html',
  styleUrl: './planning.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Planning implements OnInit {
  protected readonly planning = inject(PlanningService);
  protected readonly sync = inject(SyncService);
  private readonly settings = inject(TeamSettingsService);

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<TrainingSeries | null>(null);
  protected readonly deleting = signal<TrainingSeries | null>(null);

  protected readonly title = seriesTitle;
  protected readonly weekday = weekdayLabel;
  protected readonly formatDate = formatDate;

  ngOnInit(): void {
    this.planning.start();
    // Der Standardort belegt neue Serien vor; ohne ihn bleibt das Ortsfeld leer.
    this.settings.start();
  }

  protected intensity(series: TrainingSeries): string {
    return INTENSITIES.find((entry) => entry.value === series.intensity)?.label ?? '';
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
  }

  protected confirmDelete(): void {
    const series = this.deleting();
    if (series) this.planning.deleteSeries(series.id);
    this.deleting.set(null);
  }
}
