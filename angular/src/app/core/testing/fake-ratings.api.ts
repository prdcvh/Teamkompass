import type { RatingsApi } from '../firebase/ratings.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import { type GradeRelease, isReleaseActive } from '../ratings/grade-release';
import { gradesChanged, gradesDoc, valuesDoc } from '../ratings/player-view';

type Doc = Readonly<Record<string, unknown>>;
interface DocListener { onData: (data: Doc | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }

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
    this.subListeners.get(`${name}:${eventId}`)?.onData(docs, { fromCache: this.offline, hasPendingWrites: this.offline && this.parked.length > 0 });
  }

  /** Test-Hilfe: Abo-Fehler eines Unterpfads (z. B. permission-denied). */
  failSub(name: 'ratings' | 'privateNotes', eventId: string, error: unknown): void {
    this.subListeners.get(`${name}:${eventId}`)?.onError(error);
  }

  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>, previous?: Doc | null): Promise<void> {
    this.calls.push(`saveRating:${eventId}:${playerId}`);
    if (this.saveRatingError) throw this.saveRatingError;
    const store = this.ratings.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { ...store.get(playerId), ...data, playerId });
    this.ratings.set(eventId, store);
    // Kopien für die Spieleransicht (SCRUM-115) wie RatingsApi.saveRating.
    this.copyStore(this.values, eventId).set(playerId, valuesDoc(playerId, data));
    if (gradesChanged(previous, data)) {
      this.calls.push(`saveGrades:${eventId}:${playerId}`);
      this.copyStore(this.grades, eventId).set(playerId, { ...gradesDoc(playerId, data), ratedAt: new Date() });
    }
    this.emitSub('ratings', eventId);
    this.pushRatingDoc(eventId, playerId, store.get(playerId) ?? null);
    this.pushCopies(eventId, playerId);
  }

  // --- Kopien für die Spieleransicht (SCRUM-115) ---
  /**
   * Werte- und Noten-Kopien je Event. Fehlt eine Kopie, leitet die Attrappe sie aus der Bewertung ab (wie nach der
   * Übernahme bestehender Bewertungen) – die Noten dann mit einem alten Zeitpunkt (1970), also vor jeder Freigabe.
   */
  values = new Map<string, Map<string, Record<string, unknown>>>();
  grades = new Map<string, Map<string, Record<string, unknown>>>();
  /** Freigabe je Spieler (setzt FakeFirebase aus FakeGradeReleasesApi); die Regeln werden damit nachgestellt. */
  releaseFor: (playerId: string) => GradeRelease | null = () => null;
  private valuesListeners = new Map<string, DocListener>();
  private gradesListeners = new Map<string, DocListener>();
  gradeDocWatchers = 0;

  private copyStore(map: Map<string, Map<string, Record<string, unknown>>>, eventId: string): Map<string, Record<string, unknown>> {
    const store = map.get(eventId) ?? new Map<string, Record<string, unknown>>();
    map.set(eventId, store);
    return store;
  }

  valuesDocFor(eventId: string, playerId: string): Doc | null {
    const stored = this.values.get(eventId)?.get(playerId);
    if (stored) return stored;
    const master = this.ratings.get(eventId)?.get(playerId);
    return master ? valuesDoc(playerId, master) : null;
  }

  gradesDocFor(eventId: string, playerId: string): Doc | null {
    const stored = this.grades.get(eventId)?.get(playerId);
    if (stored) return stored;
    const master = this.ratings.get(eventId)?.get(playerId);
    return master ? { ...gradesDoc(playerId, master), ratedAt: new Date(0) } : null;
  }

  /** Wie die Regeln: Noten nur bei gültiger Freigabe und nur, wenn sie bis zum Klick vergeben wurden. */
  private emitGrades(eventId: string, playerId: string, listener: DocListener): void {
    const release = this.releaseFor(playerId);
    const doc = this.gradesDocFor(eventId, playerId);
    const ratedAt = doc?.['ratedAt'];
    const visible = isReleaseActive(release) && (!doc || (ratedAt instanceof Date && ratedAt.getTime() <= release.publishedUntil.getTime()));
    if (!visible) listener.onError(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    else listener.onData(doc, { fromCache: false, hasPendingWrites: false });
  }

  private pushCopies(eventId: string, playerId: string): void {
    const key = `${eventId}:${playerId}`;
    this.valuesListeners.get(key)?.onData(this.valuesDocFor(eventId, playerId), { fromCache: false, hasPendingWrites: false });
    const grades = this.gradesListeners.get(key);
    if (grades) this.emitGrades(eventId, playerId, grades);
  }

  async watchValuesDoc(eventId: string, playerId: string, onData: DocListener['onData'], onError: DocListener['onError']): Promise<() => void> {
    this.calls.push(`watchValuesDoc:${eventId}:${playerId}`);
    if (this.watchRatingDocError) throw this.watchRatingDocError;
    this.ratingDocWatchers += 1;
    const key = `${eventId}:${playerId}`;
    this.valuesListeners.set(key, { onData, onError });
    onData(this.valuesDocFor(eventId, playerId), { fromCache: false, hasPendingWrites: false });
    return () => {
      this.ratingDocWatchers -= 1;
      this.valuesListeners.delete(key);
    };
  }

  async watchGradesDoc(eventId: string, playerId: string, onData: DocListener['onData'], onError: DocListener['onError']): Promise<() => void> {
    this.calls.push(`watchGradesDoc:${eventId}:${playerId}`);
    this.gradeDocWatchers += 1;
    const key = `${eventId}:${playerId}`;
    const listener = { onData, onError };
    this.gradesListeners.set(key, listener);
    this.emitGrades(eventId, playerId, listener);
    return () => {
      this.gradeDocWatchers -= 1;
      if (this.gradesListeners.get(key) === listener) this.gradesListeners.delete(key);
    };
  }

  /** Test-Hilfe: meldet einer laufenden Spieleransicht neue Werte. */
  pushValuesDoc(eventId: string, playerId: string, data: Doc | null): void {
    if (data) this.copyStore(this.values, eventId).set(playerId, { ...data });
    else this.values.get(eventId)?.delete(playerId);
    this.valuesListeners.get(`${eventId}:${playerId}`)?.onData(data, { fromCache: false, hasPendingWrites: false });
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

  /** Wie Firestore mit merge: der Eintrag `live.<changeId>` wird gesetzt (erneutes Senden überschreibt ihn nur). */
  addPointsError: unknown = null;
  /**
   * Funkloch nachstellen (wie Firestore ohne Netz): Änderungen erscheinen sofort lokal (Snapshot mit `fromCache` und
   * `hasPendingWrites`), das Versprechen bleibt aber offen, bis `goOnline()` sie „überträgt“.
   */
  offline = false;
  private parked: (() => void)[] = [];

  goOffline(): void {
    this.offline = true;
    for (const key of this.subListeners.keys()) {
      const [name, eventId] = key.split(':') as ['ratings' | 'privateNotes', string];
      this.emitSub(name, eventId);
    }
  }

  /** App im Funkloch beendet: offene Sendeversuche verschwinden unbestätigt (das Netz ist danach wieder da). */
  killPending(): void {
    this.parked = [];
    this.offline = false;
  }

  goOnline(): void {
    this.offline = false;
    const parked = this.parked;
    this.parked = [];
    parked.forEach((release) => release());
    for (const key of this.subListeners.keys()) {
      const [name, eventId] = key.split(':') as ['ratings' | 'privateNotes', string];
      this.emitSub(name, eventId);
    }
  }

  async addPoints(eventId: string, playerId: string, changeId: string, delta: number): Promise<void> {
    this.calls.push(`addPoints:${eventId}:${playerId}:${delta}`);
    if (this.addPointsError) throw this.addPointsError;
    if (this.savePointsError) throw this.savePointsError;
    const store = this.privateNotes.get(eventId) ?? new Map<string, Record<string, unknown>>();
    const current = store.get(playerId);
    const live = current?.['live'] && typeof current['live'] === 'object' ? (current['live'] as Record<string, unknown>) : {};
    store.set(playerId, { ...current, playerId, live: { ...live, [changeId]: delta } });
    this.privateNotes.set(eventId, store);
    const sent = this.offline ? new Promise<void>((resolve) => this.parked.push(resolve)) : Promise.resolve();
    this.emitSub('privateNotes', eventId);
    this.pushPrivateDoc(eventId, playerId);
    await sent;
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
    // Spieleransicht (SCRUM-115): dieselbe Änderung als Werte-Kopie, falls keine eigene Kopie hinterlegt ist.
    if (!this.values.get(eventId)?.has(playerId)) this.valuesListeners.get(`${eventId}:${playerId}`)?.onData(data ? valuesDoc(playerId, data) : null, { fromCache: false, hasPendingWrites: false });
  }

  failRatingDoc(eventId: string, playerId: string, error: unknown): void {
    this.ratingDocListeners.get(`${eventId}:${playerId}`)?.onError(error);
  }

  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`readRatingDoc:${eventId}:${playerId}`);
    return this.ratings.get(eventId)?.get(playerId) ?? null;
  }
}
