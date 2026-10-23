import { Injectable, inject } from '@angular/core';
import { FirebaseConnection } from './firebase-connection';
import type { FirebaseUser } from './types';

/** Anmelden, Abmelden und Passwort (Firebase Auth). */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly connection = inject(FirebaseConnection);

  /** Meldet jede Änderung des Anmeldezustands. Gibt die Funktion zum Beenden zurück. */
  async watchAuth(callback: (user: FirebaseUser | null) => void): Promise<() => void> {
    const { auth } = await this.connection.get();
    const { onAuthStateChanged } = await import('firebase/auth');
    return onAuthStateChanged(auth, (user) =>
      callback(user ? { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email, emailVerified: user.emailVerified } : null),
    );
  }

  async signInWithEmail(email: string, password: string): Promise<FirebaseUser> {
    const { auth } = await this.connection.get();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    return { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email, emailVerified: user.emailVerified };
  }

  /**
   * Anonyme Anmeldung für Spieler/Eltern. Erst danach darf der Code gelesen werden (die
   * Regeln erlauben das nur Angemeldeten); der frische Token wird erzwungen, weil es sonst
   * kurz zu permission-denied kommen kann.
   */
  async signInAnonymously(): Promise<string> {
    const { auth } = await this.connection.get();
    const { signInAnonymously } = await import('firebase/auth');
    const credential = await signInAnonymously(auth);
    await credential.user.getIdToken(true);
    return credential.user.uid;
  }

  /** Schickt die Mail zum Zurücksetzen des Passworts (der Nutzer setzt es selbst über den Link in der Mail). */
  async sendPasswordReset(email: string): Promise<void> {
    const { auth } = await this.connection.get();
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(auth, email);
  }

  /** Ändert das Passwort des angemeldeten Kontos; das aktuelle Passwort wird dafür erneut bestätigt. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const { auth } = await this.connection.get();
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
    const user = auth.currentUser;
    if (!user?.email) throw Object.assign(new Error('no-email-user'), { code: 'auth/requires-recent-login' });
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  }

  async signOut(): Promise<void> {
    const { auth } = await this.connection.get();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  }

  /** Leert den lokalen Firestore-Speicher des Browsers (Datenschutz beim Abmelden, SCRUM-199). Rückgabe: konnte geleert werden? */
  clearLocalCache(): Promise<boolean> {
    return this.connection.clearLocalCache();
  }
}
