import { Injectable, inject } from '@angular/core';
import { passwordProblem } from './access';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService } from './firebase.service';

export type AccountResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Passwort vergessen und Passwort ändern für Trainer- und Medizin-Konten (E-Mail + Passwort). */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly firebase = inject(FirebaseService);

  /**
   * Schickt die Mail zum Zurücksetzen. Ob zur Adresse ein Konto existiert, wird nicht verraten: auch bei einer
   * unbekannten Adresse lautet das Ergebnis „ok“ (keine Konto-Erkennung).
   */
  async requestReset(rawEmail: string): Promise<AccountResult> {
    const email = rawEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
    try {
      await this.firebase.sendPasswordReset(email);
    } catch (error) {
      const code = errorCode(error);
      if (!code.includes('user-not-found')) return { ok: false, message: authErrorMessage(code) };
    }
    return { ok: true };
  }

  /** Ändert das Passwort des angemeldeten Kontos. Das neue Passwort muss die Richtlinie erfüllen und wiederholt werden. */
  async changePassword(current: string, next: string, repeat: string): Promise<AccountResult> {
    if (!current) return { ok: false, message: 'Bitte das aktuelle Passwort eingeben.' };
    const problem = passwordProblem(next);
    if (problem) return { ok: false, message: problem };
    if (next !== repeat) return { ok: false, message: 'Die beiden neuen Passwörter stimmen nicht überein.' };
    if (next === current) return { ok: false, message: 'Das neue Passwort muss sich vom aktuellen unterscheiden.' };
    try {
      await this.firebase.changePassword(current, next);
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      if (code.includes('wrong-password') || code.includes('invalid-credential')) return { ok: false, message: 'Das aktuelle Passwort ist falsch.' };
      return { ok: false, message: authErrorMessage(code) };
    }
  }
}
