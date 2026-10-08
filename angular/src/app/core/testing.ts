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

  async signInWithEmail(email: string): Promise<FirebaseUser> {
    this.calls.push(`email:${email}`);
    if (this.emailError) throw this.emailError;
    const user = { uid: this.nextUid, isAnonymous: false, email };
    this.emit(user);
    return user;
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

  /** Test-Hilfe: hält die Antwort von readMember für eine uid zurück, bis das Versprechen aufgelöst wird. */
  memberGates = new Map<string, Promise<void>>();
  /** Test-Hilfe: lässt readMember für eine uid mit diesem Fehler scheitern (nach dem Gate). */
  memberErrors = new Map<string, unknown>();

  async readMember(uid: string): Promise<MemberRecord | null> {
    this.calls.push(`member:${uid}`);
    await this.memberGates.get(uid);
    if (this.memberErrors.has(uid)) throw this.memberErrors.get(uid);
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
    store.set(playerId, { playerId, note });
    this.privateNotes.set(eventId, store);
    this.emitSub('privateNotes', eventId);
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

  // --- Unterkollektionen eines Spielers: Förderpläne, Abwesenheiten, Messwerte ---
  /** Schlüssel: `${playerId}/${kind}`, dann Dokument-ID → Daten. */
  playerRecords = new Map<string, Map<string, Record<string, unknown>>>();
  watchPlayerRecordsError: unknown = null;
  savePlayerRecordError: unknown = null;
  deletePlayerRecordError: unknown = null;
  saveSelfReflectionError: unknown = null;
  recordWatchers = 0;
  private recordListeners = new Map<string, { onData: (docs: RawDoc[], meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  private emitRecords(key: string): void {
    const docs = [...(this.playerRecords.get(key) ?? new Map())].map(([id, data]) => ({ id, data }));
    this.recordListeners.get(key)?.onData(docs, { fromCache: false, hasPendingWrites: false });
  }

  async watchPlayerRecords(
    playerId: string,
    name: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchPlayerRecords:${playerId}:${name}`);
    if (this.watchPlayerRecordsError) throw this.watchPlayerRecordsError;
    this.recordWatchers += 1;
    const key = `${playerId}/${name}`;
    this.recordListeners.set(key, { onData, onError });
    this.emitRecords(key);
    return () => {
      this.recordWatchers -= 1;
      this.recordListeners.delete(key);
    };
  }

  readPlayerRecordsError: unknown = null;

  async readPlayerRecords(playerId: string, name: string): Promise<RawDoc[]> {
    this.calls.push(`readPlayerRecords:${playerId}:${name}`);
    if (this.readPlayerRecordsError) throw this.readPlayerRecordsError;
    return [...(this.playerRecords.get(`${playerId}/${name}`) ?? new Map())].map(([id, data]) => ({ id, data }));
  }

  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`readRatingDoc:${eventId}:${playerId}`);
    return this.ratings.get(eventId)?.get(playerId) ?? null;
  }

  failPlayerRecords(playerId: string, name: string, error: unknown): void {
    this.recordListeners.get(`${playerId}/${name}`)?.onError(error);
  }

  async savePlayerRecord(playerId: string, name: string, id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePlayerRecord:${playerId}:${name}:${id}`);
    if (this.savePlayerRecordError) throw this.savePlayerRecordError;
    const key = `${playerId}/${name}`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(id, { ...data, playerId });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }

  async deletePlayerRecord(playerId: string, name: string, id: string): Promise<void> {
    this.calls.push(`deletePlayerRecord:${playerId}:${name}:${id}`);
    if (this.deletePlayerRecordError) throw this.deletePlayerRecordError;
    const key = `${playerId}/${name}`;
    this.playerRecords.get(key)?.delete(id);
    this.emitRecords(key);
  }

  async saveSelfReflection(playerId: string, planId: string, text: string, at: string): Promise<void> {
    this.calls.push(`saveSelfReflection:${playerId}:${planId}`);
    if (this.saveSelfReflectionError) throw this.saveSelfReflectionError;
    const key = `${playerId}/developmentPlans`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(planId, { ...store.get(planId), selfReflection: text, selfReflectionAt: at });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }
}
