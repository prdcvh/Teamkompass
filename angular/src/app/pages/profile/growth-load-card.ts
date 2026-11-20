import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { growthLoadDetail, growthLoadStatus, wellnessText } from '../../core/alerts/growth-load-rule';
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
import type { Player } from '../../core/player/player';
import type { EventRating } from '../../core/profile/profile';
import { GrowthReviewsService } from '../../core/records/growth-reviews.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { FRESH_DAYS, QUALITY_LABELS, STATUS_LABELS, analyzeGrowth, rateText } from '../../core/records/growth-velocity';
import { MeasurementsService } from '../../core/records/measurements.service';
import { wellnessSum } from '../../core/self-report/self-report';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { GrowthReviewDialog } from './growth-review-dialog';

/**
 * Wachstum, Belastung und Befinden zusammen (SCRUM-257), nur Trainer-Profil. Zeigt vorhandene Daten auf einer
 * Zeitachse und je Messintervall; es gibt keinen Risikowert, keine Einordnung und keine automatische Maßnahme.
 * Fehlende Daten bleiben als „keine Daten“ bzw. „keine Angaben“ sichtbar. Das Befinden erscheint nur, wenn es lesbar
 * ist (Einwilligung/Regeln); Korrektur oder Widerruf aktualisieren die Ansicht, weil alles aus Signalen berechnet wird.
 *
 * Dazu der Hinweis „Wachstum und Belastung gemeinsam ansehen“ der Wenn-dann-Regeln (gleiche Funktion wie auf der
 * Startseite) und die Trainerprüfung als Notiz am Förderplan (Datum, Trainer, Maßnahme).
 */
@Component({
  selector: 'tk-growth-load-card',
  imports: [Card, Button, GrowthReviewDialog],
  templateUrl: './growth-load-card.html',
  styleUrls: ['./growth-load-card.css', '../../ui/chart/chart.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthLoadCard {
  private readonly measurements = inject(MeasurementsService);
  private readonly reports = inject(SelfReportsService);
  private readonly records = inject(RecordsStateService);
  protected readonly reviews = inject(GrowthReviewsService);

  /** Belastungskurve des Spielers (Müdigkeit/Fitness je Tag), aus dem Profil. */
  readonly curve = input.required<readonly LoadCurvePoint[]>();
  readonly compact = input(false);
  readonly player = input.required<Player>();
  /** Termine mit der Bewertung dieses Spielers (für die Belastungshinweise der Ampel). */
  readonly items = input.required<readonly EventRating[]>();

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

  /** Stand der Regel „Wachstum und Belastung“ heute; erst, wenn die Prüfungen geladen sind (sonst blitzt er auf). */
  protected readonly growthLoad = computed(() => {
    if (!this.reviews.visible() || this.reviews.state() !== 'ready' || !this.records.ready()) return null;
    return growthLoadStatus(
      {
        player: this.player(),
        items: this.items(),
        absences: this.records.absences(),
        measurements: this.measurements.measurements(),
        wellness: this.reports.wellnessReadable() ? [...this.reports.wellness().values()] : null,
        growthReviews: this.reviews.reviews(),
      },
      this.today,
    );
  });
  protected readonly growthLoadText = computed(() => {
    const status = this.growthLoad();
    return status ? growthLoadDetail(status) : '';
  });
  protected readonly plans = this.records.plans;
  /** Prüfungen, jüngste zuerst, mit dem Schwerpunkt des Förderplans. */
  protected readonly reviewList = computed(() => {
    const plans = this.records.plans();
    return [...this.reviews.reviews()]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .map((review) => ({ ...review, plan: plans.find((plan) => plan.id === review.planId)?.focus ?? 'Förderplan gelöscht' }));
  });
  protected readonly dialogOpen = signal(false);
  protected wellnessText = wellnessText;

  protected formatDate = formatDate;
  protected rateText = rateText;
  protected qualityLabels = QUALITY_LABELS;
  protected statusLabels = STATUS_LABELS;

  protected num(value: number): string {
    return String(Math.round(value * 10) / 10).replace('.', ',');
  }
}
