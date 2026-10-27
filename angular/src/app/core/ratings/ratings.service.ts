import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { EventsService } from '../events/events.service';
import { RatingsApi } from '../firebase/ratings.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import { LiveOutboxService } from '../live/live-outbox.service';
import { LIVE_POINTS_FIELD, countsPoints, livePointsSum, normalizePoints, pointsFromDoc } from '../points/points';
import { RankingService } from '../points/ranking.service';
import { MAX_NOTE_LENGTH, type Rating, type RatingField, BLANK_RATING, applyChange, docFromRating, ratingFromDoc } from './rating';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';

export type RatingsLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Bewertungen und interne Notizen eines Events (jeweils ein Dokument je Spieler). Folgt der Datenbank in
 * Echtzeit; Änderungen erscheinen sofort lokal und werden dann geschrieben. Schreiben darf nur der Trainer
 * (die Regeln erzwingen es zusätzlich). Interne Notizen werden nur für Trainer geladen und nie in die
 * Bewertung geschrieben, die Spieler und Eltern lesen dürfen.
 */
@Injectable({ providedIn: 'root' })
export class RatingsService {
  private readonly ratingsApi = inject(RatingsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly events = inject(EventsService);
  private readonly ranking = inject(RankingService);
  private readonly outbox = inject(LiveOutboxService);

  readonly eventId = signal<string | null>(null);
  readonly ratings = signal<ReadonlyMap<string, Rating>>(new Map());
  readonly notes = signal<ReadonlyMap<string, string>>(new Map());
  /** Trainingspunkte je Spieler (SCRUM-104), unabhängig davon, ob das Event sie zählt. Nur Trainer bekommen sie geladen. */
  readonly points = signal<ReadonlyMap<string, number>>(new Map());
  /** Summe der Live-Änderungen je Spieler (SCRUM-216); `points` enthält sie schon, das Formular braucht sie für den Grundwert. */
  private readonly liveSums = signal<ReadonlyMap<string, number>>(new Map());
  /** Snapshot-Angaben der Punkte (Trainer-Dokumente): Grundlage für den Speicherhinweis im Live-Modus. */
  readonly pointsMeta = signal<SnapshotMeta>({ fromCache: false, hasPendingWrites: false });
  readonly load = signal<RatingsLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly event = computed(() => this.events.events().find((entry) => entry.id === this.eventId()) ?? null);
  /** Spieldauer in Minuten (Obergrenze für die Einsatzminuten); bei Trainings ohne Bedeutung. */
  /** Vergibt dieses Event Punkte? Training immer, Spiel nur mit „Punkte vergeben: ja“. */
  readonly pointsActive = computed(() => {
    const event = this.event();
    return event !== null && countsPoints(event);
  });
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

  pointsFor(playerId: string): number {
    return this.points().get(playerId) ?? 0;
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
      (onData, onError) => this.ratingsApi.watchRatings(eventId, onData, onError),
      (docs) => {
        this.ratings.set(new Map(docs.map((entry) => [entry.id, ratingFromDoc(entry.data)])));
        finish('ratings');
      },
    );
    // Interne Notizen darf nur der Trainer lesen; für alle anderen wird der Pfad gar nicht erst abgefragt.
    if (this.canWrite()) {
      this.subscribe(
        generation,
        (onData, onError) => this.ratingsApi.watchPrivateNotes(eventId, onData, onError),
        (docs) => {
          this.notes.set(new Map(docs.map((entry) => [entry.id, typeof entry.data['note'] === 'string' ? entry.data['note'] : ''])));
          this.points.set(new Map(docs.map((entry) => [entry.id, pointsFromDoc(entry.data)])));
          this.liveSums.set(new Map(docs.map((entry) => [entry.id, livePointsSum(entry.data[LIVE_POINTS_FIELD])])));
          finish('notes');
        },
        (meta) => this.pointsMeta.set(meta),
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
    this.points.set(new Map());
    this.liveSums.set(new Map());
    this.pointsMeta.set({ fromCache: false, hasPendingWrites: false });
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
    void this.ratingsApi
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
    void this.ratingsApi
      .savePrivateNote(eventId, playerId, note)
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, 'Interne Notiz konnte nicht gespeichert werden.'));
    return true;
  }

  /**
   * Trägt die Punkte eines Spielers ein (Text aus dem Formular; ganze Zahl, auch negativ; leer oder ungültig = 0). Geschrieben wird nur,
   * wenn dieses Event Punkte vergibt und sich der Wert ändert; bereits gespeicherte Punkte eines Spiels auf „nein“
   * bleiben unangetastet.
   */
  setPoints(playerId: string, value: string): boolean {
    const eventId = this.eventId();
    if (!eventId || !this.canWrite() || this.load() !== 'ready' || !this.pointsActive()) return false;
    const points = normalizePoints(value);
    if (points === this.pointsFor(playerId)) return false;
    this.points.update((map) => new Map(map).set(playerId, points));
    this.markSyncing();
    // Gespeichert wird der Grundwert: Live-Änderungen (SCRUM-216) bleiben als Einträge stehen und kommen dazu.
    void this.ratingsApi
      .savePoints(eventId, playerId, normalizePoints(points - (this.liveSums().get(playerId) ?? 0)))
      .then(() => {
        this.sync.clearError();
        this.ranking.invalidate();
      })
      .catch((error) => this.failWrite(error, 'Punkte konnten nicht gespeichert werden.'));
    return true;
  }

  /**
   * Ändert die Punkte eines Spielers um `delta` (Live-Modus, SCRUM-213; auch unter 0). Lokal sofort sichtbar. Geschrieben
   * wird die Änderung selbst unter einer eigenen Kennung (nicht der Endwert): gleichzeitige Tipps mehrerer Trainer werden
   * addiert, und über den Postausgang (SCRUM-216) geht ohne Netz nichts verloren und nichts zählt doppelt.
   */
  addPoints(playerId: string, delta: number): boolean {
    const eventId = this.eventId();
    if (!eventId || !this.canWrite() || this.load() !== 'ready' || !this.pointsActive()) return false;
    const step = Math.round(delta);
    if (!Number.isFinite(step) || step === 0) return false;
    if (!this.outbox.canRecord()) return false;
    // Erst lokal anzeigen, dann aufnehmen: der Snapshot mit der neuen Änderung ersetzt den Wert danach durch den echten Stand.
    this.points.update((map) => new Map(map).set(playerId, this.pointsFor(playerId) + step));
    this.liveSums.update((map) => new Map(map).set(playerId, (map.get(playerId) ?? 0) + step));
    this.markSyncing();
    this.outbox.record(eventId, playerId, step);
    return true;
  }

  private subscribe(
    generation: number,
    open: (onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) => Promise<() => void>,
    apply: (docs: RawDoc[]) => void,
    onMeta?: (meta: SnapshotMeta) => void,
  ): void {
    open(
      (docs, meta) => {
        if (generation !== this.generation) return;
        apply(docs);
        onMeta?.(meta);
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
