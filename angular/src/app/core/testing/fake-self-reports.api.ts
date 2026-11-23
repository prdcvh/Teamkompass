import type { SelfReportKind, SelfReportsApi } from '../firebase/self-reports.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

interface Listener {
  readonly since?: string;
  readonly onData: (docs: RawDoc[], meta: SnapshotMeta) => void;
  readonly onError: (error: unknown) => void;
}

/** Ersatz für {@link SelfReportsApi} in Tests: Angaben je `${playerId}/${kind}`, dann Event-ID → Daten. */
export class FakeSelfReportsApi implements Pick<SelfReportsApi, keyof SelfReportsApi> {
  constructor(readonly calls: string[] = []) {}

  readonly docs = new Map<string, Map<string, Record<string, unknown>>>();
  /** Fehler beim Abo je Art (z. B. permission-denied für `wellness`). */
  readonly watchErrors = new Map<SelfReportKind, unknown>();
  saveError: unknown = null;
  /** Zeitpunkt, den der „Server“ als `updatedAt` setzt. */
  now: () => Date = () => new Date();
  private readonly listeners = new Map<string, Set<Listener>>();

  set(playerId: string, kind: SelfReportKind, eventId: string, data: Record<string, unknown>): void {
    const key = `${playerId}/${kind}`;
    const store = this.docs.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(eventId, data);
    this.docs.set(key, store);
    this.emit(key);
  }

  private emit(key: string): void {
    const docs = [...(this.docs.get(key) ?? new Map<string, Record<string, unknown>>())].map(([id, data]) => ({ id, data }));
    for (const listener of this.listeners.get(key) ?? []) {
      const since = listener.since;
      const kept = since ? docs.filter((entry) => typeof entry.data['date'] === 'string' && entry.data['date'] >= since) : docs;
      listener.onData(kept, { fromCache: false, hasPendingWrites: false });
    }
  }

  async watchSelfReports(
    playerId: string,
    kind: SelfReportKind,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    since?: string,
  ): Promise<() => void> {
    this.calls.push(`watchSelfReports:${playerId}:${kind}${since ? `:${since}` : ''}`);
    const key = `${playerId}/${kind}`;
    const listener: Listener = { since, onData, onError };
    const set = this.listeners.get(key) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(key, set);
    const error = this.watchErrors.get(kind);
    if (error) onError(error);
    else this.emit(key);
    return () => set.delete(listener);
  }

  async saveSelfReport(playerId: string, kind: SelfReportKind, eventId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveSelfReport:${playerId}:${kind}:${eventId}`);
    if (this.saveError) throw this.saveError;
    this.set(playerId, kind, eventId, { ...data, updatedAt: this.now() });
  }
}
