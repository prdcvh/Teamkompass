import type { RankingApi } from '../firebase/ranking.api';
import type { RawDoc } from '../firebase/types';

/** Ersatz für {@link RankingApi}: liest die Trainer-Dokumente aus der Attrappe der Bewertungen. */
export class FakeRankingApi implements Pick<RankingApi, keyof RankingApi> {
  constructor(
    readonly calls: string[] = [],
    private readonly privateNotes: Map<string, Map<string, Record<string, unknown>>> = new Map(),
  ) {}

  doc: Record<string, unknown> | null = null;
  readError: unknown = null;
  saveError: unknown = null;

  async readPrivateNotes(eventId: string): Promise<RawDoc[]> {
    this.calls.push(`readPrivateNotes:${eventId}`);
    return [...(this.privateNotes.get(eventId) ?? new Map())].map(([id, data]) => ({ id, data }));
  }

  async readRanking(): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push('readRanking');
    if (this.readError) throw this.readError;
    return this.doc;
  }

  async saveRanking(data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveRanking');
    if (this.saveError) throw this.saveError;
    this.doc = { ...data };
  }
}
