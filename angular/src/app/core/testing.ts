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
}
