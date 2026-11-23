import type { MaturityApi } from '../firebase/maturity.api';
import type { SnapshotMeta } from '../firebase/types';

interface Listener {
  readonly onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void;
  readonly onError: (error: unknown) => void;
}

/** Ersatz für {@link MaturityApi} in Tests: Dokument `maturity/parents` je Spieler. */
export class FakeMaturityApi implements Pick<MaturityApi, keyof MaturityApi> {
  constructor(readonly calls: string[] = []) {}

  readonly docs = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  saveError: unknown = null;
  private readonly listeners = new Map<string, Set<Listener>>();

  set(playerId: string, data: Record<string, unknown> | null): void {
    if (data) this.docs.set(playerId, data);
    else this.docs.delete(playerId);
    for (const listener of this.listeners.get(playerId) ?? []) listener.onData(this.docs.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
  }

  /** Simuliert, dass der Server ein laufendes Abo ablehnt (z. B. nach Widerruf, sobald das Gerät wieder online ist). */
  failListeners(playerId: string, error: unknown): void {
    for (const listener of this.listeners.get(playerId) ?? []) listener.onError(error);
  }

  async watchMaturity(playerId: string, onData: Listener['onData'], onError: Listener['onError']): Promise<() => void> {
    this.calls.push(`watchMaturity:${playerId}`);
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    const listener: Listener = { onData, onError };
    const set = this.listeners.get(playerId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(playerId, set);
    onData(this.docs.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => set.delete(listener);
  }

  readError: unknown = null;

  async readMaturity(playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`readMaturity:${playerId}`);
    if (this.readError) throw this.readError;
    return this.docs.get(playerId) ?? null;
  }

  async saveMaturity(playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveMaturity:${playerId}`);
    if (this.saveError) throw this.saveError;
    this.set(playerId, { ...data });
  }

  deleteError: unknown = null;

  async deleteMaturity(playerId: string): Promise<void> {
    this.calls.push(`deleteMaturity:${playerId}`);
    if (this.deleteError) throw this.deleteError;
    this.set(playerId, null);
  }
}
