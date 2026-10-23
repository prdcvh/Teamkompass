import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { AuthService } from '../auth/auth.service';
import { AuthApi } from '../firebase/auth.api';
import { RegistrationApi } from '../firebase/registration.api';
import type { FirebaseUser } from '../firebase/types';
import {
  type AccountDraft,
  type AccountErrors,
  type ClubInvite,
  type TeamDraft,
  type TeamErrors,
  inviteProblem,
  inviteProblemText,
  normalizeInviteCode,
  registrationWrites,
  validateAccountDraft,
  validateTeamDraft,
} from './registration';

/** account: Konto anlegen oder anmelden · verify: E-Mail bestätigen · team: Verein/Team anlegen · done: fertig. */
export type RegistrationStep = 'account' | 'verify' | 'team' | 'done';

/**
 * Ablauf der Registrierung nur mit Einladung (SCRUM-181): Konto mit E-Mail und Passwort (Richtlinie SCRUM-58),
 * E-Mail bestätigen, Code prüfen, Verein/Team anlegen – alles Weitere entscheidet firestore.rules.
 */
@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly api = inject(RegistrationApi);
  private readonly authApi = inject(AuthApi);
  private readonly auth = inject(AuthService);

  readonly step = signal<RegistrationStep>('account');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly accountErrors = signal<AccountErrors>({});
  readonly teamErrors = signal<TeamErrors>({});
  readonly invite = signal<ClubInvite | null>(null);
  /** Bei einem Beitrittscode: Name des bestehenden Vereins. */
  readonly clubName = signal('');
  readonly email = signal('');
  readonly teamId = signal<string | null>(null);

  private code = '';
  private user: FirebaseUser | null = null;
  private origin = '';

  /** Seite geöffnet: ab jetzt wird ein Konto ohne Team nicht gleich wieder abgemeldet. */
  begin(origin: string): void {
    this.origin = origin;
    this.step.set('account');
    this.error.set('');
    this.notice.set('');
    this.accountErrors.set({});
    this.teamErrors.set({});
    this.invite.set(null);
    this.teamId.set(null);
    this.user = null;
    this.auth.beginRegistration();
  }

  /** Seite verlassen. Ein angefangenes Konto ohne Team wird abgemeldet (es kann später weitermachen). */
  async leave(): Promise<void> {
    this.auth.endRegistration();
    if (this.user && this.step() !== 'done') {
      this.user = null;
      await this.authApi.signOut().catch(() => undefined);
    }
  }

  private continueUrl(): string {
    return `${this.origin}/registrieren?code=${encodeURIComponent(this.code)}&weiter=1`;
  }

  /** Schritt 1, neues Konto: anlegen und Bestätigungsmail schicken. */
  async createAccount(draft: AccountDraft): Promise<void> {
    if (this.busy()) return;
    const errors = validateAccountDraft(draft);
    this.accountErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) return;
    this.code = normalizeInviteCode(draft.code);
    const email = draft.email.trim();
    this.busy.set(true);
    try {
      this.user = await this.api.createAccount(email, draft.password, this.continueUrl());
      this.email.set(email);
      this.step.set('verify');
    } catch (error) {
      const code = errorCode(error);
      this.error.set(
        code.includes('email-already-in-use')
          ? 'Zu dieser E-Mail gibt es schon ein Konto. Wähle unten „Ich habe schon ein Konto“ und melde dich an.'
          : authErrorMessage(code),
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** Schritt 1, Konto schon angelegt (z. B. nach dem Klick auf den Link in der Mail): anmelden und weitermachen. */
  async signIn(draft: Pick<AccountDraft, 'code' | 'email' | 'password'>): Promise<void> {
    if (this.busy()) return;
    const codeError = validateAccountDraft({ ...draft, password: 'Aa345678901234', repeat: 'Aa345678901234' }).code;
    const errors: AccountErrors = {};
    if (codeError) errors.code = codeError;
    if (!draft.email.trim()) errors.email = 'Bitte die E-Mail-Adresse eingeben.';
    if (!draft.password) errors.password = 'Bitte das Passwort eingeben.';
    this.accountErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) return;
    this.code = normalizeInviteCode(draft.code);
    this.busy.set(true);
    try {
      this.user = await this.authApi.signInWithEmail(draft.email.trim(), draft.password);
      this.email.set(this.user.email ?? draft.email.trim());
    } catch (error) {
      this.error.set(authErrorMessage(errorCode(error)));
      this.busy.set(false);
      return;
    }
    this.busy.set(false);
    if (this.user.emailVerified) await this.checkVerified();
    else this.step.set('verify');
  }

  /** Schritt 2: „Ich habe bestätigt“. */
  async checkVerified(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (!(await this.api.refreshVerified())) {
        this.step.set('verify');
        this.error.set('Die E-Mail-Adresse ist noch nicht bestätigt. Bitte auf den Link in der Mail klicken (auch im Spam-Ordner nachsehen).');
        return;
      }
      await this.loadInvite();
    } catch (error) {
      this.error.set(authErrorMessage(errorCode(error)));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.sendVerification(this.continueUrl());
      this.notice.set('Die Mail ist noch einmal unterwegs.');
    } catch (error) {
      this.error.set(authErrorMessage(errorCode(error)));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadInvite(): Promise<void> {
    let invite: ClubInvite | null;
    try {
      invite = await this.api.readInvite(this.code);
    } catch (error) {
      // Kein Lesezugriff = es gibt den Code nicht (oder die E-Mail ist für die Regeln noch nicht bestätigt).
      if (!errorCode(error).includes('permission-denied')) throw error;
      invite = null;
    }
    const problem = inviteProblem(invite, this.email());
    if (problem || !invite) {
      this.step.set('account');
      this.error.set(inviteProblemText(problem));
      return;
    }
    this.invite.set(invite);
    this.clubName.set(invite.kind === 'team' ? await this.api.readClubName(invite.clubId).catch(() => '') : '');
    this.step.set('team');
  }

  /** Schritt 3: Verein/Team anlegen – ein einziger Schreibvorgang, der den Code verbraucht. */
  async createTeam(draft: TeamDraft): Promise<boolean> {
    const invite = this.invite();
    if (this.busy() || !invite || !this.user) return false;
    const errors = validateTeamDraft(draft, invite.kind);
    this.teamErrors.set(errors);
    this.error.set('');
    if (Object.keys(errors).length) return false;
    this.busy.set(true);
    try {
      await this.api.commit(registrationWrites({ uid: this.user.uid, email: this.user.email ?? this.email(), invite, draft }));
    } catch (error) {
      const code = errorCode(error);
      this.error.set(
        code.includes('permission-denied')
          ? 'Das hat nicht geklappt: Der Code ist inzwischen benutzt, abgelaufen oder gilt nicht für dieses Konto. Bitte frage nach einem neuen Code.'
          : `Verein/Team konnte nicht angelegt werden. ${authErrorMessage(code)}`,
      );
      this.busy.set(false);
      return false;
    }
    try {
      this.teamId.set(invite.teamId);
      this.step.set('done');
      await this.auth.completeRegistration(this.user, invite.teamId);
      return true;
    } finally {
      this.busy.set(false);
    }
  }
}
