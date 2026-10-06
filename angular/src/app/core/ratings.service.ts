import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { EventsService } from './events.service';
import { FirebaseService, type RawDoc, type SnapshotMeta } from './firebase.service';
import { MAX_NOTE_LENGTH, type Rating, type RatingField, BLANK_RATING, applyChange, docFromRating, ratingFromDoc } from './rating';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

export type RatingsLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Bewertungen und interne Notizen eines Events (jeweils ein Dokument je Spieler). Folgt der Datenbank in
 * Echtzeit; Änderungen erscheinen sofort lokal und werden dann geschrieben. Schreiben darf nur der Trainer
 * (die Regeln erzwingen es zusätzlich). Interne Notizen werden nur für Trainer geladen und nie in die
 * Bewertung geschrieben, die Spieler und Eltern lesen dürfen.
 */
@Injectable({ providedIn: 'root' })
export class RatingsService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly events = inject(EventsService);

  readonly eventId = signal<string | null>(null);
  readonly ratings = signal<ReadonlyMap<string, Rating>>(new Map());
  readonly notes = signal<ReadonlyMap<string, string>>(new Map());
  readonly load = signal<RatingsLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly event = computed(() => this.events.events().find((entry) => entry.id === this.eventId()) ?? null);
  /** Spieldauer in Minuten (Obergrenze für die Einsatzminuten); bei Trainings ohne Bedeutung. */
  readonly matchDuration = computed(() => this.event()?.matchDuration ?? 90);

  private unsubscribers: (() => void)[] = [];
  private generation = 0;
  private pending = { ratings: false, notes: false };

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  ratingFor(playerId: string): Rating {
    return this.ratings().get(playerId) ?? BLANK_RATING;
  }

  noteFor(playerId: string): string {
    return this.notes().get(playerId) ?? '';
  }

  /** Startet die Abos für das Event (ein anderes Event beendet die bisherigen). */
  start(eventId: string): void {
    if (this.eventId() === eventId && (this.load() === 'loading' || this.load() === 'ready')) return;
    this.stop();
    const generation = ++this.generation;
    this.eventId.set(eventId);
    this.load.set('loading');
    this.error.set('');
    this.pending = { ratings: false, notes: false };
    const finish = (kind: 'ratings' | 'notes') => {
      this.pending[kind] = true;
      if (this.pending.ratings && (this.pending.notes || !this.canWrite())) this.load.set('ready');
    };
    this.subscribe(
      generation,
      (onData, onError) => this.firebase.watchRatings(eventId, onData, onError),
      (docs) => {
        this.ratings.set(new Map(docs.map((entry) => [entry.id, ratingFromDoc(entry.data)])));
        finish('ratings');
      },
    );
    // Interne Notizen darf nur der Trainer lesen; für alle anderen wird der Pfad gar nicht erst abgefragt.
    if (this.canWrite()) {
      this.subscribe(
        generation,
        (onData, onError) => this.firebase.watchPrivateNotes(eventId, onData, onError),
        (docs) => {
          this.notes.set(new Map(docs.map((entry) => [entry.id, typeof entry.data['note'] === 'string' ? entry.data['note'] : ''])));
          finish('notes');
        },
      );
    }
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.eventId.set(null);
    this.ratings.set(new Map());
    this.notes.set(new Map());
    this.load.set('idle');
    this.error.set('');
  }

  /**
   * Ändert ein Feld der Bewertung eines Spielers. Die Änderung ist sofort sichtbar, das Ergebnis der Cloud
   * zeigt der Sync-Status. Rückgabe: wurde geschrieben?
   */
  setField(playerId: string, field: RatingField, value: string): boolean {
    const eventId = this.eventId();
    if (!eventId || !this.canWrite() || this.load() !== 'ready') return false;
    const current = this.ratingFor(playerId);
    const { rating, clearedAuto } = applyChange(current, field, value, this.matchDuration());
    if (rating === current) return false;
    this.ratings.update((map) => new Map(map).set(playerId, rating));
    this.markSyncing();
    void this.firebase
      .saveRating(eventId, playerId, docFromRating(rating, { clearAuto: clearedAuto }))
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, 'Bewertung konnte nicht gespeichert werden.'));
    return true;
  }

  setPrivateNote(playerId: string, value: string): boolean {
    const eventId = this.eventId();
    if (!eventId || !this.canWrite() || this.load() !== 'ready') return false;
    const note = value.slice(0, MAX_NOTE_LENGTH);
    if (note === this.noteFor(playerId)) return false;
    this.notes.update((map) => new Map(map).set(playerId, note));
    this.markSyncing();
    void this.firebase
      .savePrivateNote(eventId, playerId, note)
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, 'Interne Notiz konnte nicht gespeichert werden.'));
    return true;
  }

  private subscribe(
    generation: number,
    open: (onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) => Promise<() => void>,
    apply: (docs: RawDoc[]) => void,
  ): void {
    open(
      (docs, meta) => {
        if (generation !== this.generation) return;
        apply(docs);
        this.sync.applySnapshot(meta);
      },
      (error) => {
        if (generation === this.generation) this.failLoad(error);
      },
    )
      .then((unsubscribe) => {
        // Wurde inzwischen gestoppt oder ist das Laden schon fehlgeschlagen, wird das Abo sofort wieder beendet.
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribers.push(unsubscribe);
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  private markSyncing(): void {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = []; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.error.set(`Die Bewertungen konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
