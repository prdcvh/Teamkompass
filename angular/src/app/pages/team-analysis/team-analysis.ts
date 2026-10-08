import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { birthQuarterCounts, positionCoverage, teamStats, teamTrend, thinPositions, trainingFocusCounts } from '../../core/analysis';
import { LayoutService } from '../../core/layout.service';
import { todayIso } from '../../core/player';
import { numberLabel } from '../../core/profile';
import { gradeLabel } from '../../core/rating';
import { injuryRisk } from '../../core/risk';
import { SessionService } from '../../core/session.service';
import { SyncService } from '../../core/sync.service';
import { leaders } from '../../core/team';
import { TeamService } from '../../core/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

interface BarRow {
  readonly label: string;
  readonly value: number;
  /** Balkenbreite in Prozent des größten Werts. */
  readonly percent: number;
}

function bars(rows: readonly { label: string; value: number }[]): BarRow[] {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.map((row) => ({ ...row, percent: Math.round((row.value / max) * 100) }));
}

/** Teamanalyse: Teamform, Kennzahlen, Geburtsquartale, Positionsabdeckung und Trainingsfokus (nur Trainer). */
@Component({
  selector: 'app-team-analysis',
  imports: [RouterLink, Button, Card],
  templateUrl: './team-analysis.html',
  styleUrl: './team-analysis.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamAnalysis implements OnInit {
  protected readonly team = inject(TeamService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly stats = computed(() => teamStats(this.team.events(), this.team.ratingsByEvent(), todayIso()));
  private readonly focus = computed(() => trainingFocusCounts(this.team.events()));
  private readonly quarters = computed(() => birthQuarterCounts(this.team.data().map((entry) => entry.player)));
  private readonly coverage = computed(() => positionCoverage(this.team.data().map((entry) => entry.player)));
  protected readonly thin = computed(() => thinPositions(this.coverage()));
  protected readonly trend = computed(() => teamTrend(this.team.events(), this.team.ratingsByEvent()));

  protected readonly cards = computed(() => {
    const stats = this.stats();
    const { record } = stats;
    const focus = this.focus();
    const quarters = this.quarters();
    return [
      { label: 'Spiele', value: String(stats.games) },
      { label: 'Bilanz', value: `${record.wins} S · ${record.draws} U · ${record.losses} N` },
      { label: 'Torverhältnis', value: `${record.goalsFor}:${record.goalsAgainst}` },
      { label: 'Ø Teamnote', value: gradeLabel(stats.avgGrade) },
      { label: 'Teilnahmequote', value: `${stats.attendanceRate}%` },
      { label: 'Ø Intensität', value: stats.avgIntensity === null ? '-' : stats.avgIntensity.toFixed(1).replace('.', ',') },
      { label: 'Training BB/GGB', value: `${focus['Eigener Ballbesitz']}/${focus['Gegnerischer Ballbesitz']}` },
      { label: 'Training Umschalten', value: String(focus['Umschalten']) },
      { label: 'Geburten Q1/Q2', value: `${quarters.Q1}/${quarters.Q2}` },
      { label: 'Geburten Q3/Q4', value: `${quarters.Q3}/${quarters.Q4}` },
      { label: 'Positionslücken', value: this.thin().length ? String(this.thin().length) : '-' },
    ];
  });

  protected readonly topForm = computed(() => leaders(this.team.data(), 3));
  protected readonly loadWatch = computed(() => {
    const now = new Date();
    return this.team
      .data()
      .map(({ player, items, absences, measurements }) => ({ player, risk: injuryRisk(player, items, absences, measurements, now) }))
      .sort((a, b) => b.risk.percentage - a.risk.percentage)
      .slice(0, 3);
  });

  protected readonly focusRows = computed(() => bars(Object.entries(this.focus()).map(([label, value]) => ({ label, value }))));
  protected readonly quarterRows = computed(() => bars(Object.entries(this.quarters()).map(([label, value]) => ({ label, value }))));
  protected readonly positionRows = computed(() => bars(this.coverage().slice(0, 10).map(([label, value]) => ({ label, value }))));
  protected readonly quarterText = computed(() => {
    const q = this.quarters();
    return `Q1 ${q.Q1}, Q2 ${q.Q2}, Q3 ${q.Q3}, Q4 ${q.Q4}`;
  });

  protected numberLabel = numberLabel;
  protected gradeLabel = gradeLabel;

  ngOnInit(): void {
    if (this.isTrainer()) this.team.start();
  }
}
