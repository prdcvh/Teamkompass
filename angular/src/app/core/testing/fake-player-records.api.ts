import type { PlayerRecordsApi } from '../firebase/player-records.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link PlayerRecordsApi} in Tests: Förderpläne, Abwesenheiten und Messwerte je Spieler. */
export class FakePlayerRecordsApi implements Pick<PlayerRecordsApi, keyof PlayerRecordsApi> {
  constructor(readonly calls: string[] = []) {}

  /** Schlüssel: `${playerId}/${kind}`, dann Dokument-ID → Daten. */
  playerRecords = new Map<string, Map<string, Record<string, unknown>>>();
  watchPlayerRecordsError: unknown = null;
  savePlayerRecordError: unknown = null;
  deletePlayerRecordError: unknown = null;
  saveSelfReflectionError: unknown = null;
  recordWatchers = 0;
  private recordListeners = new Map<string, { onData: (docs: RawDoc[], meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  private emitRecords(key: string): void {
    const docs = [...(this.playerRecords.get(key) ?? new Map())].map(([id, data]) => ({ id, data }));
    this.recordListeners.get(key)?.onData(docs, { fromCache: false, hasPendingWrites: false });
  }

  async watchPlayerRecords(
    playerId: string,
    name: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    options: { readonly ownOnly?: boolean } = {},
  ): Promise<() => void> {
    this.calls.push(`watchPlayerRecords:${playerId}:${name}`);
    if (options.ownOnly) this.calls.push(`ownOnly:${playerId}:${name}`);
    if (this.watchPlayerRecordsError) throw this.watchPlayerRecordsError;
    this.recordWatchers += 1;
    const key = `${playerId}/${name}`;
    this.recordListeners.set(key, { onData, onError });
    this.emitRecords(key);
    return () => {
      this.recordWatchers -= 1;
      this.recordListeners.delete(key);
    };
  }

  readPlayerRecordsError: unknown = null;

  async readPlayerRecords(playerId: string, name: string): Promise<RawDoc[]> {
    this.calls.push(`readPlayerRecords:${playerId}:${name}`);
    if (this.readPlayerRecordsError) throw this.readPlayerRecordsError;
    return [...(this.playerRecords.get(`${playerId}/${name}`) ?? new Map())].map(([id, data]) => ({ id, data }));
  }

  failPlayerRecords(playerId: string, name: string, error: unknown): void {
    this.recordListeners.get(`${playerId}/${name}`)?.onError(error);
  }

  async savePlayerRecord(playerId: string, name: string, id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePlayerRecord:${playerId}:${name}:${id}`);
    if (this.savePlayerRecordError) throw this.savePlayerRecordError;
    const key = `${playerId}/${name}`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(id, { ...data, playerId });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }

  async deletePlayerRecord(playerId: string, name: string, id: string): Promise<void> {
    this.calls.push(`deletePlayerRecord:${playerId}:${name}:${id}`);
    if (this.deletePlayerRecordError) throw this.deletePlayerRecordError;
    const key = `${playerId}/${name}`;
    this.playerRecords.get(key)?.delete(id);
    this.emitRecords(key);
  }

  async saveSelfReflection(playerId: string, planId: string, text: string, at: string): Promise<void> {
    this.calls.push(`saveSelfReflection:${playerId}:${planId}`);
    if (this.saveSelfReflectionError) throw this.saveSelfReflectionError;
    const key = `${playerId}/developmentPlans`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(planId, { ...store.get(planId), selfReflection: text, selfReflectionAt: at });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }
}
