import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { EventsService } from './events.service';
import { FirebaseService } from './firebase.service';
import { type EventRating } from './profile';
import { type Rating, ratingFromDoc } from './rating';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

/**
 * Bewertungen EINES Spielers über alle Events (Grundlage des Profils). Je Event wird nur das Bewertungsdokument
 * dieses Spielers abonniert (nie die Bewertungen anderer Spieler); neue und gelöschte Events folgen automatisch.
 * Beim Abmelden werden Abos und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly events = inject(EventsService);

  readonly playerId = signal<string | null>(null);
  /** Rating je Event-ID; `null` = für dieses Event gibt es (noch) keine Bewertung dieses Spielers. */
  private readonly byEvent = signal<ReadonlyMap<string, Rating | null>>(new Map());
  /** Anzahl der Events, deren erste Antwort noch aussteht. */
  private readonly waiting = signal(0);
  readonly error = signal('');

  readonly loading = computed(() => this.playerId() !== null && !this.error() && (this.events.load() !== 'ready' || this.waiting() > 0));
  /** Alle Events mit der Bewertung des Spielers (oder null), neueste zuerst. */
  readonly items = computed<EventRating[]>(() =>
    [...this.events.events()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((event) => ({ event, rating: this.byEvent().get(event.id) ?? null })),
  );

  private unsubscribers = new Map<string, () => void>();
  private pending = new Set<string>();
  private generation = 0;

  constructor() {
    // Folgt der Eventliste: für neue Events ein Abo anlegen, für gelöschte beenden.
    effect(() => {
      const playerId = this.playerId();
      const ids = this.events.events().map((event) => event.id);
      if (playerId !== null) untracked(() => this.reconcile(playerId, ids));
    });
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet die Abos für den Spieler (ein anderer Spieler beendet die bisherigen). */
  start(playerId: string): void {
    if (this.playerId() === playerId) return;
    this.stop();
    this.generation += 1;
    this.playerId.set(playerId);
    this.events.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.pending.clear();
    this.playerId.set(null);
    this.byEvent.set(new Map());
    this.waiting.set(0);
    this.error.set('');
  }

  private reconcile(playerId: string, ids: readonly string[]): void {
    const wanted = new Set(ids);
    const generation = this.generation;
    for (const [eventId, unsubscribe] of this.unsubscribers) {
      if (wanted.has(eventId)) continue;
      unsubscribe();
      this.unsubscribers.delete(eventId);
      this.pending.delete(eventId);
      this.byEvent.update((map) => {
        const next = new Map(map);
        next.delete(eventId);
        return next;
      });
    }
    for (const eventId of ids) {
      if (this.unsubscribers.has(eventId) || this.pending.has(`open:${eventId}`)) continue;
      this.pending.add(`open:${eventId}`);
      this.pending.add(eventId);
      this.watch(playerId, eventId, generation);
    }
    this.waiting.set([...this.pending].filter((key) => !key.startsWith('open:')).length);
  }

  private watch(playerId: string, eventId: string, generation: number): void {
    const answered = () => {
      this.pending.delete(eventId);
      this.waiting.set([...this.pending].filter((key) => !key.startsWith('open:')).length);
    };
    this.firebase
      .watchRatingDoc(
        eventId,
        playerId,
        (data, meta) => {
          if (generation !== this.generation) return;
          this.byEvent.update((map) => new Map(map).set(eventId, data ? ratingFromDoc(data) : null));
          answered();
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        this.pending.delete(`open:${eventId}`);
        if (generation !== this.generation || this.error()) unsubscribe();
        else this.unsubscribers.set(eventId, unsubscribe);
      })
      .catch((error) => {
        this.pending.delete(`open:${eventId}`);
        if (generation === this.generation) this.fail(error);
      });
  }

  private fail(error: unknown): void {
    console.error(error);
    this.error.set(`Das Profil konnte nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  /** Erneut versuchen nach einem Fehler. */
  retry(): void {
    const playerId = this.playerId();
    this.stop();
    if (playerId) this.start(playerId);
  }
}
