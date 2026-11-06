import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { COHORT_BAND_LABELS, type CohortValue, cohortComparison } from '../../core/club/club-comparison';
import { ClubComparisonService } from '../../core/club/club-comparison.service';
import type { Player } from '../../core/player/player';
import { scoreLabel } from '../../core/ratings/rating-scale';
import { RatingScaleService } from '../../core/ratings/rating-scale.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { TeamService } from '../../core/team/team.service';
import { Card } from '../../ui/card/card';

/**
 * Spieler im Vergleich zu seinem Jahrgang im Verein (SCRUM-197): alle gleich alten Spieler aller Teams des eigenen
 * Vereins als Gesamtheit – grob als Drittel und „besser als X %“, keine Rangliste und keine Namen anderer Spieler.
 * Nur für Trainer (offene Frage an den PO, ob Spieler/Eltern das sehen sollen). Erscheint nur, wenn der Vereinsadmin den
 * Vergleich eingeschaltet hat und es in anderen Teams Spieler desselben Jahrgangs gibt.
 */
@Component({
  selector: 'tk-cohort-card',
  imports: [Card],
  template: `
    @if (view(); as v) {
      <tk-card>
        <section class="panel" data-testid="cohort" aria-labelledby="cohort-title">
          <h2 id="cohort-title">Im Jahrgang {{ v.birthYear }} im Verein</h2>
          <p class="muted">
            Verglichen mit {{ v.others }} {{ v.others === 1 ? 'anderem Spieler' : 'anderen Spielern' }} des Jahrgangs aus
            {{ v.teams }} {{ v.teams === 1 ? 'Team' : 'Teams' }} deines Vereins ({{ v.otherTeamPlayers }} aus anderen Teams). Nur für Trainer sichtbar.
          </p>
          <dl class="facts">
            <div>
              <dt>Notenschnitt</dt>
              @if (v.grade; as g) {
                <dd>
                  <strong>{{ band(g) }}</strong>
                  <span>{{ grade(g.value) }} · Jahrgang Ø {{ grade(g.cohortAverage) }} · besser als {{ g.betterThan }} %</span>
                </dd>
              } @else {
                <dd><span>Noch keine Vergleichswerte.</span></dd>
              }
            </div>
            <div>
              <dt>Teilnahme</dt>
              @if (v.attendance; as a) {
                <dd>
                  <strong>{{ band(a) }}</strong>
                  <span>{{ a.value }} % · Jahrgang Ø {{ a.cohortAverage }} % · höher als bei {{ a.betterThan }} %</span>
                </dd>
              } @else {
                <dd><span>Noch keine Vergleichswerte.</span></dd>
              }
            </div>
          </dl>
          <p class="muted">Noten vergibt jedes Trainerteam selbst – der Vergleich zeigt eine Richtung, keine genaue Rangfolge.</p>
        </section>
      </tk-card>
    }
  `,
  styles: `
    :host { display: block; }
    .panel { display: grid; gap: var(--tk-space-3); min-width: 0; }
    h2, p { margin: 0; }
    h2 { font-size: var(--tk-text-lg); }
    .muted { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--tk-space-3); margin: 0; }
    .facts div { display: grid; gap: 4px; min-width: 0; }
    dt { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    dd { display: grid; gap: 2px; margin: 0; overflow-wrap: anywhere; }
    dd span { color: var(--tk-muted); font-size: var(--tk-text-sm); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CohortCard {
  private readonly comparison = inject(ClubComparisonService);
  private readonly session = inject(SessionService);
  private readonly current = inject(CurrentTeam);
  private readonly scale = inject(RatingScaleService).scale;
  private readonly team = inject(TeamService);

  readonly player = input.required<Player>();

  private readonly trainer = computed(() => this.session.role() === 'trainer');
  protected readonly view = computed(() => {
    if (!this.trainer() || this.comparison.state() !== 'ready') return null;
    return cohortComparison(this.player().id, this.current.id(), this.comparison.entries());
  });

  constructor() {
    effect(() => {
      if (!this.trainer() || !this.current.clubId()) return;
      untracked(() => {
        // Eigene Werte frisch aus den Teamdaten (gleiche Zahlen wie in der Teamanalyse), andere Teams aus den Kurzfassungen.
        this.team.start();
        void this.comparison.load();
      });
    });
  }

  protected band(value: CohortValue): string {
    return COHORT_BAND_LABELS[value.band];
  }

  protected grade(value: number): string {
    return scoreLabel(value, this.scale());
  }
}
