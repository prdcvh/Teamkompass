import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerStatsApi } from '../firebase/player-stats.api';
import { PLAYER_STATS_VERSION } from './player-stats';

/**
 * Stand der Zusammenfassungen je Spieler (SCRUM-201), abgeleitet aus dem Kennzeichen `meta/playerStats`:
 * - `loading`: noch keine Antwort.
 * - `on`: eingerichtet (Kennzeichen mit passender Version) – die Übersichten lesen die Zusammenfassungen.
 * - `absent`: der Server kennt kein (passendes) Kennzeichen – die Übersichten rechnen wie bisher aus allen Bewertungen.
 * - `cacheMissing`: offline und nichts im Zwischenspeicher – wie `absent`, bis der Server antwortet.
 * - `denied`: die Regeln kennen die neue Sammlung noch nicht (Regeln älter als die App) – wie bisher, ohne Mitschreiben.
 * - `error`: anderer Fehler – wie `absent`.
 */
export type PlayerStatsState = 'loading' | 'on' | 'absent' | 'cacheMissing' | 'denied' | 'error';

/** Wie lange ein Schreibvorgang höchstens auf die erste Antwort zum Kennzeichen wartet. */
const RESOLVE_TIMEOUT_MS = 4000;

@Injectable({ providedIn: 'root' })
export class PlayerStatsMode {
  private readonly api = inject(PlayerStatsApi);
  private readonly session = inject(SessionService);

  readonly state = signal<PlayerStatsState>('loading');
  /** Die Übersichten lesen die Zusammenfassungen statt aller Einzelbewertungen. */
  readonly reads = computed(() => this.state() === 'on');
  readonly builtAt = signal<string | null>(null);

  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private waiters: (() => void)[] = [];

  constructor() {
    effect(() => {
      const trainer = this.session.role() === 'trainer';
      untracked(() => (trainer ? this.start() : this.stop()));
    });
  }

  /**
   * Wird beim Speichern einer Bewertung die Zusammenfassung mitgeschrieben? Ja, außer die Regeln lehnen die Sammlung
   * ab: dann würde der ganze Schreibvorgang (auch die Bewertung) scheitern. Mitschreiben schadet auch vor der ersten
   * Neuberechnung nicht – die Neuberechnung ersetzt alles.
   */
  async writesSummary(): Promise<boolean> {
    if (this.state() === 'loading' && this.session.role() === 'trainer') await this.resolved();
    return this.state() !== 'denied';
  }

  private resolved(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, RESOLVE_TIMEOUT_MS);
      const waiters = this.waiters;
      function done() {
        clearTimeout(timer);
        resolve();
      }
      waiters.push(done);
    });
  }

  private set(state: PlayerStatsState): void {
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
    this.unsubscribe = () => undefined; // Platzhalter, bis das Abo steht (verhindert doppeltes Starten)
    this.api
      .watchMarker(
        (data, meta) => {
          if (generation !== this.generation) return;
          if (data && data['version'] === PLAYER_STATS_VERSION) {
            this.builtAt.set(typeof data['builtAt'] === 'string' ? data['builtAt'] : null);
            this.set('on');
          } else {
            this.builtAt.set(null);
            this.set(!data && meta.fromCache ? 'cacheMissing' : 'absent');
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
        this.set(errorCode(error) === 'permission-denied' ? 'denied' : 'error');
      });
  }

  private stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.builtAt.set(null);
    this.set('loading');
  }
}
