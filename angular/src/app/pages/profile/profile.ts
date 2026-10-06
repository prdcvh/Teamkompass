import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { EventsService } from '../../core/events.service';
import { LayoutService } from '../../core/layout.service';
import { type Player, ageFromBirthdate, formatDate, positionText, todayIso } from '../../core/player';
import { PlayerHistoryService } from '../../core/player-history.service';
import {
  availability,
  averageGrade,
  evaluationsFor,
  gradeToPercent,
  gradedEvaluations,
  historyRows,
  insightCards,
  skillAverages,
  trendChart,
  trendPoints,
} from '../../core/profile';
import { gradeLabel } from '../../core/rating';
import { SquadService } from '../../core/squad.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Status } from '../../ui/status/status';

/**
 * Spielerprofil (Figma: Profil Desktop/Handy): Spielerauswahl, Kopf mit Ø Note, Notenverlauf, Kompetenzprofil,
 * Anwesenheit, Kennzahlen und Eventhistorie. Nur lesend; die Auswertungen liegen in `core/profile.ts`.
 * Der Spieler steht in der Adresse (`/profile/:id`), damit sich ein Profil verlinken lässt.
 */
@Component({
  selector: 'app-profile',
  imports: [RouterLink, Button, Card, Status],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly squad = inject(SquadService);
  protected readonly eventsService = inject(EventsService);
  protected readonly history = inject(PlayerHistoryService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  /** „Heute“ für die Quoten: zukünftige Events zählen nicht. */
  protected readonly today = todayIso();

  private readonly routeId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });

  protected readonly players = computed(() => [...this.squad.players()].sort((a, b) => a.number - b.number));
  /** Die Adresse nennt einen Spieler, den es nicht (mehr) gibt. */
  protected readonly notFound = computed(() => this.routeId() !== '' && !this.players().some((player) => player.id === this.routeId()));
  protected readonly player = computed<Player | null>(() => {
    const id = this.routeId();
    if (id) return this.players().find((player) => player.id === id) ?? null;
    return this.players()[0] ?? null;
  });

  protected readonly failed = computed(() => this.squad.load() === 'error' || this.eventsService.load() === 'error' || this.history.load() === 'error');
  protected readonly errorText = computed(() => this.squad.error() || this.eventsService.error() || this.history.error());
  protected readonly ready = computed(() => {
    if (this.squad.load() !== 'ready' || this.eventsService.load() !== 'ready') return false;
    return this.player() === null || this.history.load() === 'ready';
  });

  private readonly evaluations = computed(() => evaluationsFor(this.eventsService.events(), this.history.ratings()));
  private readonly graded = computed(() => gradedEvaluations(this.evaluations()));

  protected readonly average = computed(() => averageGrade(this.graded()));
  protected readonly chart = computed(() => trendChart(trendPoints(this.graded())));
  protected readonly skills = computed(() => skillAverages(this.graded()));
  protected readonly availability = computed(() => availability(this.evaluations(), this.today));
  protected readonly cards = computed(() => insightCards(this.evaluations(), this.today));
  protected readonly rows = computed(() => historyRows(this.graded(), this.today));
  protected readonly chartSummary = computed(() => {
    const points = this.chart().points;
    if (!points.length) return 'Noch keine benoteten Events.';
    const last = points[points.length - 1];
    return `Notenverlauf über ${points.length} benotete Events, zuletzt ${gradeLabel(last.grade)}.`;
  });

  constructor() {
    // Spieler oder Events ändern sich: die Abos auf die Bewertungen anpassen.
    effect(() => {
      const ready = this.squad.load() === 'ready' && this.eventsService.load() === 'ready';
      const id = this.player()?.id ?? null;
      const eventIds = this.eventsService.events().map((event) => event.id);
      untracked(() => {
        if (ready) this.history.watch(id, eventIds);
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
    this.eventsService.start();
  }

  protected gradeLabel = gradeLabel;
  protected gradeToPercent = gradeToPercent;
  protected positionText = positionText;
  protected formatDate = formatDate;

  protected age(player: Player): string {
    const age = ageFromBirthdate(player.birthdate);
    return age === null ? '–' : `${age} Jahre`;
  }

  /** „Verletzt (ca. bis 01.12.2026)“ */
  protected statusText(player: Player): string {
    return player.status === 'Verletzt' && player.injuryUntil ? `Verletzt (ca. bis ${formatDate(player.injuryUntil)})` : player.status;
  }

  protected consentText(player: Player): string {
    if (player.consentStatus === 'granted') return `dokumentiert${player.consentDate ? ` am ${formatDate(player.consentDate)}` : ''}`;
    if (player.consentStatus === 'revoked') return 'widerrufen – Datenprüfung erforderlich';
    return 'noch offen';
  }

  protected select(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) void this.router.navigate(['/profile', id]);
  }

  protected retry(): void {
    if (this.squad.load() === 'error') this.squad.start();
    if (this.eventsService.load() === 'error') this.eventsService.start();
    if (this.history.load() === 'error') this.history.retry();
  }
}
