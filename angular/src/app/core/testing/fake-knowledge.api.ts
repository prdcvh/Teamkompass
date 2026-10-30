import type { SnapshotMeta } from '../firebase/types';
import type { KnowledgeApi } from '../firebase/knowledge.api';

/** Ersatz für {@link KnowledgeApi} in Tests (Dokument meta/settings mit `knowledge`-Map). */
export class FakeKnowledgeApi implements Pick<KnowledgeApi, keyof KnowledgeApi> {
  constructor(readonly calls: string[] = []) {}

  doc: Record<string, unknown> | null = null;
  watchError: unknown = null;
  saveError: unknown = null;
  watchers = 0;
  errorListener: ((error: unknown) => void) | null = null;
  private listener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchKnowledge(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchKnowledge');
    if (this.watchError) throw this.watchError;
    this.watchers += 1;
    this.listener = onData;
    this.errorListener = onError;
    this.emit();
    return () => {
      this.watchers -= 1;
      this.listener = null;
    };
  }

  emit(meta: SnapshotMeta = { fromCache: false, hasPendingWrites: false }): void {
    this.listener?.(this.doc, meta);
  }

  get knowledge(): Record<string, unknown> {
    return (this.doc?.['knowledge'] as Record<string, unknown> | undefined) ?? {};
  }

  async saveEntry(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveEntry');
    if (this.saveError) throw this.saveError;
    this.doc = { ...this.doc, knowledge: { ...this.knowledge, [id]: data } };
    this.emit();
  }

  async deleteEntry(id: string): Promise<void> {
    this.calls.push('deleteEntry');
    if (this.saveError) throw this.saveError;
    const rest = { ...this.knowledge };
    delete rest[id];
    this.doc = { ...this.doc, knowledge: rest };
    this.emit();
  }
}
