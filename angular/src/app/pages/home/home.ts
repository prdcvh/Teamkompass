import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { formatDate, resultText } from '../../core/event';
import { LayoutService } from '../../core/layout.service';
import { todayIso } from '../../core/player';
import { numberLabel } from '../../core/profile';
import { SessionService } from '../../core/session.service';
import { SyncService } from '../../core/sync.service';
import { dashboardFigures, leaders } from '../../core/team';
import { TeamService } from '../../core/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/** Start-Dashboard: Kennzahlen des Teams, nächstes Event und Bestenliste (nur für Trainer mit Daten). */
@Component({
  selector: 'app-home',
  imports: [RouterLink, Button, Card],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  protected readonly team = inject(TeamService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly teamName = environment.teamName;
  protected readonly teamId = environment.teamId;

  protected readonly figures = computed(() => dashboardFigures(this.team.data(), this.team.events(), todayIso()));
  protected readonly board = computed(() => leaders(this.team.data(), this.mobile() ? 5 : 6));
  protected readonly cards = computed(() => {
    const figures = this.figures();
    const { record } = figures;
    return [
      { label: 'Kader', value: String(figures.squad) },
      { label: 'Fit', value: String(figures.fit) },
      { label: 'Events', value: String(figures.events) },
      { label: 'Teamnote', value: numberLabel(figures.teamGrade) },
      { label: 'Bilanz (S-U-N)', value: `${record.wins}-${record.draws}-${record.losses}` },
      { label: 'Tore', value: `${record.goalsFor}:${record.goalsAgainst}` },
      { label: 'Belastung hoch', value: String(figures.highLoad) },
    ];
  });

  protected formatDate = formatDate;
  protected resultText = resultText;
  protected numberLabel = numberLabel;

  ngOnInit(): void {
    if (this.isTrainer()) this.team.start();
  }
}
