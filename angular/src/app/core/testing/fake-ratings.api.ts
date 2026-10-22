import type { RatingsApi } from '../firebase/ratings.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link RatingsApi} in Tests: Bewertungen und interne Notizen je Event, einzelne Bewertung je Spieler. */
export class FakeRatingsApi implements Pick<RatingsApi, keyof RatingsApi> {
  constructor(readonly calls: string[] = []) {}

  ratings = new Map<string, Map<string, Record<string, unknown>>>();
  privateNotes = new Map<string, Map<string, Record<string, unknown>>>();
  watchRatingsError: unknown = null;
  saveRatingError: unknown = null;
  savePrivateNoteError: unknown = null;
  ratingWatchers = 0;
  private subListeners = new Map<string, { onData: (docs: RawDoc[], meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  private subStore(name: 'ratings' | 'privateNotes') {
    return name === 'ratings' ? this.ratings : this.privateNotes;
  }

  private async watchSub(
    name: 'ratings' | 'privateNotes',
    eventId: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watch${name === 'ratings' ? 'Ratings' : 'PrivateNotes'}:${eventId}`);
    if (this.watchRatingsError) throw this.watchRatingsError;
    this.ratingWatchers += 1;
    const key = `${name}:${eventId}`;
    this.subListeners.set(key, { onData, onError });
    this.emitSub(name, eventId);
    return () => {
      this.ratingWatchers -= 1;
      this.subListeners.delete(key);
    };
  }

  watchRatings(eventId: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) {
    return this.watchSub('ratings', eventId, onData, onError);
  }

  watchPrivateNotes(eventId: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) {
    return this.watchSub('privateNotes', eventId, onData, onError);
  }

  private emitSub(name: 'ratings' | 'privateNotes', eventId: string): void {
    const docs = [...(this.subStore(name).get(eventId) ?? new Map())].map(([id, data]) => ({ id, data }));
    this.subListeners.get(`${name}:${eventId}`)?.onData(docs, { fromCache: false, hasPendingWrites: false });
  }

  /** Test-Hilfe: Abo-Fehler eines Unterpfads (z. B. permission-denied). */
  failSub(name: 'ratings' | 'privateNotes', eventId: string, error: unknown): void {
    this.subListeners.get(`${name}:${eventId}`)?.onError(error);
  }

  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveRating:${eventId}:${playerId}`);
    if (this.saveRatingError) throw this.saveRatingError;
    const store = this.ratings.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { ...store.get(playerId), ...data, playerId });
    this.ratings.set(eventId, store);
    this.emitSub('ratings', eventId);
    this.pushRatingDoc(eventId, playerId, store.get(playerId) ?? null);
  }

  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    this.calls.push(`savePrivateNote:${eventId}:${playerId}`);
    if (this.savePrivateNoteError) throw this.savePrivateNoteError;
    const store = this.privateNotes.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { ...store.get(playerId), playerId, note });
    this.privateNotes.set(eventId, store);
    this.emitSub('privateNotes', eventId);
    this.pushPrivateDoc(eventId, playerId);
  }

  savePointsError: unknown = null;

  async savePoints(eventId: string, playerId: string, points: number): Promise<void> {
    this.calls.push(`savePoints:${eventId}:${playerId}:${points}`);
    if (this.savePointsError) throw this.savePointsError;
    const store = this.privateNotes.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { ...store.get(playerId), playerId, points });
    this.privateNotes.set(eventId, store);
    this.emitSub('privateNotes', eventId);
    this.pushPrivateDoc(eventId, playerId);
  }

  // --- Trainer-Dokument (Notiz + Punkte) eines einzelnen Spielers je Event (Profil) ---
  privateDocWatchers = 0;
  private privateDocListeners = new Map<string, { onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  async watchPrivateDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchPrivateDoc:${eventId}:${playerId}`);
    this.privateDocWatchers += 1;
    const key = `${eventId}:${playerId}`;
    this.privateDocListeners.set(key, { onData, onError });
    onData(this.privateNotes.get(eventId)?.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => {
      this.privateDocWatchers -= 1;
      this.privateDocListeners.delete(key);
    };
  }

  private pushPrivateDoc(eventId: string, playerId: string): void {
    this.privateDocListeners.get(`${eventId}:${playerId}`)?.onData(this.privateNotes.get(eventId)?.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
  }

  // --- Bewertung eines einzelnen Spielers je Event (Profil) ---
  ratingDocWatchers = 0;
  watchRatingDocError: unknown = null;
  private ratingDocListeners = new Map<string, { onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  async watchRatingDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchRatingDoc:${eventId}:${playerId}`);
    if (this.watchRatingDocError) throw this.watchRatingDocError;
    this.ratingDocWatchers += 1;
    const key = `${eventId}:${playerId}`;
    this.ratingDocListeners.set(key, { onData, onError });
    onData(this.ratings.get(eventId)?.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => {
      this.ratingDocWatchers -= 1;
      this.ratingDocListeners.delete(key);
    };
  }

  /** Test-Hilfe: meldet einer laufenden Profil-Abfrage neue Daten (oder einen Fehler). */
  pushRatingDoc(eventId: string, playerId: string, data: Readonly<Record<string, unknown>> | null): void {
    this.ratingDocListeners.get(`${eventId}:${playerId}`)?.onData(data, { fromCache: false, hasPendingWrites: false });
  }

  failRatingDoc(eventId: string, playerId: string, error: unknown): void {
    this.ratingDocListeners.get(`${eventId}:${playerId}`)?.onError(error);
  }

  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`readRatingDoc:${eventId}:${playerId}`);
    return this.ratings.get(eventId)?.get(playerId) ?? null;
  }
}
