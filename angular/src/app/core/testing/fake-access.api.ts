import type { AccessApi } from '../firebase/access.api';
import type { InviteRecord, MemberRecord, RawDoc } from '../firebase/types';

/** Ersatz für {@link AccessApi} in Tests: Mitglieder, Einladungscodes und Konten im Speicher. */
export class FakeAccessApi implements Pick<AccessApi, keyof AccessApi> {
  members = new Map<string, MemberRecord>();
  invites = new Map<string, InviteRecord>();
  readInviteError: unknown = null;
  /** Fehler für die nächsten Aufrufe von claimInvite (jeweils einer pro Versuch). */
  claimErrors: unknown[] = [];

  constructor(readonly calls: string[] = []) {}

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

  // --- Zugangsverwaltung (members/invites, Konten über zweite App-Instanz) ---
  memberDocs = new Map<string, Record<string, unknown>>();
  inviteDocs = new Map<string, Record<string, unknown>>();
  readAccessError: unknown = null;
  createInviteError: unknown = null;
  deleteAccessError: unknown = null;
  createStaffError: unknown = null;
  nextStaffUid = 'staff-uid-1';
  lastStaffPassword = '';

  async readMembers(): Promise<RawDoc[]> {
    this.calls.push('readMembers');
    if (this.readAccessError) throw this.readAccessError;
    return [...this.memberDocs].map(([id, data]) => ({ id, data }));
  }

  async readInvites(): Promise<RawDoc[]> {
    this.calls.push('readInvites');
    if (this.readAccessError) throw this.readAccessError;
    return [...this.inviteDocs].map(([id, data]) => ({ id, data }));
  }

  async createInvite(code: string, data: { playerId: string; role: 'player' | 'parent'; expiresAt: Date | null }): Promise<void> {
    this.calls.push(`createInvite:${code}`);
    if (this.createInviteError) throw this.createInviteError;
    this.inviteDocs.set(code, { ...data });
  }

  async deleteMember(uid: string): Promise<void> {
    this.calls.push(`deleteMember:${uid}`);
    if (this.deleteAccessError) throw this.deleteAccessError;
    this.memberDocs.delete(uid);
  }

  async deleteInvite(code: string): Promise<void> {
    this.calls.push(`deleteInvite:${code}`);
    if (this.deleteAccessError) throw this.deleteAccessError;
    this.inviteDocs.delete(code);
  }

  async createStaffAccount(email: string, password: string, role: 'trainer' | 'medical' | 'scout'): Promise<string> {
    this.calls.push(`createStaff:${role}:${email}`);
    this.lastStaffPassword = password;
    if (this.createStaffError) throw this.createStaffError;
    this.memberDocs.set(this.nextStaffUid, role === 'medical' ? { role, healthAccess: true, email } : { role, email });
    return this.nextStaffUid;
  }
}
