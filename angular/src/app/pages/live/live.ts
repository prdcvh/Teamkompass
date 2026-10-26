import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { WakeLockService } from '../../core/device/wake-lock.service';
import { EventsService } from '../../core/events/events.service';
import {
  MAX_CUSTOM_STEP,
  MIN_CUSTOM_STEP,
  UNDO_VISIBLE_MS,
  type LiveChange,
  changeLabel,
  createTapGuard,
  deviceStorage,
  feedbackText,
  isAway,
  liveRows,
  loadStepPrefs,
  parseCustomStep,
  pointsLabel,
  popChange,
  pushChange,
  saveStepPrefs,
  stepOptions,
} from '../../core/live/live';
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
  private readonly saved = loadStepPrefs(deviceStorage());
  protected readonly step = signal<number>(this.saved.step);
  private readonly custom = signal<number | null>(this.saved.custom);
  protected readonly options = computed(() => stepOptions(this.custom()));
  protected readonly customOpen = signal(false);
  protected readonly customError = signal('');
  protected readonly maxCustom = MAX_CUSTOM_STEP;
  protected readonly minCustom = MIN_CUSTOM_STEP;
  /** Kurzer Hinweis beim Start, wenn die gemerkte Schrittweite nicht 1 ist (kein versehentlich großer Schritt). */
  protected readonly startHint = signal(this.saved.step !== 1);
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
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
        // Anderes Event (Route wiederverwendet): der Rückgängig-Stapel gehört zum alten Event und wird verworfen.
        this.undoStack.set([]);
        this.feedback.set(null);
        if (id) this.ratings.start(id);
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
    this.eventsService.start();
    void this.wakeLock.keepAwake();
    if (this.startHint()) this.hintTimer = setTimeout(() => this.startHint.set(false), 4000);
  }

  ngOnDestroy(): void {
    this.wakeLock.release();
    clearTimeout(this.hintTimer);
    clearTimeout(this.feedbackTimer);
  }

  protected points(id: string): number {
    return this.ratings.pointsFor(id);
  }

  protected label(points: number): string {
    return pointsLabel(points);
  }

  /** Rückgängig-Stapel dieser Sitzung (nur im Speicher; die Punkte selbst sind längst gespeichert). */
  private readonly undoStack = signal<LiveChange[]>([]);
  private readonly tapGuard = createTapGuard();
  private feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  /** Große Rückmeldung nach dem letzten Tipp, z. B. „Max +2 → 7“. */
  protected readonly feedback = signal<{ text: string; direction: 1 | -1 } | null>(null);
  protected readonly undoOffer = computed(() => {
    const change = this.undoStack().at(-1);
    return this.feedback() && change ? changeLabel(change) : null;
  });

  protected add(id: string, direction: 1 | -1, event?: Event): void {
    if (!this.tapGuard(`${id}:${direction}`, Date.now())) return; // Prellen: zählt nur einmal
    const delta = direction * this.step();
    const before = this.points(id);
    if (!this.ratings.addPoints(id, delta)) return;
    const change: LiveChange = { playerId: id, label: this.labelOf(id), delta };
    this.undoStack.update((stack) => pushChange(stack, change));
    this.showFeedback(feedbackText(change, before + delta), direction);
    this.flash(event, direction);
  }

  /** Nimmt die letzte Änderung zurück (wiederholt: Schritt für Schritt weiter zurück). */
  protected undo(): void {
    if (!this.tapGuard('undo', Date.now())) return;
    const { change, rest } = popChange(this.undoStack());
    if (!change) return;
    const before = this.points(change.playerId);
    if (!this.ratings.addPoints(change.playerId, -change.delta)) return;
    this.undoStack.set(rest);
    this.showFeedback(`Zurückgenommen: ${feedbackText(change, before - change.delta)}`, change.delta < 0 ? 1 : -1);
  }

  private labelOf(id: string): string {
    return this.rows().find((row) => row.id === id)?.label ?? '';
  }

  private showFeedback(text: string, direction: 1 | -1): void {
    this.feedback.set({ text, direction });
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => this.feedback.set(null), UNDO_VISIBLE_MS);
    try {
      navigator.vibrate?.(30);
    } catch {
      // Vibration nicht verfügbar oder gesperrt: nur die optische Rückmeldung.
    }
  }

  /** Zeile blinkt kurz auf (Web Animations; ohne Unterstützung oder bei „weniger Bewegung“ bleibt nur der Text). */
  private flash(event: Event | undefined, direction: 1 | -1): void {
    const row = (event?.currentTarget as HTMLElement | null)?.closest('li');
    if (!row?.animate || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    row.animate([{ backgroundColor: direction > 0 ? '#9be3ae' : '#ffb3b3' }, { backgroundColor: 'transparent' }], { duration: 600, easing: 'ease-out' });
  }

  protected chooseStep(step: number): void {
    this.step.set(step);
    this.startHint.set(false);
    this.customOpen.set(false);
    this.customError.set('');
    this.persist();
  }

  protected toggleCustom(): void {
    this.customOpen.update((open) => !open);
    this.customError.set('');
  }

  protected applyCustom(input: HTMLInputElement): void {
    const value = parseCustomStep(input.value);
    if (value === null) {
      this.customError.set(`Bitte eine ganze Zahl von ${MIN_CUSTOM_STEP} bis ${MAX_CUSTOM_STEP} eingeben.`);
      return;
    }
    this.custom.set(value);
    input.value = '';
    this.chooseStep(value);
  }

  private persist(): void {
    saveStepPrefs(deviceStorage(), { step: this.step(), custom: this.custom() });
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
