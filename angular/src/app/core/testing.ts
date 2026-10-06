import {
  FirebaseService,
  type FirebaseUser,
  type InviteRecord,
  type MemberRecord,
  type RawDoc,
  type SnapshotMeta,
} from './firebase.service';

/** Ersatz für das Firebase-SDK in Tests: speichert Aufrufe und liefert vorgegebene Antworten. */
export class FakeFirebase implements Pick<FirebaseService, keyof FirebaseService> {
  members = new Map<string, MemberRecord>();
  invites = new Map<string, InviteRecord>();
  calls: string[] = [];
  watchError: unknown = null;
  emailError: unknown = null;
  readInviteError: unknown = null;
  /** Fehler für die nächsten Aufrufe von claimInvite (jeweils einer pro Versuch). */
  claimErrors: unknown[] = [];
  nextUid = 'uid-1';
  private listener: ((user: FirebaseUser | null) => void) | null = null;

  async watchAuth(callback: (user: FirebaseUser | null) => void): Promise<() => void> {
    if (this.watchError) throw this.watchError;
    this.listener = callback;
    return () => (this.listener = null);
  }

  /** Test-Hilfe: meldet einen Anmeldezustand, wie ihn Firebase melden würde. */
  emit(user: FirebaseUser | null): void {
    this.listener?.(user);
  }

  async signInWithEmail(email: string): Promise<void> {
    this.calls.push(`email:${email}`);
    if (this.emailError) throw this.emailError;
    this.emit({ uid: this.nextUid, isAnonymous: false, email });
  }

  async signInAnonymously(): Promise<string> {
    this.calls.push('anonymous');
    this.emit({ uid: this.nextUid, isAnonymous: true, email: null });
    return this.nextUid;
  }

  async signOut(): Promise<void> {
    this.calls.push('signOut');
    this.emit(null);
  }

  async readMember(uid: string): Promise<MemberRecord | null> {
    this.calls.push(`member:${uid}`);
    return this.members.get(uid) ?? null;
  }

  async readInvite(code: string): Promise<InviteRecord | null> {
    this.calls.push(`invite:${code}`);
    if (this.readInviteError) throw this.readInviteError;
    return this.invites.get(code) ?? null;
  }

  async claimInvite(uid: string, code: string, invite: InviteRecord): Promise<void> {
    this.calls.push(`claim:${code}`);
    const error = this.claimErrors.shift();
    if (error) throw error;
    this.members.set(uid, { role: invite.role, playerId: invite.playerId });
    this.invites.delete(code);
  }

