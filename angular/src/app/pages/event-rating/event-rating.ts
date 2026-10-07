import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { INTENSITIES, formatDate, resultText } from '../../core/event';
import { EventsService } from '../../core/events.service';
import { LayoutService } from '../../core/layout.service';
import { type Player, consentRevokedMessage, isConsentRevoked } from '../../core/player';
import {
  ATTENDANCES,
  ATTENDANCE_LABELS,
  type Attendance,
  GRADE_FIELDS,
  GRADE_LABELS,
  MAX_GOALS_OR_ASSISTS,
  MAX_NOTE_LENGTH,
  RATING_VIEWS,
  type RatingField,
  type RatingView,
  calculatedGrade,
  gradeLabel,
  matchesView,
  progress,
} from '../../core/rating';
import { RatingsService } from '../../core/ratings.service';
import { SquadService } from '../../core/squad.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/**
 * Event bewerten (Figma: Bewertungsmatrix Desktop, Stepper Handy): je Spieler Anwesenheit, vier Teilnoten
 * (daraus die Gesamtnote), bei Spielen Minuten/Tore/Vorlagen, sichtbares Feedback und interne Notiz.
 */
@Component({
  selector: 'app-event-rating',
  imports: [RouterLink, Button, Card],
  templateUrl: './event-rating.html',
  styleUrl: './event-rating.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRating implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly ratings = inject(RatingsService);
  protected readonly squad = inject(SquadService);
  protected readonly eventsService = inject(EventsService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  protected readonly attendances = ATTENDANCES;
  protected readonly attendanceLabels = ATTENDANCE_LABELS;
  protected readonly gradeFields = GRADE_FIELDS;
  protected readonly gradeLabels = GRADE_LABELS;
  protected readonly gradeOptions = GRADE_OPTIONS;
  protected readonly views = RATING_VIEWS;
  protected readonly limits = { note: MAX_NOTE_LENGTH, goals: MAX_GOALS_OR_ASSISTS };

  private readonly eventId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });
  protected readonly view = signal<RatingView>('all');
  protected readonly index = signal(0);

  protected readonly event = this.ratings.event;
  protected readonly isGame = computed(() => this.event()?.type === 'Spiel');
  protected readonly ready = computed(() => this.ratings.load() === 'ready' && this.squad.load() === 'ready' && this.eventsService.load() === 'ready');
  protected readonly failed = computed(() => this.ratings.load() === 'error' || this.squad.load() === 'error' || this.eventsService.load() === 'error');
  protected readonly errorText = computed(() => this.ratings.error() || this.squad.error() || this.eventsService.error());

  protected readonly allPlayers = computed(() => [...this.squad.players()].sort((a, b) => a.number - b.number));
  protected readonly players = computed(() => this.allPlayers().filter((player) => matchesView(this.ratings.ratingFor(player.id), this.view())));
  protected readonly progress = computed(() => progress(this.allPlayers().map((player) => this.ratings.ratingFor(player.id))));
  protected readonly current = computed(() => this.players()[Math.min(this.index(), Math.max(0, this.players().length - 1))] ?? null);
  protected readonly currentIndex = computed(() => Math.min(this.index(), Math.max(0, this.players().length - 1)));

  constructor() {
    // Das Event wechselt mit der Adresse: Abos neu starten, Stepper und Filter zurücksetzen.
    effect(() => {
      const id = this.eventId();
      untracked(() => {
        this.index.set(0);
        this.view.set('all');
        if (id) this.ratings.start(id);
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
    this.eventsService.start();
  }

  protected formatDate = formatDate;
  protected resultText = resultText;
  protected gradeLabel = gradeLabel;

  protected revoked(player: Player): boolean {
    return isConsentRevoked(player);
  }

  protected revokedMessage(player: Player): string {
    return consentRevokedMessage(player.name);
  }

  protected total(player: Player): string {
    return gradeLabel(calculatedGrade(this.ratings.ratingFor(player.id)));
  }

  protected intensity(): string {
    return INTENSITIES.find((entry) => entry.value === this.event()?.intensity)?.label ?? '';
  }

  protected attendanceOf(player: Player): Attendance {
    return this.ratings.ratingFor(player.id).attendance;
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected set(player: Player, field: RatingField, value: string): void {
    this.ratings.setField(player.id, field, value);
  }

  protected setNote(player: Player, value: string): void {
    this.ratings.setPrivateNote(player.id, value);
  }

  protected previous(): void {
    this.index.set(Math.max(0, this.currentIndex() - 1));
  }

  protected next(): void {
    this.index.set(Math.min(this.players().length - 1, this.currentIndex() + 1));
  }

  protected jump(value: string): void {
    this.index.set(Number(value));
  }

  protected setView(value: string): void {
    this.view.set(value as RatingView);
    this.index.set(0);
  }

  protected retry(): void {
    this.ratings.stop();
    this.ratings.start(this.eventId());
    if (this.squad.load() === 'error') {
      this.squad.stop();
      this.squad.start();
    }
    if (this.eventsService.load() === 'error') {
      this.eventsService.stop();
      this.eventsService.start();
    }
  }
}
