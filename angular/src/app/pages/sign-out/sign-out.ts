import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { homeFor } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * „Abmelden“ aus Navigation und Mehr-Sheet: meldet ab, leert lokale Daten und geht zur Anmeldung.
 * Spieler und Eltern haben nur eine anonyme Anmeldung mit Einmal-Code: nach dem Abmelden kommen sie nur mit einem
 * neuen Code vom Trainer wieder hinein (SCRUM-32). Sie bekommen deshalb vorher eine klare Warnung.
 */
@Component({
  selector: 'app-sign-out',
  imports: [Button, Card],
  template: `
    @if (warn()) {
      <section class="page">
        <tk-card>
          <div class="panel">
            <h1>Wirklich abmelden?</h1>
            <p>
              Danach kommst du nur mit einem <strong>neuen Einladungscode</strong> von deinem Trainer wieder hinein. Der bisherige Code ist
              verbraucht und lässt sich nicht noch einmal verwenden.
            </p>
            <div class="actions">
              <button tkButton type="button" (click)="cancel()">Angemeldet bleiben</button>
              <button tkButton type="button" variant="primary" (click)="confirm()">Abmelden</button>
            </div>
          </div>
        </tk-card>
      </section>
    } @else {
      <p>Du wirst abgemeldet …</p>
    }
  `,
  styles: `
    .page {
      max-width: 560px;
      padding: var(--tk-space-5);
    }
    .panel {
      display: grid;
      gap: var(--tk-space-3);
    }
    h1,
    p {
      margin: 0;
    }
    h1 {
      font-size: var(--tk-text-title);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tk-space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignOut {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly role = this.session.role();

  /** Anonyme Zugänge (Spieler, Eltern) verlieren mit dem Abmelden ihren Zugang. */
  protected readonly warn = computed(() => this.role === 'player' || this.role === 'parent');

  constructor() {
    if (!this.warn()) this.confirm();
  }

  protected confirm(): void {
    void this.auth.signOut().then(() => this.router.navigateByUrl('/anmelden'));
  }

  protected cancel(): void {
    void this.router.navigateByUrl(homeFor(this.role));
  }
}
