import type { RatingDocsByEvent } from '../firebase/player-stats.api';
import type { PlayerViewApi, PlayerViewMarker } from '../firebase/player-view.api';
import type { SnapshotMeta } from '../firebase/types';
import { PLAYER_VIEW_VERSION, gradesDoc, valuesDoc } from '../ratings/player-view';
import type { FakeRatingsApi } from './fake-ratings.api';

/**
 * Ersatz für {@link PlayerViewApi} in Tests. Standard: Kennzeichen gesetzt (Übernahme schon gelaufen), damit Tests ohne
 * Bezug zu SCRUM-115 keine Übernahme auslösen. `marker = null` stellt den Stand direkt nach dem Live-Gang nach.
 */
export class FakePlayerViewApi implements Pick<PlayerViewApi, keyof PlayerViewApi> {
  constructor(
    readonly calls: string[],
    private readonly ratings: FakeRatingsApi,
  ) {}

  marker: Record<string, unknown> | null = { version: PLAYER_VIEW_VERSION, builtAt: '2026-11-01T00:00:00.000Z' };
  markerError: unknown = null;
  writeError: unknown = null;
  private listener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchMarker(onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchPlayerViewMarker');
    this.listener = onData;
    if (this.markerError) onError(this.markerError);
    else onData(this.marker, { fromCache: false, hasPendingWrites: false });
    return () => (this.listener = null);
  }

  async writeCopies(ratings: RatingDocsByEvent, marker: PlayerViewMarker): Promise<number> {
    const count = [...ratings.values()].reduce((sum, docs) => sum + docs.length, 0);
    this.calls.push(`writePlayerViewCopies:${count}`);
    if (this.writeError) throw this.writeError;
    for (const [eventId, docs] of ratings) {
      for (const entry of docs) {
        const values = this.ratings.values.get(eventId) ?? new Map<string, Record<string, unknown>>();
        values.set(entry.id, valuesDoc(entry.id, entry.data));
        this.ratings.values.set(eventId, values);
        const grades = this.ratings.grades.get(eventId) ?? new Map<string, Record<string, unknown>>();
        grades.set(entry.id, { ...gradesDoc(entry.id, entry.data), ratedAt: new Date() });
        this.ratings.grades.set(eventId, grades);
      }
    }
    this.marker = { ...marker };
    this.listener?.(this.marker, { fromCache: false, hasPendingWrites: false });
    return count;
  }
}
