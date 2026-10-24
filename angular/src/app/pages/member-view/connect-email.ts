import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MIN_PASSWORD_LENGTH } from '../../core/access/access';
import { AccountService } from '../../core/auth/account.service';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Spieler-Konto mit E-Mail (SCRUM-114) in der Spieleransicht:
 * - Zugang nur per Einladungscode (anonym): Hinweis, dass er nach dem Abmelden oder auf einem anderen Gerät weg ist,
 *   und ein Formular, um ihn nachträglich mit E-Mail und Passwort zu verbinden (gleiche Benutzer-ID, gleiches Profil).
 * - Zugang mit E-Mail: nur eine kurze Zeile, mit welcher Adresse man angemeldet ist.
 * Für Trainer, Scout und Medizin wird nichts angezeigt.
 */
@Component({
  selector: 'tk-connect-email',
  imports: [Button, Card],
  template: `
    @if (isPlayer()) {
      @if (email(); as address) {
        <p class="connect-done" role="status">Angemeldet mit <strong>{{ address }}</strong>. Auf jedem Gerät mit dieser E-Mail und deinem Passwort anmelden.</p>
      } @else {
        <tk-card>
          <section class="connect" aria-labelledby="connect-title">
            <h2 id="connect-title">Zugang mit E-Mail sichern</h2>
            @if (auth.notice()) {
              <p class="connect-warning" role="alert">{{ auth.notice() }}</p>
            } @else {
              <p class="connect-text">
                Du bist nur mit dem Einladungscode angemeldet. Nach dem Abmelden oder auf einem anderen Gerät brauchst du sonst einen neuen Code.
                Mit E-Mail und Passwort bleibt dein Profil auf jedem Gerät erreichbar.
              </p>
            }
            @if (!open()) {
              <button tkButton type="button" variant="primary" (click)="open.set(true)">Mit E-Mail verbinden</button>
            } @else {
              <form class="connect-form" (submit)="submit($event)" novalidate>
                <label class="tk-label">
                  E-Mail
                  <input class="tk-input" type="email" name="connectEmail" autocomplete="email" required [value]="draftEmail()" (input)="draftEmail.set(value($event))" />
                </label>
                <label class="tk-label">
                  Passwort festlegen
                  <input class="tk-input" type="password" name="connectPassword" autocomplete="new-password" required aria-describedby="connect-password-hint" [value]="draftPassword()" (input)="draftPassword.set(value($event))" />
                </label>
                <span class="connect-hint" id="connect-password-hint">Mindestens {{ minPassword }} Zeichen, mit Groß- und Kleinbuchstaben und einer Ziffer.</span>
                <label class="tk-label">
                  Passwort wiederholen
                  <input class="tk-input" type="password" name="connectRepeat" autocomplete="new-password" required [value]="draftRepeat()" (input)="draftRepeat.set(value($event))" />
                </label>
                @if (failure()) {
                  <p class="connect-error" role="alert">{{ failure() }}</p>
                }
                <div class="connect-actions">
                  <button tkButton type="button" (click)="cancel()">Abbrechen</button>
                  <button tkButton variant="primary" type="submit" [disabled]="busy()" [attr.aria-busy]="busy()">{{ busy() ? 'Wird verbunden …' : 'Verbinden' }}</button>
                </div>
              </form>
            }
          </section>
        </tk-card>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .connect,
    .connect-form {
      display: grid;
      gap: var(--tk-space-3);
    }
    .connect > button {
      justify-self: start;
    }
    h2,
    p {
      margin: 0;
    }
    h2 {
      font-size: var(--tk-text-lg, 18px);
    }
    .connect-text,
    .connect-hint,
    .connect-done {
      color: var(--tk-muted);
      font-size: var(--tk-text-sm);
    }
    .connect-hint {
      margin-top: calc(-1 * var(--tk-space-2));
    }
    .connect-warning,
    .connect-error {
      padding: var(--tk-space-3);
      color: var(--tk-red-dark);
      background: var(--tk-soft-red);
      border-radius: var(--tk-radius-md);
      font-size: var(--tk-text-sm);
      font-weight: 600;
    }
    .connect-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tk-space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectEmail {
  protected readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly session = inject(SessionService);

  protected readonly isPlayer = computed(() => this.session.role() === 'player' || this.session.role() === 'parent');
  protected readonly email = this.session.email;
  protected readonly minPassword = MIN_PASSWORD_LENGTH;
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly draftEmail = signal('');
  protected readonly draftPassword = signal('');
  protected readonly draftRepeat = signal('');

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected cancel(): void {
    this.open.set(false);
    this.failure.set('');
    this.draftPassword.set('');
    this.draftRepeat.set('');
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.failure.set('');
    try {
      const result = await this.account.connectEmail(this.draftEmail(), this.draftPassword(), this.draftRepeat());
      if (!result.ok) {
        this.failure.set(result.message);
        return;
      }
      this.auth.notice.set('');
      this.cancel();
    } finally {
      this.busy.set(false);
    }
  }
}
