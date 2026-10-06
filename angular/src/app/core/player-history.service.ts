import { Injectable, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService, type SnapshotMeta } from './firebase.service';
import { type Rating, ratingFromDoc } from './rating';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

export type PlayerHistoryLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Bewertungen eines Spielers über alle Events (Grundlage des Spielerprofils). Je Event wird nur das eine
 * Bewertungsdokument des Spielers abonniert, nicht die ganze Sammlung. Kommen Events dazu oder fallen weg,
 * gleicht `watch` die Abos an; ein anderer Spieler beendet alle bisherigen. Nur lesend. Beim Abmelden werden
 * Abos und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class PlayerHistoryService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly playerId = signal<string | null>(null);
  /** Bewertung je Event-ID; Events ohne Dokument fehlen (gelten als „Offen“). */
  readonly ratings = signal<ReadonlyMap<string, Rating>>(new Map());
  readonly load = signal<PlayerHistoryLoad>('idle');
  readonly error = signal('');

  private unsubscribers = new Map<string, () => void>();
  private opening = new Set<string>();
  private delivered = new Set<string>();
  private wanted: readonly string[] = [];
  /** Erhöht bei jedem Spielerwechsel/stop, damit ein spät eintreffendes Abo eines alten Laufs verworfen wird. */
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Richtet die Abos für den Spieler und die Events ein. Mehrfacher Aufruf mit denselben Werten ist harmlos. */
  watch(playerId: string | null, eventIds: readonly string[]): void {
    if (playerId === null) {
      this.stop();
      return;
    }
    if (this.playerId() !== playerId) {
      this.stop();
      this.playerId.set(playerId);
    }
    if (this.load() === 'error') return; // „Erneut versuchen“ ruft retry() auf
    this.wanted = eventIds;
    const wanted = new Set(eventIds);
    for (const [eventId, unsubscribe] of this.unsubscribers) {
      if (wanted.has(eventId)) continue;
      unsubscribe();
      this.unsubscribers.delete(eventId);
      this.delivered.delete(eventId);
      this.ratings.update((map) => {
        const next = new Map(map);
        next.delete(eventId);
        return next;
      });
    }
    for (const eventId of eventIds) {
      if (!this.unsubscribers.has(eventId) && !this.opening.has(eventId)) this.open(playerId, eventId, this.generation);
    }
    this.updateLoad();
  }

  /** Nach einem Ladefehler: alle Abos neu aufbauen. */
  retry(): void {
    const playerId = this.playerId();
    const eventIds = this.wanted;
    if (playerId === null) return;
    this.stop();
    this.playerId.set(playerId);
    this.watch(playerId, eventIds);
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.opening.clear();
    this.delivered.clear();
    this.wanted = [];
    this.playerId.set(null);
    this.ratings.set(new Map());
    this.load.set('idle');
    this.error.set('');
  }

  private open(playerId: string, eventId: string, generation: number): void {
    this.opening.add(eventId);
    this.firebase
      .watchPlayerRating(
        eventId,
        playerId,
        (data, meta) => this.receive(generation, eventId, data, meta),
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        this.opening.delete(eventId);
        // Wurde inzwischen gestoppt, ist das Event weggefallen oder das Laden schon fehlgeschlagen, endet das Abo sofort wieder.
        if (generation !== this.generation || this.load() === 'error' || !this.wanted.includes(eventId)) unsubscribe();
        else this.unsubscribers.set(eventId, unsubscribe);
      })
      .catch((error) => {
        this.opening.delete(eventId);
        if (generation === this.generation) this.failLoad(error);
      });
  }

  private receive(generation: number, eventId: string, data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta): void {
    if (generation !== this.generation || !this.wanted.includes(eventId)) return;
    this.ratings.update((map) => {
      const next = new Map(map);
      if (data) next.set(eventId, ratingFromDoc(data));
      else next.delete(eventId);
      return next;
    });
    this.delivered.add(eventId);
    this.sync.applySnapshot(meta);
    this.updateLoad();
  }

  private updateLoad(): void {
    if (this.load() === 'error' || this.playerId() === null) return;
    this.load.set(this.wanted.every((eventId) => this.delivered.has(eventId)) ? 'ready' : 'loading');
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.generation += 1; // verwirft alles, was von den bisherigen Abos noch eintrifft
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear(); // erlaubt „Erneut versuchen“
    this.opening.clear();
    this.delivered.clear();
    this.load.set('error');
    this.error.set(`Die Bewertungen des Spielers konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }
}
