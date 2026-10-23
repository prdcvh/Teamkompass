import type { RegistrationApi } from '../firebase/registration.api';
import type { FirebaseUser } from '../firebase/types';
import type { ClubInvite, RegistrationWrite } from '../registration/registration';
import type { FakeAuthApi } from './fake-auth.api';

/** Ersatz für {@link RegistrationApi}: Konten, Codes und der Schreibvorgang der Registrierung im Speicher. */
export class FakeRegistrationApi implements Pick<RegistrationApi, keyof RegistrationApi> {
  readonly calls: string[] = [];
  invites = new Map<string, ClubInvite>();
  clubNames = new Map<string, string>();
  adminClubs: { clubId: string; name: string }[] = [];
  /** Ist die E-Mail bestätigt (Ergebnis von refreshVerified)? */
  verified = false;
  createError: unknown = null;
  commitError: unknown = null;
  committed: RegistrationWrite[][] = [];
  nextUid = 'new-coach';

  constructor(private readonly auth?: FakeAuthApi) {}

  async createAccount(email: string, _password: string, continueUrl: string): Promise<FirebaseUser> {
    this.calls.push(`create:${email}:${continueUrl}`);
    if (this.createError) throw this.createError;
    const user = { uid: this.nextUid, isAnonymous: false, email, emailVerified: false };
    this.auth?.emit(user);
    return user;
  }

  async sendVerification(continueUrl: string): Promise<void> {
    this.calls.push(`verify-mail:${continueUrl}`);
  }

  async refreshVerified(): Promise<boolean> {
    this.calls.push('refresh');
    return this.verified;
  }

  async readInvite(code: string): Promise<ClubInvite | null> {
    this.calls.push(`invite:${code}`);
    return this.invites.get(code) ?? null;
  }

  async readClubName(clubId: string): Promise<string> {
    return this.clubNames.get(clubId) ?? '';
  }

  async commit(writes: readonly RegistrationWrite[]): Promise<void> {
    this.calls.push('commit');
    if (this.commitError) throw this.commitError;
    this.committed.push([...writes]);
    const deleted = writes.find((write) => write.kind === 'delete');
    if (deleted) this.invites.delete(deleted.path[1]);
  }

  async readMyAdminClubs(): Promise<{ clubId: string; name: string }[]> {
    return this.adminClubs;
  }

  joinInvites: ClubInvite[] = [];

  async readJoinInvites(clubId: string): Promise<ClubInvite[]> {
    return this.joinInvites.filter((invite) => invite.clubId === clubId);
  }

  async createJoinInvite(invite: { code: string; clubId: string; teamId: string; expiresAt: Date; email: string | null; createdBy: string }): Promise<void> {
    this.calls.push(`createJoin:${invite.clubId}`);
    this.joinInvites.push({ code: invite.code, kind: 'team', clubId: invite.clubId, teamId: invite.teamId, expiresAt: invite.expiresAt, email: invite.email });
  }

  async deleteJoinInvite(code: string): Promise<void> {
    this.calls.push(`deleteJoin:${code}`);
    this.joinInvites = this.joinInvites.filter((invite) => invite.code !== code);
  }
}
