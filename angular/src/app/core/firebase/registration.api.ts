import { Injectable, inject } from '@angular/core';
import { type ClubInvite, type RegistrationWrite, SERVER_TIME } from '../registration/registration';
import { FirebaseConnection } from './firebase-connection';
import type { FirebaseUser } from './types';

function errorCodeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}

/** Registrierung mit Einladungscode (SCRUM-181): Konto, E-Mail-Bestätigung, Code lesen, alles in einem Schritt anlegen. */
@Injectable({ providedIn: 'root' })
export class RegistrationApi {
  private readonly connection = inject(FirebaseConnection);

  /** Legt das Konto an (meldet es dabei an) und schickt die Bestätigungsmail. */
  async createAccount(email: string, password: string, continueUrl: string): Promise<FirebaseUser> {
    const { auth } = await this.connection.get();
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await this.sendVerification(continueUrl);
    return { uid: user.uid, isAnonymous: false, email: user.email, emailVerified: user.emailVerified };
  }

  /**
   * Bestätigungsmail (erneut) schicken. Der Link führt nach der Bestätigung zurück zur Registrierung. Ist die Adresse
   * der Seite in Firebase nicht als „autorisierte Domain“ eingetragen (z. B. Vorschau-Links), geht die Mail ohne
   * Rücksprung raus – die Bestätigung funktioniert trotzdem.
   */
  async sendVerification(continueUrl: string): Promise<void> {
    const { auth } = await this.connection.get();
    const { sendEmailVerification } = await import('firebase/auth');
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error('not-signed-in'), { code: 'auth/no-current-user' });
    try {
      await sendEmailVerification(user, { url: continueUrl });
    } catch (error) {
      const code = errorCodeOf(error);
      if (!code.includes('unauthorized-continue-uri') && !code.includes('invalid-continue-uri') && !code.includes('missing-continue-uri')) throw error;
      await sendEmailVerification(user);
    }
  }

  /** Lädt den Kontostand neu. Ist die E-Mail bestätigt, wird ein frischer Token geholt (die Regeln prüfen ihn). */
  async refreshVerified(): Promise<boolean> {
    const { auth } = await this.connection.get();
    const user = auth.currentUser;
    if (!user) return false;
    await user.reload();
    if (!user.emailVerified) return false;
    await user.getIdToken(true);
    return true;
  }

  async readInvite(code: string): Promise<ClubInvite | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'clubInvites', code));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const kind = data['kind'] === 'club' || data['kind'] === 'team' ? data['kind'] : null;
    if (!kind || typeof data['clubId'] !== 'string' || typeof data['teamId'] !== 'string') return null;
    const expires = (data['expiresAt'] as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? null;
    return {
      code,
      kind,
      clubId: data['clubId'],
      teamId: data['teamId'],
      expiresAt: expires,
      email: typeof data['email'] === 'string' && data['email'] ? data['email'] : null,
    };
  }

  /** Name eines bestehenden Vereins (für „Du trittst Verein X bei“); leer, wenn unbekannt. */
  async readClubName(clubId: string): Promise<string> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'clubs', clubId));
    const name = snapshot.exists() ? snapshot.data()['name'] : '';
    return typeof name === 'string' ? name : '';
  }

  /** Führt den einen Schreibvorgang der Registrierung aus (alles oder nichts). */
  async commit(writes: readonly RegistrationWrite[]): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    for (const write of writes) {
      const [first, ...rest] = write.path;
      const ref = doc(db, first, ...rest);
      if (write.kind === 'delete') {
        batch.delete(ref);
        continue;
      }
      const data = Object.fromEntries(Object.entries(write.data ?? {}).map(([key, value]) => [key, value === SERVER_TIME ? serverTimestamp() : value]));
      batch.set(ref, data);
    }
    await batch.commit();
  }

  // --- Vereinsadmin: Beitrittscodes für den eigenen Verein ---

  /** Vereine, in denen das Konto Admin ist (Teamsuche über `admins` mit eigener uid). */
  async readMyAdminClubs(uid: string): Promise<{ clubId: string; name: string }[]> {
    const { db } = await this.connection.get();
    const { collectionGroup, getDocs, query, where } = await import('firebase/firestore');
    const snapshot = await getDocs(query(collectionGroup(db, 'admins'), where('uid', '==', uid)));
    const clubIds = snapshot.docs.filter((entry) => entry.ref.parent.parent?.parent.id === 'clubs').map((entry) => entry.ref.parent.parent!.id);
    return Promise.all(clubIds.map(async (clubId) => ({ clubId, name: await this.readClubName(clubId) })));
  }

  async readJoinInvites(clubId: string): Promise<ClubInvite[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const snapshot = await getDocs(query(collection(db, 'clubInvites'), where('clubId', '==', clubId)));
    return snapshot.docs
      .filter((entry) => entry.data()['kind'] === 'team')
      .map((entry) => {
        const data = entry.data();
        return {
          code: entry.id,
          kind: 'team' as const,
          clubId,
          teamId: String(data['teamId'] ?? ''),
          expiresAt: (data['expiresAt'] as { toDate?: () => Date } | null)?.toDate?.() ?? null,
          email: typeof data['email'] === 'string' && data['email'] ? data['email'] : null,
        };
      });
  }

  async createJoinInvite(invite: { code: string; clubId: string; teamId: string; expiresAt: Date; email: string | null; createdBy: string }): Promise<void> {
    const { db } = await this.connection.get();
    const { Timestamp, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'clubInvites', invite.code), {
      kind: 'team',
      clubId: invite.clubId,
      teamId: invite.teamId,
      expiresAt: Timestamp.fromDate(invite.expiresAt),
      createdAt: serverTimestamp(),
      email: invite.email,
      createdBy: invite.createdBy,
    });
  }

  async deleteJoinInvite(code: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'clubInvites', code));
  }
}
