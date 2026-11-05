import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { pathFitsPlayer, pathView } from '../../core/learning/learning-path';
import { LearningService } from '../../core/learning/learning.service';
import type { Player } from '../../core/player/player';
import { BreaksStore } from '../../core/planning/breaks-store';
import { ProfileService } from '../../core/profile/profile.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { todayIso } from '../../core/shared/dates';
import { checkInStreak, learningStreak } from '../../core/streaks/streak';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Card } from '../../ui/card/card';

/**
 * Eigene Serien (SCRUM-194) für Spieler und Eltern: Check-ins in Folge und Lern-Wochen in Folge. Nur die eigene Serie,
 * keine Rangliste und kein Vergleich. In Pausen (Ferien, Winterpause), bei Abwesenheit und bei einer eingetragenen
 * Verletzung ruht die Serie – sie reißt nicht und wächst nicht. Die Rechnung steht in `core/streaks/streak.ts`.
 */
@Component({
  selector: 'tk-streak-panel',
  imports: [Card],
  templateUrl: './streak-panel.html',
  styleUrl: './streak-panel.css',
  styles: ':host { display: contents; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreakPanel implements OnInit {
  readonly player = input.required<Player>();

  private readonly reports = inject(SelfReportsService);
  private readonly profile = inject(ProfileService);
  private readonly records = inject(RecordsStateService);
  private readonly breaks = inject(BreaksStore);
  private readonly learning = inject(LearningService);
  private readonly session = inject(SessionService);
  private readonly team = inject(CurrentTeam);

  protected readonly parent = computed(() => this.session.role() === 'parent');
  private readonly now = signal(new Date());
  /** Ohne Einwilligung sind Abwesenheiten nicht lesbar: dann ließe sich der Pause-Schutz nicht zusichern, also keine Serie. */
  private readonly allowed = computed(() => this.reports.canAnswer() && !this.player().healthHidden);

  private readonly pauses = computed(() => ({ breaks: this.breaks.breaks(), absences: this.records.absences() }));

  /** Check-in-Serie; erst zeigen, wenn Angaben, Termine, Abwesenheiten und Pausen geladen sind (sonst flackert die Zahl, und ohne Pausen
   * wäre sie zu niedrig). */
  protected readonly checkIn = computed(() => {
    if (!this.allowed() || !this.reports.loaded() || this.reports.failed() || this.profile.loading() || !this.records.ready() || this.breaks.load() !== 'ready') return null;
    const answered = new Set(this.reports.reports().keys());
    return checkInStreak(this.profile.items(), answered, this.pauses(), this.now());
  });

  /** Lern-Serie; nur, wenn der Trainer schon etwas bestätigt hat. */
  protected readonly lernen = computed(() => {
    if (!this.allowed() || this.learning.load() !== 'ready' || !this.records.ready() || this.breaks.load() !== 'ready') return null;
    const progress = this.learning.progressOf(this.player().id);
    const dates = Object.values(progress).flatMap((levels) => Object.values(levels));
    if (dates.length === 0) return null;
    const views = this.learning
      .paths()
      .map((path) => pathView(path, progress))
      .filter((view) => view.done > 0 || pathFitsPlayer(view.path, this.player(), this.team.label()));
    const nothingToDo = views.length > 0 && views.every((view) => view.done >= view.total);
    return learningStreak(dates, this.pauses(), todayIso(this.now()), nothingToDo);
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    effect(() => {
      if (this.allowed()) untracked(() => this.learning.start());
    });
  }

  ngOnInit(): void {
    this.breaks.start();
  }
}
