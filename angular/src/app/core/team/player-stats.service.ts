import { Injectable, computed, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerStatsApi } from '../firebase/player-stats.api';
import { PLAYER_STATS_VERSION, type StatsDifference, buildPlayerStats, compareStats, ratingsFromDocs, rebuildPlan } from './player-stats';
import { PlayerStatsMode } from './player-stats-mode';

export interface StatsCheck {
  readonly players: number;
  readonly ratings: number;
  readonly differences: readonly StatsDifference[];
}

/**
 * Neuberechnung und Prüfung der Zusammenfassungen je Spieler (SCRUM-201), nur für Trainer und nur auf Knopfdruck:
 * Beides liest einmal alle Bewertungen aller Events (ein Lesevorgang je Bewertung).
 */
@Injectable({ providedIn: 'root' })
export class PlayerStatsService {
  private readonly api = inject(PlayerStatsApi);
  private readonly mode = inject(PlayerStatsMode);
  private readonly session = inject(SessionService);

  readonly state = this.mode.state;
  readonly builtAt = this.mode.builtAt;
  readonly available = computed(() => this.session.role() === 'trainer');
  readonly busy = signal<'idle' | 'rebuilding' | 'checking'>('idle');
  readonly result = signal<StatsCheck | null>(null);
  readonly error = signal('');

  /** Rechnet alle Zusammenfassungen aus den Bewertungen neu, setzt das Kennzeichen und prüft danach das Ergebnis. */
  async rebuild(): Promise<StatsCheck | null> {
    if (!this.available() || this.busy() !== 'idle') return null;
    this.busy.set('rebuilding');
    this.error.set('');
    this.result.set(null);
    try {
      const [ratingDocs, stored] = await Promise.all([this.api.readAllRatings(), this.api.readPlayerStats()]);
      const expected = buildPlayerStats([...ratingDocs.keys()], ratingsFromDocs(ratingDocs));
      const plan = rebuildPlan(
        stored.map((entry) => entry.id),
        expected,
      );
      await this.api.writeRebuild(plan.set, plan.remove, { version: PLAYER_STATS_VERSION, builtAt: new Date().toISOString() });
      return await this.runCheck();
    } catch (error) {
      this.fail(error, 'Die Neuberechnung ist fehlgeschlagen.');
      return null;
    } finally {
      this.busy.set('idle');
    }
  }

  /** Prüfung „Zusammenfassung = Neuberechnung“ (schreibt nichts). */
  async check(): Promise<StatsCheck | null> {
    if (!this.available() || this.busy() !== 'idle') return null;
    this.busy.set('checking');
    this.error.set('');
    this.result.set(null);
    try {
      return await this.runCheck();
    } catch (error) {
      this.fail(error, 'Die Prüfung ist fehlgeschlagen.');
      return null;
    } finally {
      this.busy.set('idle');
    }
  }

  private async runCheck(): Promise<StatsCheck> {
    const [ratingDocs, stored] = await Promise.all([this.api.readAllRatings(), this.api.readPlayerStats()]);
    const eventIds = [...ratingDocs.keys()];
    const expected = buildPlayerStats(eventIds, ratingsFromDocs(ratingDocs));
    const result: StatsCheck = {
      players: expected.size,
      ratings: [...ratingDocs.values()].reduce((sum, docs) => sum + docs.length, 0),
      differences: compareStats(stored, expected, eventIds),
    };
    this.result.set(result);
    return result;
  }

  private fail(error: unknown, text: string): void {
    console.error(error);
    this.error.set(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
