import type { OpponentsApi } from '../firebase/opponents.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link OpponentsApi} in Tests (gleiches Muster wie bei den Events). */
export class FakeOpponentsApi implements Pick<OpponentsApi, keyof OpponentsApi> {
  constructor(readonly calls: string[] = []) {}

  opponents = new Map<string, Record<string, unknown>>();
  opponentsMeta: SnapshotMeta = { fromCache: false, hasPendingWrites: false };
  watchOpponentsError: unknown = null;
  saveOpponentError: unknown = null;
  deleteOpponentError: unknown = null;
  opponentWatchers = 0;
  private opponentsListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private opponentsErrorListener: ((error: unknown) => void) | null = null;

  async watchOpponents(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchOpponents');
    if (this.watchOpponentsError) throw this.watchOpponentsError;
    this.opponentWatchers += 1;
    this.opponentsListener = onData;
    this.opponentsErrorListener = onError;
    this.emitOpponents();
    return () => {
      this.opponentWatchers -= 1;
      this.opponentsListener = null;
      this.opponentsErrorListener = null;
    };
  }

  emitOpponents(meta: SnapshotMeta = this.opponentsMeta): void {
    this.opponentsMeta = meta;
    this.opponentsListener?.([...this.opponents].map(([id, data]) => ({ id, data })), meta);
  }

  failOpponents(error: unknown): void {
    this.opponentsErrorListener?.(error);
  }

  async saveOpponent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveOpponent:${id}`);
    if (this.saveOpponentError) throw this.saveOpponentError;
    this.opponents.set(id, { ...this.opponents.get(id), ...data });
    this.emitOpponents();
  }

  async deleteOpponent(id: string): Promise<void> {
    this.calls.push(`deleteOpponent:${id}`);
    if (this.deleteOpponentError) throw this.deleteOpponentError;
    this.opponents.delete(id);
    this.emitOpponents();
  }
}
