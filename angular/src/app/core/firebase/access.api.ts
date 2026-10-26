import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { normalizeRole } from '../auth/role';
import type { StaffRole } from '../access/access';
import { FirebaseConnection } from './firebase-connection';
import type { InviteRecord, MemberRecord, RawDoc } from './types';

/** Zugänge: Mitglieder (members), Einladungscodes (invites) und Trainer-, Scout- und Medizin-Konten. */
@Injectable({ providedIn: 'root' })
export class AccessApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async readMember(uid: string, teamId: string = this.team.id()): Promise<MemberRecord | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', teamId, 'members', uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    // Bisherige Scout-Konten tragen noch „medical“ und werden hier zu Scouts (SCRUM-170).
    const role = normalizeRole(data['role']);
    if (!role) return null;
    const expires = data['expiresAt'] as { toDate?: () => Date } | null | undefined;
    return {
      role,
      playerId: typeof data['playerId'] === 'string' ? data['playerId'] : null,
      expiresAt: expires?.toDate ? expires.toDate() : null,
    };
  }

  async readInvite(code: string): Promise<InviteRecord | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', this.team.id(), 'invites', code));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const expires = data['expiresAt'] as { toDate?: () => Date } | null | undefined;
    return {
      role: data['role'] === 'parent' ? 'parent' : 'player',
      playerId: String(data['playerId'] ?? ''),
      expiresAt: expires?.toDate ? expires.toDate() : null,
      expiresAtRaw: data['expiresAt'] ?? null,
    };
  }

  /**
   * Legt die Mitgliedschaft an und verbraucht den Code in einem Schritt (atomar): ein Code
   * kann dadurch weder wiederverwendet noch nach erfolgreicher Anmeldung weitergegeben werden.
   */
  async claimInvite(uid: string, code: string, invite: InviteRecord): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', this.team.id(), 'members', uid), {
      role: invite.role,
      playerId: invite.playerId,
      claimedInviteCode: code,
      // Für die Teamsuche (SCRUM-180/181): uid = Dokument-ID, sonst taucht der Zugang nicht unter „meine Teams“ auf.
      uid,
      expiresAt: invite.expiresAtRaw ?? null,
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'teams', this.team.id(), 'invites', code));
    await batch.commit();
  }

  /** Alle Zugänge (members) lesen. Die Regeln erlauben die Liste nur Trainern. */
  async readMembers(): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', this.team.id(), 'members'));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /** Alle offenen Einladungscodes lesen (nur Trainer dürfen auflisten). */
  async readInvites(): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', this.team.id(), 'invites'));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /** Legt einen Einladungscode für einen Spieler oder ein Elternteil an (`expiresAt` null = unbefristet). */
  async createInvite(code: string, data: { playerId: string; role: 'player' | 'parent'; expiresAt: Date | null }): Promise<void> {
    const { db } = await this.connection.get();
    const { Timestamp, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'invites', code), {
      playerId: data.playerId,
      role: data.role,
      expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : null,
      createdAt: serverTimestamp(),
    });
  }

  /** Sperrt einen Zugang (löscht das members-Dokument). */
  async deleteMember(uid: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'members', uid));
  }

  /** Zieht einen noch nicht eingelösten Einladungscode zurück. */
  async deleteInvite(code: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'invites', code));
  }

  /**
   * Legt ein Trainer-, Scout- oder Medizin-Konto an: Anmeldekonto und members-Dokument in einem Schritt.
   * Das Anmeldekonto entsteht über eine zweite, temporäre App-Instanz: `createUserWithEmailAndPassword`
   * meldet sonst die eigene, gerade aktive Trainer-Sitzung ab und als das neue Konto an. Das members-Dokument
   * schreibt die normale Instanz, also weiterhin als der eingeloggte Trainer (so verlangen es die Regeln).
   * Die zweite Instanz wird immer wieder abgemeldet und entfernt. Gibt die UID des neuen Kontos zurück.
   */
  async createStaffAccount(email: string, password: string, role: StaffRole): Promise<string> {
    const { app, db } = await this.connection.get();
    const [{ deleteApp, initializeApp }, { createUserWithEmailAndPassword, getAuth, signOut }, { doc, serverTimestamp, setDoc }] =
      await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const secondary = initializeApp(app.options, `staff-create-${Date.now()}`);
    const secondaryAuth = getAuth(secondary);
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = credential.user.uid;
      await setDoc(doc(db, 'teams', this.team.id(), 'members', uid), { role, email, uid, createdAt: serverTimestamp() });
      return uid;
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondary).catch(() => undefined);
    }
  }
}
