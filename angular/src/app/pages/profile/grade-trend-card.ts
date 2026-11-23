import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  DEVELOPMENT_METHOD,
  DEVELOPMENT_PERIODS,
  type DevelopmentPeriodKey,
  developmentPeriod,
  developmentSummary,
} from '../../core/profile/development';
import { type GradedEvent, trendChart } from '../../core/profile/profile';
import type { RatingScale } from '../../core/ratings/rating-scale';
import { formatDate } from '../../core/shared/dates';
import { Card } from '../../ui/card/card';

/**
 * Notenverlauf mit echter Zeitachse und Entwicklung im gewählten Beobachtungszeitraum (SCRUM-265). Profil (Trainer) und
 * Spieleransicht nutzen dieselbe Karte und damit dieselbe Rechnung wie die Berichte (core/profile/development.ts).
 */
@Component({
  selector: 'tk-grade-trend-card',
  imports: [Card],
  template: `
    <tk-card>
      <section class="trend" aria-labelledby="grade-trend-title" data-testid="grade-trend">
        <div class="trend-head">
          <h2 id="grade-trend-title">Notenverlauf</h2>
          <label class="period">
            Zeitraum
            <select [value]="periodKey()" (change)="setPeriod($any($event.target).value)" data-testid="trend-period">
              @for (option of periods; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </label>
        </div>
        <p class="range" data-testid="trend-range">{{ period().label }}: {{ formatDate(period().from) }} – {{ formatDate(period().to) }}</p>
        <svg class="chart" [attr.viewBox]="'0 0 ' + chart().width + ' ' + chart().height" role="img" [attr.aria-label]="ariaLabel()">
          @for (line of chart().grid; track line.grade) {
            <line x1="54" [attr.y1]="line.y" [attr.x2]="chart().width - 24" [attr.y2]="line.y" class="grid" />
            <text [attr.x]="line.x" [attr.y]="line.y + 4" class="axis">{{ line.label }}</text>
          }
          @for (tick of chart().ticks; track $index) {
            <text [attr.x]="tick.x" [attr.y]="chart().height - 12" class="axis small" text-anchor="middle">{{ tick.label }}</text>
          }
          @if (chart().points.length > 0) {
            @if (chart().area) {
              <path [attr.d]="chart().area" class="area" />
            }
            <path [attr.d]="chart().path" class="line" />
            @for (gap of chart().gaps; track $index) {
              <line [attr.x1]="gap.x1" [attr.y1]="gap.y1" [attr.x2]="gap.x2" [attr.y2]="gap.y2" class="gap" />
            }
            @for (marker of chart().markers; track $index) {
              <line [attr.x1]="marker.x" y1="30" [attr.x2]="marker.x" [attr.y2]="chart().height - 38" class="marker" />
              <text [attr.x]="marker.x + 4" y="24" class="marker-label">{{ marker.label }}</text>
            }
            @for (point of chart().points; track $index) {
              <circle [attr.cx]="point.x" [attr.cy]="point.y" r="6" class="dot" [class.last]="$last" tabindex="0" [attr.aria-label]="point.title"><title>{{ point.title }}</title></circle>
              @if ($last || $index === chart().best || chart().points.length <= 8) {
                <text [attr.x]="point.x" [attr.y]="point.y - 14" class="value" text-anchor="middle">{{ point.valueLabel }}</text>
              }
            }
          } @else {
            <text x="54" y="138" class="axis">Keine benoteten Events in diesem Zeitraum.</text>
          }
        </svg>
        <div class="development" [attr.data-state]="development().state" data-testid="trend-development">
          <p><span>Entwicklung</span> <strong>{{ development().label }}</strong></p>
          @if (development().detail) {
            <p class="detail">{{ development().detail }}</p>
          }
          <ul class="hints">
            @for (hint of development().hints; track $index) {
              <li>{{ hint }}</li>
            }
          </ul>
          <details>
            <summary>Wie wird das berechnet?</summary>
            <p>{{ method }}</p>
          </details>
        </div>
      </section>
    </tk-card>
  `,
  styleUrls: ['../../ui/chart/chart.css', './grade-trend-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradeTrendCard {
  readonly graded = input.required<readonly GradedEvent[]>();
  readonly scale = input.required<RatingScale>();
  readonly today = input.required<string>();

  protected readonly periods = DEVELOPMENT_PERIODS;
  protected readonly method = DEVELOPMENT_METHOD;
  protected readonly formatDate = formatDate;
  protected readonly periodKey = signal<DevelopmentPeriodKey>('season');
  protected readonly period = computed(() => developmentPeriod(this.periodKey(), this.today(), this.graded()));
  protected readonly chart = computed(() => trendChart(this.graded(), this.scale(), this.period()));
  protected readonly development = computed(() => developmentSummary(this.graded(), this.period(), this.today()));
  protected readonly ariaLabel = computed(() =>
    this.chart().points.length
      ? `${this.scale() === 'levels' ? 'Verlauf der Kompetenzstufen' : 'Notenverlauf (1 ist die beste Note)'}, ${this.period().label}: ${this.chart().summary}`
      : 'Keine benoteten Events in diesem Zeitraum',
  );

  protected setPeriod(value: string): void {
    if (DEVELOPMENT_PERIODS.some((option) => option.value === value)) this.periodKey.set(value as DevelopmentPeriodKey);
  }
}
