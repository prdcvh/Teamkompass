import type { LearningApi } from '../firebase/learning.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

type DocsListener = (docs: RawDoc[], meta: SnapshotMeta) => void;
type DocListener = (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void;

const LIVE: SnapshotMeta = { fromCache: false, hasPendingWrites: false };

/** Ersatz für {@link LearningApi} in Tests: Pfade und Fortschritt im Speicher, Abos werden sofort bedient. */
export class FakeLearningApi implements Pick<LearningApi, keyof LearningApi> {
  constructor(readonly calls: string[] = []) {}

  readonly paths = new Map<string, Record<string, unknown>>();
  /** Spieler-ID → Dokument `learningProgress/{playerId}`. */
  readonly progress = new Map<string, Record<string, unknown>>();
  /** Fehler beim Abo (z. B. `{ code: 'permission-denied' }`). */
  watchError: unknown = null;
  saveError: unknown = null;

  private pathListeners = new Set<DocsListener>();
  private allProgressListeners = new Set<DocsListener>();
  private progressListeners = new Map<DocListener, string>();

  async watchPaths(onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchLearningPaths');
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.pathListeners.add(onData);
    onData(this.pathDocs(), LIVE);
    return () => this.pathListeners.delete(onData);
  }

  async watchAllProgress(onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchAllLearningProgress');
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.allProgressListeners.add(onData);
    onData(this.progressDocs(), LIVE);
    return () => this.allProgressListeners.delete(onData);
  }

  async watchProgress(playerId: string, onData: DocListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push(`watchLearningProgress:${playerId}`);
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.progressListeners.set(onData, playerId);
    onData(this.progress.get(playerId) ?? null, LIVE);
    return () => this.progressListeners.delete(onData);
  }

  async savePath(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePath:${id}`);
    if (this.saveError) throw this.saveError;
    this.paths.set(id, { ...data });
    this.emit();
  }

  async deletePath(id: string, playerIds: readonly string[]): Promise<void> {
    this.calls.push(`deletePath:${id}:${playerIds.join(',')}`);
    if (this.saveError) throw this.saveError;
    for (const playerId of playerIds) {
      const doc = this.progress.get(playerId);
      const paths = { ...((doc?.['paths'] as Record<string, unknown> | undefined) ?? {}) };
      delete paths[id];
      this.progress.set(playerId, { ...doc, playerId, paths });
    }
    this.paths.delete(id);
    this.emit();
  }

  async setLevel(playerId: string, pathId: string, levelId: string, date: string | null): Promise<void> {
    this.calls.push(`setLevel:${playerId}:${pathId}:${levelId}:${date ?? 'null'}`);
    if (this.saveError) throw this.saveError;
    const doc = this.progress.get(playerId);
    const paths = { ...((doc?.['paths'] as Record<string, Record<string, string>> | undefined) ?? {}) };
    const levels = { ...(paths[pathId] ?? {}) };
    if (date === null) delete levels[levelId];
    else levels[levelId] = date;
    paths[pathId] = levels;
    this.progress.set(playerId, { playerId, paths });
    this.emit();
  }

  /** Alle Abos mit dem aktuellen Stand bedienen (z. B. nach direktem Ändern in einem Test). */
  emit(): void {
    this.pathListeners.forEach((listener) => listener(this.pathDocs(), LIVE));
    this.allProgressListeners.forEach((listener) => listener(this.progressDocs(), LIVE));
    this.progressListeners.forEach((playerId, listener) => listener(this.progress.get(playerId) ?? null, LIVE));
  }

  private pathDocs(): RawDoc[] {
    return [...this.paths].map(([id, data]) => ({ id, data }));
  }

  private progressDocs(): RawDoc[] {
    return [...this.progress].map(([id, data]) => ({ id, data }));
  }
}
