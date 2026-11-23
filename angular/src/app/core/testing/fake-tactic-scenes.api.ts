import type { TacticSceneFilter, TacticScenesApi } from '../firebase/tactic-scenes.api';
import type { RawDoc } from '../firebase/types';

interface Listener {
  readonly filter: TacticSceneFilter;
  readonly onData: (docs: RawDoc[]) => void;
  readonly onError: (error: unknown) => void;
}

/**
 * Ersatz für {@link TacticScenesApi} in Tests: Szenen im Speicher, Abos werden sofort bedient. Eigene Aufrufliste,
 * damit die Reihenfolge-Prüfungen anderer Tests unverändert bleiben.
 */
export class FakeTacticScenesApi implements Pick<TacticScenesApi, keyof TacticScenesApi> {
  readonly calls: string[] = [];
  readonly scenes = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  saveError: unknown = null;
  private readonly listeners = new Set<Listener>();

  async watchScenes(filter: TacticSceneFilter, onData: (docs: RawDoc[]) => void, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push(`watchScenes:${filter.field}=${filter.value}`);
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    const listener = { filter, onData, onError };
    this.listeners.add(listener);
    onData(this.docs(filter));
    return () => this.listeners.delete(listener);
  }

  async saveScene(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveScene:${id}`);
    if (this.saveError) throw this.saveError;
    this.scenes.set(id, { ...data });
    this.emit();
  }

  async deleteScene(id: string): Promise<void> {
    this.calls.push(`deleteScene:${id}`);
    this.scenes.delete(id);
    this.emit();
  }

  emit(): void {
    for (const listener of this.listeners) listener.onData(this.docs(listener.filter));
  }

  private docs(filter: TacticSceneFilter): RawDoc[] {
    return [...this.scenes].filter(([, data]) => data[filter.field] === filter.value).map(([id, data]) => ({ id, data }));
  }
}