  // --- Spieler (Echtzeit-Abo wie bei Firestore: lokale Schreibvorgänge melden sofort einen neuen Stand) ---
  players = new Map<string, Record<string, unknown>>();
  playersMeta: SnapshotMeta = { fromCache: false, hasPendingWrites: false };
  watchPlayersError: unknown = null;
  savePlayerError: unknown = null;
  deletePlayerError: unknown = null;
  playerWatchers = 0;
  private playersListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private playersErrorListener: ((error: unknown) => void) | null = null;

  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchPlayers');
    if (this.watchPlayersError) throw this.watchPlayersError;
    this.playerWatchers += 1;
    this.playersListener = onData;
    this.playersErrorListener = onError;
    this.emitPlayers();
    return () => {
      this.playerWatchers -= 1;
      this.playersListener = null;
      this.playersErrorListener = null;
    };
  }

  /** Test-Hilfe: sendet den aktuellen Spielerstand an den Abonnenten. */
  emitPlayers(meta: SnapshotMeta = this.playersMeta): void {
    this.playersMeta = meta;
    this.playersListener?.(
      [...this.players].map(([id, data]) => ({ id, data })),
      meta,
    );
  }

  /** Test-Hilfe: Abo-Fehler (z. B. permission-denied). */
  failPlayers(error: unknown): void {
    this.playersErrorListener?.(error);
  }

  async savePlayer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePlayer:${id}`);
    if (this.savePlayerError) throw this.savePlayerError;
    this.players.set(id, { ...this.players.get(id), ...data });
    this.emitPlayers();
  }

  async deletePlayer(id: string): Promise<void> {
    this.calls.push(`deletePlayer:${id}`);
    if (this.deletePlayerError) throw this.deletePlayerError;
    this.players.delete(id);
    this.emitPlayers();
  }

  // --- Events (gleiches Muster wie bei den Spielern) ---
  events = new Map<string, Record<string, unknown>>();
  eventsMeta: SnapshotMeta = { fromCache: false, hasPendingWrites: false };
  watchEventsError: unknown = null;
  saveEventError: unknown = null;
  deleteEventError: unknown = null;
  eventWatchers = 0;
  private eventsListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private eventsErrorListener: ((error: unknown) => void) | null = null;

  async watchEvents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchEvents');
    if (this.watchEventsError) throw this.watchEventsError;
    this.eventWatchers += 1;
    this.eventsListener = onData;
    this.eventsErrorListener = onError;
    this.emitEvents();
    return () => {
      this.eventWatchers -= 1;
      this.eventsListener = null;
      this.eventsErrorListener = null;
    };
  }

  emitEvents(meta: SnapshotMeta = this.eventsMeta): void {
    this.eventsMeta = meta;
    this.eventsListener?.(
      [...this.events].map(([id, data]) => ({ id, data })),
      meta,
    );
  }

  failEvents(error: unknown): void {
    this.eventsErrorListener?.(error);
  }

  async saveEvent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveEvent:${id}`);
    if (this.saveEventError) throw this.saveEventError;
    this.events.set(id, { ...this.events.get(id), ...data });
    this.emitEvents();
  }

  async deleteEvent(id: string): Promise<void> {
    this.calls.push(`deleteEvent:${id}`);
    if (this.deleteEventError) throw this.deleteEventError;
    this.events.delete(id);
    this.emitEvents();
  }

  // --- Bewertungen und interne Notizen je Event ---
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

  // --- Bewertung eines einzelnen Spielers je Event (Spielerprofil) ---
  watchPlayerRatingError: unknown = null;
  playerRatingWatchers = 0;
  private playerRatingListeners = new Map<string, { onData: (data: Record<string, unknown> | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  async watchPlayerRating(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchPlayerRating:${eventId}:${playerId}`);
    if (this.watchPlayerRatingError) throw this.watchPlayerRatingError;
    this.playerRatingWatchers += 1;
    const key = `${eventId}:${playerId}`;
    this.playerRatingListeners.set(key, { onData, onError });
    this.emitPlayerRating(eventId, playerId);
    return () => {
      this.playerRatingWatchers -= 1;
      this.playerRatingListeners.delete(key);
    };
  }

  private emitPlayerRating(eventId: string, playerId: string): void {
    const data = this.ratings.get(eventId)?.get(playerId) ?? null;
    this.playerRatingListeners.get(`${eventId}:${playerId}`)?.onData(data, { fromCache: false, hasPendingWrites: false });
  }

  /** Test-Hilfe: Abo-Fehler der Spielerbewertung eines Events. */
  failPlayerRating(eventId: string, playerId: string, error: unknown): void {
    this.playerRatingListeners.get(`${eventId}:${playerId}`)?.onError(error);
  }

  /** Test-Hilfe: sendet den aktuellen Stand der Spielerbewertung (nach direktem Ändern von `ratings`). */
  emitRatingFor(eventId: string, playerId: string): void {
    this.emitPlayerRating(eventId, playerId);
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
    this.emitPlayerRating(eventId, playerId);
  }

  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    this.calls.push(`savePrivateNote:${eventId}:${playerId}`);
    if (this.savePrivateNoteError) throw this.savePrivateNoteError;
    const store = this.privateNotes.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { playerId, note });
    this.privateNotes.set(eventId, store);
    this.emitSub('privateNotes', eventId);
  }
}
