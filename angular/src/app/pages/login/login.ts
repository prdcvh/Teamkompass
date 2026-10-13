import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AccountService } from '../../core/account.service';
import { AuthService } from '../../core/auth.service';
import { homeFor } from '../../core/role';
import { SessionService } from '../../core/session.service';
import { Button } from '../../ui/button/button';

type Tab = 'trainer' | 'code';

/** Figma „01 Anmeldung“ / „01b Login Spieler/Eltern“: Trainer-Login und Einladungscode. */
@Component({
  selector: 'app-login',
  imports: [FormsModule, Button],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tab = signal<Tab>('trainer');
  protected readonly showPassword = signal(false);
  /** „Passwort vergessen?“: zeigt statt der Anmeldung das Formular zum Zurücksetzen. */
  protected readonly resetting = signal(false);
  protected readonly resetMessage = signal('');
  protected readonly resetFailed = signal(false);
  protected readonly resetBusy = signal(false);
  protected email = '';
  protected password = '';
  protected code = '';
  protected readonly club = environment.clubName;
  protected readonly team = environment.teamLabel;

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

  protected async submitTrainer(): Promise<void> {
    await this.auth.signInTrainer(this.email, this.password);
    await this.leaveIfSignedIn();
  }

  protected async submitCode(): Promise<void> {
    await this.auth.signInWithCode(this.code);
    await this.leaveIfSignedIn();
  }

  private async leaveIfSignedIn(): Promise<void> {
    if (this.auth.status() === 'ready') await this.router.navigateByUrl(homeFor(this.session.role()));
  }
}
