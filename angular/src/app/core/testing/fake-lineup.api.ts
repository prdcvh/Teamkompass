import type { LineupApi } from '../firebase/lineup.api';
import type { SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link LineupApi} in Tests (ein Dokument meta/lineup). */
export class FakeLineupApi implements Pick<LineupApi, keyof LineupApi> {
  constructor(readonly calls: string[] = []) {}

  lineup: Record<string, unknown> | null = null;
  watchLineupError: unknown = null;
  saveLineupError: unknown = null;
  lineupWatchers = 0;
  private lineupListener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;
  private lineupErrorListener: ((error: unknown) => void) | null = null;

  async watchLineup(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchLineup');
    if (this.watchLineupError) throw this.watchLineupError;
    this.lineupWatchers += 1;
    this.lineupListener = onData;
    this.lineupErrorListener = onError;
    this.emitLineup();
    return () => {
      this.lineupWatchers -= 1;
      this.lineupListener = null;
      this.lineupErrorListener = null;
    };
  }

  emitLineup(meta: SnapshotMeta = { fromCache: false, hasPendingWrites: false }): void {
    this.lineupListener?.(this.lineup, meta);
  }

  failLineup(error: unknown): void {
    this.lineupErrorListener?.(error);
  }

  async saveLineup(data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveLineup');
    if (this.saveLineupError) throw this.saveLineupError;
    // Wie setDoc(..., { merge: true }): Felder, die nicht mitgeschrieben werden (z. B. byEvent der alten App), bleiben erhalten.
    this.lineup = { ...this.lineup, ...data };
    this.emitLineup();
  }

  saveEventLineupError: unknown = null;

  async saveEventLineup(eventId: string, entry: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveEventLineup');
    if (this.saveEventLineupError) throw this.saveEventLineupError;
    // Wie setDoc({ byEvent: { [id]: entry } }, { merge: true }): nur dieser Eintrag ändert sich, alles andere bleibt.
    const byEvent = { ...((this.lineup?.['byEvent'] as Record<string, unknown> | undefined) ?? {}), [eventId]: entry };
    this.lineup = { ...this.lineup, byEvent };
    this.emitLineup();
  }
}
