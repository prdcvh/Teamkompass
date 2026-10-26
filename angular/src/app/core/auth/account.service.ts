import { Injectable, inject } from '@angular/core';
import { passwordProblem, validateStaffDraft } from '../access/access';
import { authErrorMessage, errorCode } from './auth-errors';
import { AuthApi } from '../firebase/auth.api';
import { SessionService } from './session.service';

export type AccountResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Passwort vergessen, Passwort ändern und – für Spieler mit reinem Code-Zugang – E-Mail verbinden (SCRUM-114). */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly authApi = inject(AuthApi);
  private readonly session = inject(SessionService);

  /**
   * Schickt die Mail zum Zurücksetzen. Ob zur Adresse ein Konto existiert, wird nicht verraten: auch bei einer
   * unbekannten Adresse lautet das Ergebnis „ok“ (keine Konto-Erkennung).
   */
  async requestReset(rawEmail: string): Promise<AccountResult> {
    const email = rawEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
    try {
      await this.authApi.sendPasswordReset(email);
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
      await this.authApi.changePassword(current, next);
      return { ok: true };
    } catch (error) {
      const code = errorCode(error);
      if (code.includes('wrong-password') || code.includes('invalid-credential')) return { ok: false, message: 'Das aktuelle Passwort ist falsch.' };
      return { ok: false, message: authErrorMessage(code) };
    }
  }

  /**
   * Verbindet einen bestehenden Spieler-Zugang (nur Einladungscode, anonym) nachträglich mit E-Mail und Passwort
   * (SCRUM-114). Die Benutzer-ID bleibt gleich; Rolle, Spielerprofil, Befristung und Sperre ändern sich dadurch nicht.
   * Nur für Spieler-Zugänge ohne E-Mail – Trainer-, Scout- und Medizin-Konten haben schon eine.
   */
  async connectEmail(email: string, password: string, repeat: string): Promise<AccountResult> {
    const uid = this.session.uid();
    const role = this.session.role();
    if (!uid || (role !== 'player' && role !== 'parent')) return { ok: false, message: 'Nur Spieler-Zugänge können mit einer E-Mail verbunden werden.' };
    if (this.session.email()) return { ok: false, message: authErrorMessage('auth/provider-already-linked') };
    const errors = validateStaffDraft({ email, password, repeat });
    const problem = errors.email ?? errors.password ?? errors.repeat;
    if (problem) return { ok: false, message: problem };
    try {
      const user = await this.authApi.linkEmail(uid, email.trim(), password);
      // Gleiche Identität (keine neue Prüfung nötig): nur die angezeigte E-Mail nachziehen.
      if (this.session.uid() === uid) this.session.email.set(user.email);
      return { ok: true };
    } catch (error) {
      console.error(error);
      return { ok: false, message: authErrorMessage(errorCode(error)) };
    }
  }
}
