import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatDate } from '../../core/events/event';
import {
  FRESH_DAYS,
  MIN_INTERVAL_DAYS,
  OUTLIER_RATE_CM_PER_YEAR,
  QUALITY_LABELS,
  STATUS_LABELS,
  analyzeGrowth,
  growthVelocityChart,
  rateText,
} from '../../core/records/growth-velocity';
import { MeasurementsService } from '../../core/records/measurements.service';
import { todayIso } from '../../core/shared/dates';
import { Card } from '../../ui/card/card';

/**
 * Wachstumsgeschwindigkeit in cm/Jahr je Messintervall (SCRUM-254) unter den Messwerten im Profil. Sie hängt an
 * denselben Daten und derselben Sichtbarkeit wie das Messwertdiagramm (Einbindung in `profile-extras`); eine
 * Wachstumsspitze (PHV) wird bewusst nicht abgeleitet.
 */
@Component({
  selector: 'tk-growth-velocity-card',
  imports: [Card],
  templateUrl: './growth-velocity-card.html',
  styleUrls: ['./growth-velocity-card.css', '../../ui/chart/chart.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthVelocityCard {
  private readonly measurements = inject(MeasurementsService);

  protected readonly analysis = computed(() => analyzeGrowth(this.measurements.measurements(), todayIso()));
  protected readonly chart = computed(() => growthVelocityChart(this.analysis()));
  /** Tabelle: jüngstes Intervall zuerst. */
  protected readonly rows = computed(() => [...this.analysis().intervals].reverse());

  protected readonly minDays = MIN_INTERVAL_DAYS;
  protected readonly outlierRate = OUTLIER_RATE_CM_PER_YEAR;
  protected readonly freshDays = FRESH_DAYS;
  protected readonly qualityLabels = QUALITY_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected formatDate = formatDate;
  protected rateText = rateText;

  protected num(value: number): string {
    return String(Math.round(value * 10) / 10).replace('.', ',');
  }
}
