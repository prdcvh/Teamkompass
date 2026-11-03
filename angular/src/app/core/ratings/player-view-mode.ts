import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerStatsApi } from '../firebase/player-stats.api';
import { PlayerViewApi } from '../firebase/player-view.api';
import { PLAYER_VIEW_VERSION } from './player-view';

/**
 * Stand der Kopien für die Spieleransicht (SCRUM-115), abgeleitet aus dem Kennzeichen `meta/playerView` – wie
 * {@link PlayerStatsMode} für die Zusammenfassungen:
 * - `loading`: noch keine Antwort.
 * - `on`: alle bestehenden Bewertungen sind übernommen.
 * - `absent`: der Server kennt kein (passendes) Kennzeichen – die Übernahme läuft automatisch (`migrating`).
 * - `migrating`: die Übernahme läuft gerade.
 * - `cacheMissing`: offline und nichts im Zwischenspeicher – keine Übernahme, bis der Server antwortet.
 * - `denied`: die Regeln kennen die Kopien noch nicht (Regeln älter als die App) – Bewertungen werden wie bisher
 *   ohne Kopien gespeichert, damit das Speichern nicht scheitert.
 * - `error`: anderer Fehler.
 * Nur für Trainer; alle anderen Rollen lesen das Kennzeichen nicht.
 */
export type PlayerViewState = 'loading' | 'on' | 'absent' | 'migrating' | 'cacheMissing' | 'denied' | 'error';

const RESOLVE_TIMEOUT_MS = 4000;
/** Wartezeit bis zum nächsten Versuch nach einer gescheiterten Übernahme. */
const RETRY_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PlayerViewMode {
  private readonly api = inject(PlayerViewApi);
  private readonly statsApi = inject(PlayerStatsApi);
  private readonly session = inject(SessionService);

  readonly state = signal<PlayerViewState>('loading');
  /** Alle Bewertungen sind übernommen – erst dann ist „Bewertung veröffentlichen“ vollständig. */
  readonly ready = computed(() => this.state() === 'on');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private waiters: (() => void)[] = [];
  private migrating = false;

  constructor() {
    effect(() => {
      const trainer = this.session.role() === 'trainer';
      untracked(() => (trainer ? this.start() : this.stop()));
    });
  }

  /** Werden beim Speichern einer Bewertung die Kopien mitgeschrieben? Ja, außer die Regeln lehnen sie ab. */
  async writesCopies(): Promise<boolean> {
    if (this.state() === 'loading' && this.session.role() === 'trainer') await this.resolved();
    return this.state() !== 'denied';
  }

  private resolved(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, RESOLVE_TIMEOUT_MS);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.waiters.push(done);
    });
  }

  private set(state: PlayerViewState): void {
    this.state.set(state);
    if (state === 'loading') return;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((done) => done());
  }

  private start(): void {
    if (this.unsubscribe) return;
    const generation = ++this.generation;
    this.set('loading');
    this.unsubscribe = () => undefined; // Platzhalter, bis das Abo steht
    this.api
      .watchMarker(
        (data, meta) => {
          if (generation !== this.generation) return;
          if (data && data['version'] === PLAYER_VIEW_VERSION) this.set('on');
          else if (!data && meta.fromCache) this.set('cacheMissing');
          else {
            this.set('absent');
            void this.migrate(generation);
          }
        },
        (error) => {
          if (generation !== this.generation) return;
          console.error(error);
          this.set(errorCode(error) === 'permission-denied' ? 'denied' : 'error');
        },
      )
      .then((unsubscribe) => {
        if (generation === this.generation) this.unsubscribe = unsubscribe;
        else unsubscribe();
      })
      .catch((error) => {
        if (generation !== this.generation) return;
        console.error(error);
        this.unsubscribe = null;
        this.set('error');
      });
  }

  /**
   * Übernahme: liest alle Bewertungen einmal vom Server und legt die Kopien an. Die Noten bekommen dabei den Zeitpunkt
   * der Übernahme – sie sind für Spieler erst sichtbar, wenn der Trainer danach veröffentlicht (keine automatische
   * Freigabe, PO 02.11.2026). Läuft je Gerät höchstens einmal gleichzeitig; scheitert sie, beim nächsten Start erneut.
   */
  private async migrate(generation: number): Promise<void> {
    if (this.migrating) return;
    this.migrating = true;
    this.state.set('migrating');
    try {
      const ratings = await this.statsApi.readAllRatings();
      if (generation !== this.generation) return;
      await this.api.writeCopies(ratings, { version: PLAYER_VIEW_VERSION, builtAt: new Date().toISOString() });
    } catch (error) {
      console.error('Übernahme der Bewertungen für die Spieleransicht fehlgeschlagen.', error);
      if (generation !== this.generation) return;
      const denied = errorCode(error) === 'permission-denied';
      this.set(denied ? 'denied' : 'error');
      // Zum Beispiel offline: nach einer Minute erneut versuchen (solange noch kein Kennzeichen da ist).
      if (!denied) {
        setTimeout(() => {
          if (generation === this.generation && this.state() === 'error') void this.migrate(generation);
        }, RETRY_MS);
      }
    } finally {
      this.migrating = false;
    }
  }

  private stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.set('loading');
  }
}
