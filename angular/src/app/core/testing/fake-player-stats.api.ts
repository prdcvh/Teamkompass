import type { PlayerStatsApi, PlayerStatsMarker, RatingDocsByEvent } from '../firebase/player-stats.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import type { PlayerStatsDoc } from '../team/player-stats';
import type { FakeEventsApi } from './fake-events.api';
import type { FakeRatingsApi } from './fake-ratings.api';

/**
 * Ersatz für {@link PlayerStatsApi} in Tests. Standard: kein Kennzeichen (Zusammenfassungen nicht eingerichtet), also
 * rechnen die Übersichten wie bisher. Die Bewertungen für Neuberechnung/Prüfung kommen aus den Attrappen für Events
 * und Bewertungen.
 */
export class FakePlayerStatsApi implements Pick<PlayerStatsApi, keyof PlayerStatsApi> {
  constructor(
    readonly calls: string[],
    private readonly events: FakeEventsApi,
    private readonly ratings: FakeRatingsApi,
  ) {}

  marker: Record<string, unknown> | null = null;
  markerFromCache = false;
  markerError: unknown = null;
  stats = new Map<string, Record<string, unknown>>();
  watchStatsError: unknown = null;
  private markerListener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;
  private markerErrorListener: ((error: unknown) => void) | null = null;
  private statsListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  statsWatchers = 0;

  async watchMarker(onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchPlayerStatsMarker');
    this.markerListener = onData;
    this.markerErrorListener = onError;
    if (this.markerError) onError(this.markerError);
    else this.emitMarker();
    return () => {
      this.markerListener = null;
      this.markerErrorListener = null;
    };
  }

  emitMarker(): void {
    this.markerListener?.(this.marker, { fromCache: this.markerFromCache, hasPendingWrites: false });
  }

  failMarker(error: unknown): void {
    this.markerErrorListener?.(error);
  }

  async watchPlayerStats(onData: (docs: RawDoc[], meta: SnapshotMeta) => void): Promise<() => void> {
    this.calls.push('watchPlayerStats');
    if (this.watchStatsError) throw this.watchStatsError;
    this.statsWatchers += 1;
    this.statsListener = onData;
    this.emitStats();
    return () => {
      this.statsWatchers -= 1;
      this.statsListener = null;
    };
  }

  emitStats(): void {
    this.statsListener?.(
      [...this.stats].map(([id, data]) => ({ id, data })),
      { fromCache: false, hasPendingWrites: false },
    );
  }

  async readPlayerStats(): Promise<RawDoc[]> {
    this.calls.push('readPlayerStats');
    return [...this.stats].map(([id, data]) => ({ id, data: structuredClone(data) }));
  }

  async readAllRatings(eventIds: readonly string[] | null = null): Promise<RatingDocsByEvent> {
    this.calls.push(`readAllRatings:${eventIds ? eventIds.join(',') : '*'}`);
    const ids = eventIds ?? [...this.events.events.keys()];
    return new Map(ids.map((id) => [id, [...(this.ratings.ratings.get(id) ?? new Map())].map(([playerId, data]) => ({ id: playerId, data: { ...data } }))]));
  }

  async writeRebuild(set: readonly PlayerStatsDoc[], remove: readonly string[], marker: PlayerStatsMarker): Promise<void> {
    this.calls.push(`writeRebuild:${set.map((entry) => entry.playerId).join(',')}|${remove.join(',')}`);
    for (const entry of set) this.stats.set(entry.playerId, structuredClone(entry) as unknown as Record<string, unknown>);
    for (const id of remove) this.stats.delete(id);
    this.marker = { ...marker };
    this.markerFromCache = false;
    this.emitStats();
    this.emitMarker();
  }
}
