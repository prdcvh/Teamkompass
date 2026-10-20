import type { ScoutProfilesApi } from '../firebase/scout-profiles.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link ScoutProfilesApi} in Tests (Echtzeit-Abo: Schreibvorgänge melden sofort einen neuen Stand). */
export class FakeScoutProfilesApi implements Pick<ScoutProfilesApi, keyof ScoutProfilesApi> {
  constructor(readonly calls: string[] = []) {}

  profiles = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  /** Anzahl der Schreibaufrufe (set/delete je Profil), um „nichts zu tun“ prüfen zu können. */
  writes: string[] = [];
  private listeners = new Set<(docs: RawDoc[], meta: SnapshotMeta) => void>();
  private errorListeners = new Set<(error: unknown) => void>();

  async watchScoutProfiles(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchScoutProfiles');
    if (this.watchError) throw this.watchError;
    this.listeners.add(onData);
    this.errorListeners.add(onError);
    onData(this.docs(), { fromCache: false, hasPendingWrites: false });
    return () => {
      this.listeners.delete(onData);
      this.errorListeners.delete(onError);
    };
  }

  async applyScoutProfiles(set: readonly (readonly [string, Readonly<Record<string, unknown>>])[], remove: readonly string[]): Promise<void> {
    if (set.length === 0 && remove.length === 0) return;
    for (const [id, data] of set) {
      this.writes.push(`set:${id}`);
      this.profiles.set(id, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    }
    for (const id of remove) {
      this.writes.push(`delete:${id}`);
      this.profiles.delete(id);
    }
    this.emit();
  }

  /** Test-Hilfe: aktuellen Stand an alle Abonnenten senden. */
  emit(): void {
    const docs = this.docs();
    this.listeners.forEach((listener) => listener(docs, { fromCache: false, hasPendingWrites: false }));
  }

  /** Test-Hilfe: Abo-Fehler (z. B. permission-denied). */
  fail(error: unknown): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  get watchers(): number {
    return this.listeners.size;
  }

  private docs(): RawDoc[] {
    return [...this.profiles].map(([id, data]) => ({ id, data }));
  }
}
