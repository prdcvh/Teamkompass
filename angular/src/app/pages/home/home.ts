import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { formatDate, resultText } from '../../core/events/event';
import { LayoutService } from '../../core/shell/layout.service';
import { formationName, lineupIsEmpty, onPitchCount, pitchMarkers } from '../../core/lineup/lineup';
import { PITCH_BANDS } from '../../core/lineup/pitch';
import { LineupService } from '../../core/lineup/lineup.service';
import { todayIso } from '../../core/shared/dates';
import { numberLabel } from '../../core/profile/profile';
import { SessionService } from '../../core/auth/session.service';
import { SquadService } from '../../core/player/squad.service';
import { SyncService } from '../../core/shell/sync.service';
import { smoothPath } from '../../core/chart-path';
import { type TeamEvent } from '../../core/events/event';
import { gradeLabel } from '../../core/ratings/rating';
import { FORM_LENGTH, type FormTrend, countdownLabel, dashboardFigures, leaders, upcomingEvents } from '../../core/team/team';
import { TeamService } from '../../core/team/team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { BreakNotice } from '../../ui/break-notice/break-notice';
import { InstallHint } from '../../ui/install-hint/install-hint';
import { Weather } from '../../ui/weather/weather';
import { HomeBoard } from './home-board/home-board';
import { HomeLineup } from './home-lineup/home-lineup';

/** Beschriftung der Bänder von vorn nach hinten (Reihenfolge von PITCH_BANDS umgekehrt). */
const BAND_LABELS: readonly string[] = ['Angriff', 'Offensiv', 'Mittelfeld', 'Defensiv', 'Abwehr'];

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Größe der Mini-Formkurve (SVG-Einheiten); Note 1 oben, Note 6 unten. */
const SPARK_WIDTH = 96;
const SPARK_HEIGHT = 28;
const SPARK_PAD = 4;

const TREND_TEXT: Record<Exclude<FormTrend, null>, string> = { besser: 'Form steigt', schlechter: 'Form fällt', gleich: 'Form stabil' };

/** Start-Dashboard: Kennzahlen des Teams, nächstes Event und Bestenliste (nur für Trainer mit Daten). */
@Component({
  selector: 'app-home',
  imports: [RouterLink, Button, Card, InstallHint, Weather, BreakNotice, HomeLineup, HomeBoard],
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
  protected readonly board = computed(() =>
    leaders(this.team.data(), this.mobile() ? 5 : 6).map((entry) => ({
      ...entry,
      spark: this.spark(entry.recent),
      trendText: entry.trend ? TREND_TEXT[entry.trend] : '',
      tone: entry.grade <= 2 ? 'good' : entry.grade <= 3 ? 'ok' : 'weak',
      initials: entry.player.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
    })),
  );
  protected readonly formLength = FORM_LENGTH;

  /** Die nächsten drei Events: das erste groß, die anderen als kurze Liste. */
  protected readonly upcoming = computed(() => {
    const today = todayIso();
    return upcomingEvents(this.team.events(), today, 3).map((event) => ({ event, ...this.dateParts(event), countdown: countdownLabel(event.date, today) }));
  });

  /** Spieler als Punkte auf dem Mini-Spielfeld; am Desktop liegt das Feld quer (eigenes Tor links). */
  protected readonly markers = computed(() => {
    const horizontal = !this.mobile();
    return pitchMarkers(this.lineup.assignments(), this.squad.players()).map((marker) => ({
      ...marker,
      label: marker.name.split(/\s+/)[0] ?? '',
      keeper: marker.zone === 'TW',
      left: horizontal ? 100 - marker.y : marker.x,
      // Am Handy rückt der Torwart etwas nach oben, damit sein Name nicht über den Feldrand ragt.
      top: horizontal ? marker.x : Math.min(marker.y, 87),
    }));
  });
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

  private spark(grades: readonly number[]) {
    const inner = SPARK_HEIGHT - SPARK_PAD * 2;
    const step = grades.length > 1 ? (SPARK_WIDTH - SPARK_PAD * 2) / (grades.length - 1) : 0;
    const points = grades.map((grade, index) => ({
      x: grades.length > 1 ? SPARK_PAD + index * step : SPARK_WIDTH / 2,
      y: SPARK_PAD + ((Math.min(Math.max(grade, 1), 6) - 1) / 5) * inner,
    }));
    return { width: SPARK_WIDTH, height: SPARK_HEIGHT, path: smoothPath(points), last: points[points.length - 1] ?? null, label: grades.map(gradeLabel).join(', ') };
  }

  private dateParts(event: TeamEvent) {
    const [year, month, day] = event.date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { day: String(day), month: MONTHS[month - 1] ?? '', weekday: WEEKDAYS[weekday] ?? '' };
  }

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
