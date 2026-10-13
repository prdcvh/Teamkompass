import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { formatDate, resultText } from '../../core/event';
import { LayoutService } from '../../core/layout.service';
import { PITCH_BANDS, formationName, lineupIsEmpty, onPitchCount } from '../../core/lineup';
import { LineupService } from '../../core/lineup.service';
import { todayIso } from '../../core/player';
import { numberLabel } from '../../core/profile';
import { SessionService } from '../../core/session.service';
import { SquadService } from '../../core/squad.service';
import { SyncService } from '../../core/sync.service';
import { dashboardFigures, leaders } from '../../core/team';
import { TeamService } from '../../core/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/** Beschriftung der Bänder von vorn nach hinten (Reihenfolge von PITCH_BANDS umgekehrt). */
const BAND_LABELS: readonly string[] = ['Angriff', 'Offensiv', 'Mittelfeld', 'Defensiv', 'Abwehr'];

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
  protected readonly lineup = inject(LineupService);
  private readonly squad = inject(SquadService);
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

  /** Kurzansicht der Startelf: Zeilen von vorn (Angriff) nach hinten (Tor), nur mit besetzten Positionen. */
  protected readonly lineupSummary = computed(() => {
    const assignments = this.lineup.assignments();
    const names = new Map(this.squad.players().map((player) => [player.id, player.name]));
    const rows = [...PITCH_BANDS]
      .reverse()
      .map((zones, index) => ({ label: BAND_LABELS[index], names: zones.flatMap((zone) => assignments[zone]).map((id) => names.get(id) ?? '') }))
      .filter((row) => row.names.length > 0);
    const keeper = assignments.TW.map((id) => names.get(id) ?? '');
    if (keeper.length) rows.push({ label: 'Tor', names: keeper });
    return { empty: lineupIsEmpty(assignments), formation: formationName(assignments), count: onPitchCount(assignments), rows };
  });

  protected formatDate = formatDate;
  protected resultText = resultText;
  protected numberLabel = numberLabel;

  ngOnInit(): void {
    if (this.isTrainer()) {
      this.team.start();
      this.lineup.start();
    }
  }
}
