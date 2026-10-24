import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { MIN_PASSWORD_LENGTH, type StaffErrors, TEAM_ID_PATTERN, validateStaffDraft } from '../../core/access/access';
import { CurrentTeam } from '../../core/team/current-team.service';
import { AccountService } from '../../core/auth/account.service';
import { AuthService } from '../../core/auth/auth.service';
import { INVITE_PARAM, inviteCodeFromParam } from '../../core/auth/invite-link';
import { homeFor } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { Button } from '../../ui/button/button';

type Tab = 'email' | 'code';

/**
 * Figma „01 Anmeldung“ / „01b Login Spieler/Eltern“. Reiter „Anmelden“: E-Mail + Passwort für alle mit Konto (Trainer,
 * Scout, Medizin und seit SCRUM-114 Spieler). Reiter „Einladungscode“: einmalig Code einlösen und dabei E-Mail und
 * Passwort festlegen; danach meldet sich der Spieler auf jedem Gerät mit E-Mail und Passwort an.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, Button],
  templateUrl: './login.html',
  // Reihenfolge = Kaskade (mobile/motion überschreiben die Grundregeln).
  styleUrls: ['./login.css', './login-hero.css', './login-form.css', './login-mobile.css', './login-motion.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tab = signal<Tab>('email');
  protected readonly showPassword = signal(false);
  /** „Passwort vergessen?“: zeigt statt der Anmeldung das Formular zum Zurücksetzen. */
  protected readonly resetting = signal(false);
  protected readonly resetMessage = signal('');
  protected readonly resetFailed = signal(false);
  protected readonly resetBusy = signal(false);
  protected email = '';
  protected password = '';
  protected code = '';
  /** Registrierung mit Code (SCRUM-114): E-Mail, Passwort und Wiederholung des neuen Spieler-Kontos. */
  protected newEmail = '';
  protected newPassword = '';
  protected newRepeat = '';
  protected readonly accountErrors = signal<StaffErrors>({});
  protected readonly minPassword = MIN_PASSWORD_LENGTH;
  protected readonly club = environment.clubName;
  protected readonly team = environment.teamLabel;
  private readonly currentTeam = inject(CurrentTeam);
  /** Team aus dem Einladungslink (?team=…), SCRUM-181: damit ein Build alle Teams bedienen kann. */
  private readonly linkTeam: string | null;

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const team = params.get('team');
    this.linkTeam = team && TEAM_ID_PATTERN.test(team) ? team : null;
    const code = params.get('code');
    if (code) {
      this.code = code.trim().slice(0, 128);
      this.tab.set('code');
    }
    // Einladungslink der bisherigen App (SCRUM-169): Code vorausfüllen und aus der Adresszeile entfernen (soll nicht
    // im Verlauf stehen bleiben). Angemeldet wird erst per Knopfdruck.
    if (!params.has(INVITE_PARAM)) return;
    const invite = inviteCodeFromParam(params.get(INVITE_PARAM));
    if (invite) {
      this.code = invite;
      this.tab.set('code');
    }
    inject(Location).replaceState('/anmelden');
  }

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.auth.error.set('');
    this.resetting.set(false);
  }

  protected openReset(): void {
    this.auth.error.set('');
    this.resetMessage.set('');
    this.resetFailed.set(false);
    this.resetting.set(true);
  }

  protected closeReset(): void {
    this.resetting.set(false);
  }

  protected async submitReset(): Promise<void> {
    if (this.resetBusy()) return;
    this.resetBusy.set(true);
    try {
      const result = await this.account.requestReset(this.email);
      this.resetFailed.set(!result.ok);
      this.resetMessage.set(
        result.ok
          ? 'Wenn zu dieser E-Mail-Adresse ein Konto existiert, ist eine Nachricht mit einem Link zum Zurücksetzen unterwegs. Bitte auch den Spam-Ordner prüfen.'
          : result.message,
      );
    } finally {
      this.resetBusy.set(false);
    }
  }

  /** Pfeiltasten wechseln den Tab und setzen den Fokus mit (ARIA-Muster für Tabs). */
  protected selectByKey(tab: Tab): void {
    this.select(tab);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`#tab-${tab}`)?.focus());
  }

  protected async submitEmail(): Promise<void> {
    await this.auth.signInTrainer(this.email, this.password);
    await this.leaveIfSignedIn();
  }

  protected async submitCode(): Promise<void> {
    if (this.auth.busy()) return;
    if (!this.code.trim()) {
      this.auth.error.set('Bitte den Einladungscode eingeben.');
      return;
    }
    // Eingaben prüfen, bevor der Code angefasst wird: ein Code ist nur einmal gültig.
    const errors = validateStaffDraft({ email: this.newEmail, password: this.newPassword, repeat: this.newRepeat });
    this.accountErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.auth.error.set('');
      return;
    }
    if (this.linkTeam) this.currentTeam.select(this.linkTeam);
    await this.auth.signInWithCode(this.code, { email: this.newEmail, password: this.newPassword });
    await this.leaveIfSignedIn();
  }

  private async leaveIfSignedIn(): Promise<void> {
    if (this.auth.status() === 'ready') await this.router.navigateByUrl(homeFor(this.session.role()));
  }
}
