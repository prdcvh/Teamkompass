import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { type ClubComparisonEntry, keyPlayers, mainFocus } from '../../core/club/club-comparison';
import { ClubComparisonService } from '../../core/club/club-comparison.service';
import { scoreLabel } from '../../core/ratings/rating-scale';
import { RatingScaleService } from '../../core/ratings/rating-scale.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

interface TeamView {
  readonly entry: ClubComparisonEntry;
  readonly own: boolean;
  readonly focus: string;
  readonly keys: readonly { readonly id: string; readonly name: string; readonly grade: string }[];
}

/**
 * Vereinsvergleich in der Teamanalyse (SCRUM-197): die Teams des eigenen Vereins nebeneinander – Teilnahme, Belastung
 * (Ø Anstrengung), Trainingsfokus, Ø Teamnote und Schlüsselspieler. Nur Trainer; fremde Vereine erscheinen nie.
 */
@Component({
  selector: 'tk-club-comparison-card',
  imports: [Button, Card],
  template: `
    <tk-card>
      <section class="panel" data-testid="club-comparison" aria-labelledby="club-comparison-title">
        <h2 id="club-comparison-title">Vereinsvergleich</h2>
        @switch (comparison.state()) {
          @case ('no-club') {
            <p class="muted">Dein Team gehört noch zu keinem Verein in TeamKompass – deshalb gibt es keinen Vergleich.</p>
          }
          @case ('off') {
            <p class="muted">
              Der Vergleich mit den anderen Teams deines Vereins ist ausgeschaltet. Der Vereinsadmin kann ihn in der
              Vereinsübersicht einschalten.
            </p>
          }
          @case ('error') {
            <p class="error" role="alert">Der Vereinsvergleich konnte nicht geladen werden.</p>
            <button tkButton type="button" (click)="comparison.load()">Erneut versuchen</button>
          }
          @case ('ready') {
            <p class="muted">
              Nur Teams deines Vereins{{ clubName() ? ' (' + clubName() + ')' : '' }}. Gesundheitsdaten, Notizen und
              Elternangaben anderer Teams werden nicht geteilt. Noten vergibt jedes Trainerteam selbst – Unterschiede
              können auch an der Bewertung liegen.
            </p>
            @if (teams().length <= 1) {
              <p class="muted">Noch keine anderen Teams im Vergleich. Sie erscheinen, sobald ihr Trainer die App einmal geöffnet hat.</p>
            }
            <div class="teams">
              @for (team of teams(); track team.entry.teamId) {
                <article class="team" [class.own]="team.own" [attr.data-team]="team.entry.teamId">
                  <h3>{{ team.entry.teamName || 'Team' }}{{ team.own ? ' (dein Team)' : '' }}</h3>
                  <dl class="facts">
                    <div><dt>Spieler</dt><dd>{{ team.entry.team.playerCount }}</dd></div>
                    <div><dt>Teilnahme</dt><dd>{{ percent(team.entry.team.attendanceRate) }}</dd></div>
                    <div><dt>Ø Anstrengung</dt><dd>{{ decimal(team.entry.team.avgExertion) }}</dd></div>
                    <div><dt>Ø Teamnote</dt><dd>{{ grade(team.entry.team.avgGrade) }}</dd></div>
                    <div><dt>Trainings · Spiele</dt><dd>{{ team.entry.team.trainings }} · {{ team.entry.team.games }}</dd></div>
                    <div><dt>Trainingsfokus</dt><dd>{{ team.focus }}</dd></div>
                  </dl>
                  <h4>Schlüsselspieler</h4>
                  @if (team.keys.length === 0) {
                    <p class="muted">Noch keine Bewertungen.</p>
                  } @else {
                    <ul class="keys">
                      @for (player of team.keys; track player.id) {
                        <li><span>{{ player.name }}</span><span class="badge">{{ player.grade }}</span></li>
                      }
                    </ul>
                  }
                  @if (!team.own && team.entry.updatedAt) {
                    <p class="stand">Stand {{ day(team.entry.updatedAt) }}</p>
                  }
                </article>
              }
            </div>
          }
          @default {
            <p class="muted" role="status">Vereinsvergleich wird geladen …</p>
          }
        }
      </section>
    </tk-card>
  `,
  styles: `
    :host { display: block; }
    .panel { display: grid; gap: var(--tk-space-3); min-width: 0; }
    h2, h3, h4, p { margin: 0; }
    h2 { font-size: var(--tk-text-lg); }
    h3 { font-size: var(--tk-text-md, 1rem); overflow-wrap: anywhere; }
    h4 { font-size: var(--tk-text-sm); color: var(--tk-muted); font-weight: 600; }
    .muted, .stand { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    .error { color: var(--tk-red); font-weight: 600; }
    .teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: var(--tk-space-3); }
    .team { display: grid; align-content: start; gap: var(--tk-space-2); min-width: 0; padding: var(--tk-space-4); border: 1px solid var(--tk-line); border-radius: var(--tk-radius-lg); background: var(--tk-surface); }
    .team.own { border-color: var(--tk-green); }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tk-space-2); margin: 0; }
    .facts div { min-width: 0; }
    dt { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    dd { margin: 0; font-weight: 700; overflow-wrap: anywhere; }
    .keys { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .keys li { display: flex; justify-content: space-between; gap: var(--tk-space-2); min-width: 0; overflow-wrap: anywhere; }
    .badge { flex: none; font-weight: 700; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubComparisonCard implements OnInit {
  protected readonly comparison = inject(ClubComparisonService);
  private readonly current = inject(CurrentTeam);
  private readonly scale = inject(RatingScaleService).scale;
  protected readonly clubName = this.current.clubName;

  protected readonly teams = computed<TeamView[]>(() => {
    const ownId = this.current.id();
    return this.comparison.entries().map((entry) => {
      const focus = mainFocus(entry.team);
      return {
        entry,
        own: entry.teamId === ownId,
        focus: focus ? `${focus.name} (${focus.share}\u00a0%)` : '–',
        keys: keyPlayers(entry).map((player) => ({ id: player.id, name: player.name, grade: this.grade(player.average) })),
      };
    });
  });

  ngOnInit(): void {
    void this.comparison.load();
  }

  protected grade(value: number | null): string {
    return scoreLabel(value, this.scale());
  }

  protected percent(value: number | null): string {
    return value === null ? '–' : `${value}\u00a0%`;
  }

  protected decimal(value: number | null): string {
    return value === null ? '–' : value.toFixed(1).replace('.', ',');
  }

  protected day(value: Date): string {
    return value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
