import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DEVELOPMENT_GROUPS,
  type DevelopmentCell,
  GROUP_LABELS,
  QUARTER_LABELS,
  SMALL_GROUP_BELOW,
  UNCLASSIFIED_REASON_TEXT,
  developmentView,
} from '../../core/analysis/development-view';
import { DevelopmentViewService } from '../../core/analysis/development-view.service';
import { SessionService } from '../../core/auth/session.service';
import { MATURITY_BAND_NOTE } from '../../core/records/maturity-note';
import { SquadService } from '../../core/player/squad.service';
import { addDays, formatDate, isIsoDate, todayIso } from '../../core/shared/dates';
import { TeamService } from '../../core/team/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Entwicklungsansicht in der Teamanalyse (SCRUM-258, nur Trainer): Spieler, Einsatzminuten und Verfügbarkeit je
 * Geburtsquartal und Reifegruppe. Rein lesend – ein Wechsel von Zeitraum oder Jahrgang rechnet nur die Auswertung neu und
 * verändert weder Noten noch Rangfolge, Aufstellung oder Stammdaten. Die Rechnung steht in `development-view.ts`.
 */
@Component({
  selector: 'tk-development-view-card',
  imports: [RouterLink, Button, Card],
  templateUrl: './development-view-card.html',
  styleUrl: './development-view-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopmentViewCard {
  protected readonly service = inject(DevelopmentViewService);
  private readonly team = inject(TeamService);
  private readonly squad = inject(SquadService);
  private readonly session = inject(SessionService);

  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly open = signal(false);
  protected readonly today = todayIso();
  protected readonly from = signal(addDays(this.today, -90));
  protected readonly to = signal(this.today);
  protected readonly cohort = signal('all');

  protected readonly groups = DEVELOPMENT_GROUPS;
  protected readonly groupLabels = GROUP_LABELS;
  protected readonly bandNote = MATURITY_BAND_NOTE;
  protected readonly quarterLabels = QUARTER_LABELS;
  protected readonly smallBelow = SMALL_GROUP_BELOW;

  protected readonly periodValid = computed(() => isIsoDate(this.from()) && isIsoDate(this.to()) && this.from() <= this.to());

  protected readonly view = computed(() => {
    if (!this.periodValid() || this.service.state() !== 'ready') return null;
    return developmentView({
      players: this.squad.players(),
      data: this.service.data(),
      events: this.team.events(),
      ratings: this.team.ratingsByEvent(),
      filter: { from: this.from(), to: this.to(), cohort: this.cohort() },
      today: this.today,
    });
  });

  /** Jahrgänge zur Auswahl; läuft unabhängig vom Filter, damit die Auswahl beim Wechsel nicht schrumpft. */
  protected readonly cohorts = computed(() => [...new Set(this.squad.players().map((player) => (isIsoDate(player.birthdate) ? player.birthdate.slice(0, 4) : '')).filter(Boolean))].sort());

  protected readonly reasons = computed(() => (this.view()?.reasons ?? []).map((entry) => ({ ...entry, text: UNCLASSIFIED_REASON_TEXT[entry.reason] })));

  protected toggle(): void {
    this.open.update((value) => !value);
    if (this.open() && this.service.state() === 'idle') void this.service.load();
  }

  protected reload(): void {
    void this.service.load();
  }

  protected setFrom(value: string): void {
    this.from.set(value);
  }

  protected setTo(value: string): void {
    this.to.set(value);
  }

  protected setCohort(value: string): void {
    this.cohort.set(value);
  }

  protected preset(days: number): void {
    this.to.set(this.today);
    this.from.set(addDays(this.today, -days));
  }

  protected day(iso: string): string {
    return formatDate(iso);
  }

  protected percent(part: number, whole: number): string {
    return whole ? `${Math.round((part / whole) * 100)} %` : '–';
  }

  protected small(cell: DevelopmentCell): boolean {
    return cell.players > 0 && cell.players < SMALL_GROUP_BELOW;
  }
}
