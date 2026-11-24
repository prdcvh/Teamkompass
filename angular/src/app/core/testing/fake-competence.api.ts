import type { CompetenceApi } from '../firebase/competence.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

type DocsListener = (docs: RawDoc[], meta: SnapshotMeta) => void;

const LIVE: SnapshotMeta = { fromCache: false, hasPendingWrites: false };

/** Ersatz für {@link CompetenceApi} in Tests (SCRUM-266): Beobachtungen und Konfigurationen im Speicher. */
export class FakeCompetenceApi implements Pick<CompetenceApi, keyof CompetenceApi> {
  constructor(readonly calls: string[] = []) {}

  /** Spieler-ID → (Dokument-ID → Beobachtung). */
  readonly observations = new Map<string, Map<string, Record<string, unknown>>>();
  readonly configs = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  saveError: unknown = null;

  private observationListeners = new Map<DocsListener, string>();
  private configListeners = new Set<DocsListener>();

  async watchObservations(playerId: string, onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push(`watchCompetenceObservations:${playerId}`);
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.observationListeners.set(onData, playerId);
    onData(this.observationDocs(playerId), LIVE);
    return () => this.observationListeners.delete(onData);
  }

  async addObservations(playerId: string, entries: readonly { readonly id: string; readonly data: Record<string, unknown> }[]): Promise<void> {
    this.calls.push(`addCompetenceObservations:${playerId}:${entries.length}`);
    if (this.saveError) throw this.saveError;
    const list = this.observations.get(playerId) ?? new Map<string, Record<string, unknown>>();
    for (const entry of entries) list.set(entry.id, { ...entry.data });
    this.observations.set(playerId, list);
    this.emitObservations(playerId);
  }

  async deleteObservation(playerId: string, id: string): Promise<void> {
    this.calls.push(`deleteCompetenceObservation:${playerId}:${id}`);
    if (this.saveError) throw this.saveError;
    this.observations.get(playerId)?.delete(id);
    this.emitObservations(playerId);
  }

  async watchConfigs(onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchCompetenceConfigs');
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.configListeners.add(onData);
    onData(this.configDocs(), LIVE);
    return () => this.configListeners.delete(onData);
  }

  async addConfig(id: string, data: Record<string, unknown>): Promise<void> {
    this.calls.push(`addCompetenceConfig:${id}`);
    if (this.saveError) throw this.saveError;
    // Wie die Regeln: eine bestehende Version wird nie überschrieben.
    if (this.configs.has(id)) throw { code: 'permission-denied' };
    this.configs.set(id, { ...data });
    for (const listener of this.configListeners) listener(this.configDocs(), LIVE);
  }

  private observationDocs(playerId: string): RawDoc[] {
    return [...(this.observations.get(playerId) ?? new Map()).entries()].map(([id, data]) => ({ id, data }));
  }

  private configDocs(): RawDoc[] {
    return [...this.configs.entries()].map(([id, data]) => ({ id, data }));
  }

  private emitObservations(playerId: string): void {
    for (const [listener, id] of this.observationListeners) if (id === playerId) listener(this.observationDocs(playerId), LIVE);
  }
}
