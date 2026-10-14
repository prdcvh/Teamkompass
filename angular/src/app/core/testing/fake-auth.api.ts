import type { AuthApi } from '../firebase/auth.api';
import type { FirebaseUser } from '../firebase/types';

/** Ersatz für {@link AuthApi} in Tests: speichert Aufrufe und meldet Anmeldezustände wie Firebase. */
export class FakeAuthApi implements Pick<AuthApi, keyof AuthApi> {
  watchError: unknown = null;
  emailError: unknown = null;
  nextUid = 'uid-1';
  private listener: ((user: FirebaseUser | null) => void) | null = null;

  constructor(readonly calls: string[] = []) {}

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

  resetError: unknown = null;
  changePasswordError: unknown = null;

  async sendPasswordReset(email: string): Promise<void> {
    this.calls.push(`reset:${email}`);
    if (this.resetError) throw this.resetError;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    this.calls.push(`changePassword:${currentPassword}:${newPassword}`);
    if (this.changePasswordError) throw this.changePasswordError;
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
}
