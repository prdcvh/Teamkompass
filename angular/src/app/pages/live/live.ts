import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { WakeLockService } from '../../core/device/wake-lock.service';
import { EventsService } from '../../core/events/events.service';
import { LIVE_STEPS, isAway, liveRows, nextStep, pointsLabel } from '../../core/live/live';
import { SquadService } from '../../core/player/squad.service';
import { RatingsService } from '../../core/ratings/ratings.service';
import { SyncService } from '../../core/shell/sync.service';

/**
 * Live-Modus (SCRUM-213): Vollbildansicht für das Training. Große Zeile je anwesendem Spieler mit − links und + rechts;
 * jeder Tipp ändert die Trainingspunkte des Spielers um die eingestellte Schrittweite (auch unter 0). Die Reihenfolge ist
 * alphabetisch und hängt nie von den Punkten ab. Nur Trainer (Route), nur Trainings.
 */
@Component({
  selector: 'app-live',
  imports: [RouterLink],
  templateUrl: './live.html',
  styleUrl: './live.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Live implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  protected readonly ratings = inject(RatingsService);
  private readonly squad = inject(SquadService);
  private readonly eventsService = inject(EventsService);
  protected readonly sync = inject(SyncService);
  private readonly wakeLock = inject(WakeLockService);

  protected readonly eventId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });
  protected readonly step = signal<number>(LIVE_STEPS[0]);
  protected readonly event = this.ratings.event;
  protected readonly isTraining = computed(() => this.event()?.type === 'Training');
  protected readonly ready = computed(() => this.ratings.load() === 'ready' && this.squad.load() === 'ready' && this.eventsService.load() === 'ready');
  protected readonly failed = computed(() => this.ratings.load() === 'error' || this.squad.load() === 'error' || this.eventsService.load() === 'error');
  protected readonly errorText = computed(() => this.ratings.error() || this.squad.error() || this.eventsService.error());

  /** Namen und Reihenfolge ergeben sich nur aus dem Kader: Punkte und Anwesenheit ändern nichts an der Reihenfolge. */
  private readonly rows = computed(() => liveRows(this.squad.players()));
  protected readonly present = computed(() => this.rows().filter((row) => !isAway(this.ratings.ratingFor(row.id).attendance)));
  protected readonly away = computed(() => this.rows().filter((row) => isAway(this.ratings.ratingFor(row.id).attendance)));

  constructor() {
    effect(() => {
      const id = this.eventId();
      untracked(() => {
        if (id) this.ratings.start(id);
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
    this.eventsService.start();
    void this.wakeLock.keepAwake();
  }

  ngOnDestroy(): void {
    this.wakeLock.release();
  }

  protected points(id: string): number {
    return this.ratings.pointsFor(id);
  }

  protected label(points: number): string {
    return pointsLabel(points);
  }

  protected add(id: string, direction: 1 | -1): void {
    this.ratings.addPoints(id, direction * this.step());
  }

  protected cycleStep(): void {
    this.step.set(nextStep(this.step()));
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
