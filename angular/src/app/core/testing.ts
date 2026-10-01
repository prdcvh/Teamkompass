import { FirebaseService, type FirebaseUser, type InviteRecord, type MemberRecord } from './firebase.service';

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
}
