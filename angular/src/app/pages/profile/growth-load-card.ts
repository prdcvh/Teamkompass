import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  type WellnessPoint,
  OVERVIEW_DAYS,
  OVERVIEW_DESKTOP,
  OVERVIEW_MOBILE,
  hintDetail,
  overviewChart,
  overviewRows,
} from '../../core/analysis/growth-load-overview';
import type { LoadCurvePoint } from '../../core/analysis/load-curve';
import { formatDate } from '../../core/events/event';
import { FRESH_DAYS, QUALITY_LABELS, STATUS_LABELS, analyzeGrowth, rateText } from '../../core/records/growth-velocity';
import { MeasurementsService } from '../../core/records/measurements.service';
import { wellnessSum } from '../../core/self-report/self-report';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { todayIso } from '../../core/shared/dates';
import { Card } from '../../ui/card/card';

/**
 * Wachstum, Belastung und Befinden zusammen (SCRUM-257), nur Trainer-Profil. Zeigt vorhandene Daten auf einer
 * Zeitachse und je Messintervall; es gibt keinen Risikowert, keine Einordnung und keine automatische Maßnahme.
 * Fehlende Daten bleiben als „keine Daten“ bzw. „keine Angaben“ sichtbar. Das Befinden erscheint nur, wenn es lesbar
 * ist (Einwilligung/Regeln); Korrektur oder Widerruf aktualisieren die Ansicht, weil alles aus Signalen berechnet wird.
 */
@Component({
  selector: 'tk-growth-load-card',
  imports: [Card],
  templateUrl: './growth-load-card.html',
  styleUrls: ['./growth-load-card.css', '../../ui/chart/chart.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthLoadCard {
  private readonly measurements = inject(MeasurementsService);
  private readonly reports = inject(SelfReportsService);

  /** Belastungskurve des Spielers (Müdigkeit/Fitness je Tag), aus dem Profil. */
  readonly curve = input.required<readonly LoadCurvePoint[]>();
  readonly compact = input(false);

  private readonly today = todayIso();
  protected readonly days = OVERVIEW_DAYS;
  protected readonly freshDays = FRESH_DAYS;
  protected readonly analysis = computed(() => analyzeGrowth(this.measurements.measurements(), this.today));
  /** `null` = Befinden nicht lesbar; sonst die vollständigen und unvollständigen Antworten. */
  protected readonly wellness = computed<WellnessPoint[] | null>(() =>
    this.reports.wellnessReadable() ? [...this.reports.wellness().values()].map((entry) => ({ date: entry.date, sum: wellnessSum(entry) })) : null,
  );
  protected readonly chart = computed(() => overviewChart(this.analysis(), this.curve(), this.wellness(), this.today, this.compact() ? OVERVIEW_MOBILE : OVERVIEW_DESKTOP));
  protected readonly rows = computed(() => overviewRows(this.analysis(), this.curve(), this.wellness()));
  protected readonly hint = computed(() => (this.analysis().currentRate !== null ? hintDetail(this.analysis(), this.today) : null));

  protected formatDate = formatDate;
  protected rateText = rateText;
  protected qualityLabels = QUALITY_LABELS;
  protected statusLabels = STATUS_LABELS;

  protected num(value: number): string {
    return String(Math.round(value * 10) / 10).replace('.', ',');
  }
}
