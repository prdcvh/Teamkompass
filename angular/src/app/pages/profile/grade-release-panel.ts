import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { parseExpiryDays, expiryFromDays } from '../../core/access/access';
import { authErrorMessage, errorCode } from '../../core/auth/auth-errors';
import { SessionService } from '../../core/auth/session.service';
import { GradeReleasesApi } from '../../core/firebase/grade-releases.api';
import { type Player } from '../../core/player/player';
import { type GradeRelease, isReleaseActive, releaseFromDoc, releaseText } from '../../core/ratings/grade-release';
import { PlayerViewMode } from '../../core/ratings/player-view-mode';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

type Pending = 'publish' | 'revoke';

/**
 * „Bewertung veröffentlichen“ im Spielerprofil (nur Trainer, SCRUM-115). Spieler und Eltern sehen ihre Werte (Minuten,
 * Tore, Vorlagen, Anwesenheit) immer, ihre Noten erst nach einer Veröffentlichung: freigegeben werden die Noten, die bis
 * zum Klick vergeben wurden, für die gewählte Dauer (wie bei Einladungscodes, leer = unbefristet). Kommentare nie.
 * Der Trainer sieht, ob und bis wann eine Freigabe läuft, und kann sie zurücknehmen.
 */
@Component({
  selector: 'tk-grade-release-panel',
  imports: [Button, Card, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-card>
      <section class="release" aria-labelledby="release-title">
        <div class="head">
          <h2 id="release-title">Noten für {{ player().name }}</h2>
          <span class="pill" [attr.data-state]="active() ? 'on' : 'off'">{{ active() ? 'Veröffentlicht' : 'Nicht veröffentlicht' }}</span>
        </div>
        <p role="status">{{ statusText() }}</p>
        <p class="muted">Werte (Einsatzzeit, Tore, Vorlagen, Anwesenheit) sieht der Spieler immer. Kommentare zur Bewertung sieht er nie.</p>
        @if (!copiesReady()) {
          <p class="muted" role="status">Die Bewertungen werden gerade für die Spieleransicht eingerichtet – Veröffentlichen geht gleich.</p>
        }
        @if (failure()) {
          <p class="error" role="alert">{{ failure() }}</p>
        }
        <div class="actions">
          <button tkButton size="sm" type="button" variant="primary" [disabled]="!copiesReady() || loading()" (click)="ask('publish')">
            {{ active() ? 'Erneut veröffentlichen (bis jetzt)' : 'Bewertung veröffentlichen' }}
          </button>
          @if (release()) {
            <button tkButton size="sm" type="button" class="danger" (click)="ask('revoke')">Freigabe zurücknehmen</button>
          }
        </div>
      </section>
    </tk-card>

    <tk-dialog [open]="pending() !== null" [title]="pending() === 'revoke' ? 'Freigabe zurücknehmen?' : 'Bewertung veröffentlichen'" (closed)="cancel()">
      @if (pending() === 'publish') {
        <form (submit)="confirm($event)" novalidate>
          <p>{{ player().name }} (und die Eltern) sehen danach alle Noten, die bis jetzt vergeben wurden. Spätere Noten erst nach der nächsten Veröffentlichung. Kommentare bleiben verborgen.</p>
          <label class="tk-label">
            Befristung in Tagen (optional)
            <input
              class="tk-input"
              name="days"
              inputmode="numeric"
              autocomplete="off"
              placeholder="leer = unbefristet"
              [value]="days()"
              [attr.aria-invalid]="daysError() ? 'true' : null"
              (input)="days.set(value($event))"
            />
          </label>
          @if (daysError()) {
            <span class="error" role="alert">{{ daysError() }}</span>
          }
          <div class="confirm-actions">
            <button tkButton type="button" (click)="cancel()">Abbrechen</button>
            <button tkButton type="submit" variant="primary" [disabled]="busy()">{{ busy() ? 'Bitte warten …' : 'Veröffentlichen' }}</button>
          </div>
        </form>
      } @else {
        <p>{{ player().name }} (und die Eltern) sehen danach keine Noten mehr, bis du erneut veröffentlichst. Die Werte bleiben sichtbar.</p>
        <div class="confirm-actions">
          <button tkButton type="button" (click)="cancel()">Abbrechen</button>
          <button tkButton type="button" variant="primary" class="danger" [disabled]="busy()" (click)="confirm($event)">{{ busy() ? 'Bitte warten …' : 'Zurücknehmen' }}</button>
        </div>
      }
    </tk-dialog>
  `,
  styleUrl: './grade-release-panel.css',
})
export class GradeReleasePanel {
  private readonly api = inject(GradeReleasesApi);
  private readonly session = inject(SessionService);
  private readonly viewMode = inject(PlayerViewMode);

  readonly player = input.required<Player>();

  protected readonly release = signal<GradeRelease | null>(null);
  protected readonly loading = signal(true);
  private readonly now = signal(new Date());
  protected readonly active = computed(() => isReleaseActive(this.release(), this.now()));
  protected readonly statusText = computed(() => (this.loading() ? 'Freigabe wird geladen …' : releaseText(this.release(), this.now())));
  protected readonly copiesReady = this.viewMode.ready;
  protected readonly pending = signal<Pending | null>(null);
  protected readonly days = signal('');
  protected readonly daysError = signal('');
  protected readonly busy = signal(false);
  protected readonly failure = signal('');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      const id = this.player().id;
      untracked(() => this.watch(id));
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation += 1;
      this.unsubscribe?.();
    });
  }

  private watch(playerId: string): void {
    const generation = ++this.generation;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.release.set(null);
    this.loading.set(true);
    this.failure.set('');
    this.api
      .watchRelease(
        playerId,
        (data) => {
          if (generation !== this.generation) return;
          this.now.set(new Date());
          this.release.set(releaseFromDoc(data));
          this.loading.set(false);
        },
        (error) => {
          if (generation !== this.generation) return;
          console.error(error);
          this.loading.set(false);
          this.failure.set(`Die Freigabe konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
        },
      )
      .then((unsubscribe) => {
        if (generation === this.generation) this.unsubscribe = unsubscribe;
        else unsubscribe();
      })
      .catch((error) => {
        if (generation !== this.generation) return;
        console.error(error);
        this.loading.set(false);
      });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected ask(kind: Pending): void {
    this.days.set('');
    this.daysError.set('');
    this.failure.set('');
    this.pending.set(kind);
  }

  protected cancel(): void {
    if (!this.busy()) this.pending.set(null);
  }

  protected async confirm(event: Event): Promise<void> {
    event.preventDefault();
    const kind = this.pending();
    if (!kind || this.busy()) return;
    let expiresAt: Date | null = null;
    if (kind === 'publish') {
      const days = parseExpiryDays(this.days());
      if (days === undefined) {
        this.daysError.set('Bitte eine ganze Zahl von 1 bis 365 eingeben oder das Feld leer lassen.');
        return;
      }
      expiresAt = expiryFromDays(days);
    }
    this.busy.set(true);
    try {
      if (kind === 'publish') await this.api.publish(this.player().id, expiresAt);
      else await this.api.revoke(this.player().id);
      this.pending.set(null);
    } catch (error) {
      console.error(error);
      this.failure.set(
        `${kind === 'publish' ? 'Die Noten konnten nicht veröffentlicht werden.' : 'Die Freigabe konnte nicht zurückgenommen werden.'} ${authErrorMessage(errorCode(error), this.session.role())}`,
      );
      this.pending.set(null);
    } finally {
      this.busy.set(false);
    }
  }
}
