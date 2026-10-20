import type { ScoutApi } from '../firebase/scout.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import type { ScoutChange } from '../scout/scout-profile';

/** Ersatz für {@link ScoutApi} in Tests: die Scout-Sicht im Speicher, Schreibvorgänge melden sofort einen neuen Stand. */
export class FakeScoutApi implements Pick<ScoutApi, keyof ScoutApi> {
  constructor(readonly calls: string[] = []) {}

  profiles = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  applyError: unknown = null;
  /** Alle Schreibvorgänge in Reihenfolge (zum Prüfen, was geschrieben wurde). */
  applied: ScoutChange[][] = [];
  private listener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private errorListener: ((error: unknown) => void) | null = null;

  async watchScoutProfiles(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchScoutProfiles');
    if (this.watchError) throw this.watchError;
    this.listener = onData;
    this.errorListener = onError;
    this.emit();
    return () => {
      this.listener = null;
      this.errorListener = null;
    };
  }

  /** Test-Hilfe: sendet den aktuellen Stand an den Abonnenten. */
  emit(): void {
    this.listener?.(
      [...this.profiles].map(([id, data]) => ({ id, data })),
      { fromCache: false, hasPendingWrites: false },
    );
  }

  /** Test-Hilfe: Abo-Fehler (z. B. permission-denied). */
  fail(error: unknown): void {
    this.errorListener?.(error);
  }

  async applyScoutChanges(changes: readonly ScoutChange[]): Promise<void> {
    this.calls.push(`applyScoutChanges:${changes.map((change) => `${change.type}:${change.id}`).join(',')}`);
    if (this.applyError) throw this.applyError;
    this.applied.push([...changes]);
    for (const change of changes) {
      if (change.type === 'set') this.profiles.set(change.id, JSON.parse(JSON.stringify(change.data)) as Record<string, unknown>);
      else this.profiles.delete(change.id);
    }
    this.emit();
  }
}
