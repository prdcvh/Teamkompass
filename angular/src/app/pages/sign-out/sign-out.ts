import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { homeFor } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { NOTHING_UNSENT, type UnsentChanges, UnsentChangesService, hasUnsent } from '../../core/auth/unsent-changes.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/** Überschrift der Warnung vor ungesendeten Änderungen (SCRUM-220). */
export function unsentHeadline(changes: UnsentChanges): string {
  if (changes.live === 1) return '1 Änderung ist noch nicht gespeichert – erst wieder Netz abwarten?';
  if (changes.live > 1) return `${changes.live} Änderungen sind noch nicht gespeichert – erst wieder Netz abwarten?`;
  return 'Einige Änderungen sind noch nicht gespeichert – erst wieder Netz abwarten?';
}

/**
 * „Abmelden“ aus Navigation und Mehr-Sheet: meldet ab, leert lokale Daten und geht zur Anmeldung.
 *
 * Vorher zwei mögliche Rückfragen, sonst meldet die Seite sofort ab:
 * - Warten noch Eingaben auf dem Gerät auf das Netz (Funkloch: Live-Punkte, Bewertungen, Notizen …), gingen sie beim
 *   Abmelden verloren, weil der lokale Speicher aus Datenschutzgründen geleert wird. Dann: „Warten“ oder „Trotzdem
 *   abmelden“ (SCRUM-220).
 * - Spieler und Eltern haben nur eine anonyme Anmeldung mit Einmal-Code: nach dem Abmelden kommen sie nur mit einem
 *   neuen Code vom Trainer wieder hinein (SCRUM-32) – außer ihr Zugang ist mit einer E-Mail verbunden (SCRUM-114).
 */
@Component({
  selector: 'app-sign-out',
  imports: [Button, Card],
  template: `
    @if (checking()) {
      <p>Prüfe, ob alles gespeichert ist …</p>
    } @else if (unsent() || warnAccess()) {
      <section class="page">
        <tk-card>
          <div class="panel" role="alertdialog" aria-labelledby="sign-out-title">
            @if (unsent()) {
              <h1 id="sign-out-title">{{ headline() }}</h1>
              <p>
                Dein Gerät hat gerade kein Netz (oder die Verbindung ist zu langsam). Die Änderungen werden automatisch gespeichert, sobald
                wieder Netz da ist – solange du angemeldet bleibst. Beim Abmelden wird aus Datenschutzgründen alles auf diesem Gerät gelöscht:
                <strong>nicht gespeicherte Änderungen gehen dann verloren.</strong>
              </p>
              @if (warnAccess()) {
                <p>Außerdem brauchst du nach dem Abmelden einen <strong>neuen Einladungscode</strong> von deinem Trainer.</p>
              }
              <div class="actions">
                <button tkButton type="button" variant="primary" (click)="cancel()">Warten</button>
                <button tkButton type="button" (click)="confirm()">Trotzdem abmelden (Änderungen gehen verloren)</button>
              </div>
            } @else {
              <h1 id="sign-out-title">Wirklich abmelden?</h1>
              <p>
                Danach kommst du nur mit einem <strong>neuen Einladungscode</strong> von deinem Trainer wieder hinein. Der bisherige Code ist
                verbraucht und lässt sich nicht noch einmal verwenden. Tipp: Verbinde deinen Zugang vorher in deiner Ansicht mit einer
                E-Mail-Adresse – dann meldest du dich jederzeit mit E-Mail und Passwort wieder an.
              </p>
              <div class="actions">
                <button tkButton type="button" (click)="cancel()">Angemeldet bleiben</button>
                <button tkButton type="button" variant="primary" (click)="confirm()">Abmelden</button>
              </div>
            }
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
    .panel > * {
      min-width: 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tk-space-2);
    }
    /* Lange Beschriftung („Trotzdem abmelden …“) darf am Handy umbrechen statt die Karte zu sprengen. */
    .actions button {
      white-space: normal;
      text-align: center;
      max-width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignOut {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly unsentChanges = inject(UnsentChangesService);
  private readonly role = this.session.role();

  /**
   * Anonyme Zugänge (Spieler, Eltern) verlieren mit dem Abmelden ihren Zugang. Mit E-Mail verbundene Spieler-Konten
   * (SCRUM-114) melden sich einfach wieder mit E-Mail und Passwort an – keine Warnung.
   */
  private readonly email = this.session.email();
  protected readonly warnAccess = computed(() => (this.role === 'player' || this.role === 'parent') && !this.email);

  protected readonly checking = signal(true);
  /** Beim Öffnen der Seite noch nicht gesendete Änderungen (null = keine). */
  protected readonly unsent = signal<UnsentChanges | null>(null);
  protected readonly headline = computed(() => unsentHeadline(this.unsent() ?? NOTHING_UNSENT));
  /** Schutz vor Doppel-Tippen. */
  private leaving = false;

  constructor() {
    void this.check();
  }

  private async check(): Promise<void> {
    let changes = NOTHING_UNSENT;
    try {
      changes = await this.unsentChanges.check();
    } catch (error) {
      console.error(error);
    }
    this.unsent.set(hasUnsent(changes) ? changes : null);
    this.checking.set(false);
    if (!this.unsent() && !this.warnAccess()) this.confirm();
  }

  protected confirm(): void {
    if (this.leaving) return;
    this.leaving = true;
    void this.auth.signOut().then(() => this.router.navigateByUrl('/anmelden'));
  }

  protected cancel(): void {
    void this.router.navigateByUrl(homeFor(this.role));
  }
}
