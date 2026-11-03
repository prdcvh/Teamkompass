import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LoadCurvePoint } from '../../core/analysis/load-curve';
import { CURVE_CHART_DESKTOP, CURVE_CHART_MOBILE, loadCurveChart } from '../../core/analysis/load-curve-chart';
import { Card } from '../../ui/card/card';

/** Belastungskurve im Spielerprofil (SCRUM-176): Müdigkeit, Fitness und Form der letzten 12 Wochen. Nur Trainer (Profilseite). */
@Component({
  selector: 'tk-load-curve-card',
  imports: [Card],
  template: `
    <tk-card>
      <section class="load-curve" aria-labelledby="load-curve-title">
        <h2 id="load-curve-title">Belastungskurve</h2>
        @if (chart().current; as now) {
          <ul class="legend" aria-label="Werte heute">
            <li class="fatigue"><span class="swatch"></span>Müdigkeit (7 Tage) <strong>{{ now.fatigue }}</strong></li>
            <li class="fitness"><span class="swatch"></span>Fitness (28 Tage) <strong>{{ now.fitness }}</strong></li>
            <li class="form"><span class="swatch"></span>Form <strong>{{ signed(now.form) }}</strong></li>
          </ul>
          <svg class="chart" [attr.viewBox]="'0 0 ' + chart().width + ' ' + chart().height" role="img" [attr.aria-label]="chart().summary">
            @for (line of chart().grid; track line.y) {
              <line x1="54" [attr.y1]="line.y" [attr.x2]="chart().width - 24" [attr.y2]="line.y" class="grid" [class.zero]="line.zero" />
              <text x="46" [attr.y]="line.y + 4" class="axis" text-anchor="end">{{ line.label }}</text>
            }
            @for (tick of chart().ticks; track tick.x) {
              <text [attr.x]="tick.x" [attr.y]="chart().height - 10" class="axis small" [attr.text-anchor]="tick.anchor">{{ tick.label }}</text>
            }
            <path [attr.d]="chart().fitness" class="curve fitness" />
            <path [attr.d]="chart().fatigue" class="curve fatigue" />
            <path [attr.d]="chart().form" class="curve form" />
          </svg>
          <p class="hint">
            Müdigkeit und Fitness sind abklingende Mittel der Belastung (Minuten × Anstrengung) über 7 bzw. 28 Tage, je pro Woche
            gerechnet: Ältere Einheiten zählen immer weniger, statt nach einer Woche ganz herauszufallen. Form = Fitness − Müdigkeit;
            unter 0 heißt, der Spieler ist gerade mehr belastet als gewohnt.
          </p>
        } @else {
          <p class="hint">Noch keine Belastung eingetragen – die Kurve erscheint mit dem ersten besuchten Termin.</p>
        }
      </section>
    </tk-card>
  `,
  styleUrls: ['../../ui/chart/chart.css', './load-curve-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadCurveCard {
  readonly curve = input.required<readonly LoadCurvePoint[]>();
  /** Handybreite: schmaleres Diagramm mit größerer Schrift. */
  readonly compact = input(false);
  protected readonly chart = computed(() => loadCurveChart(this.curve(), this.compact() ? CURVE_CHART_MOBILE : CURVE_CHART_DESKTOP));

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }
}
