import type { SnapshotMeta } from '../firebase/types';
import type { PlanningApi } from '../firebase/planning.api';

/** Ersatz für {@link PlanningApi} in Tests (Dokument meta/planning mit `series`-Map, Dokument meta/breaks mit `breaks`-Map). */
export class FakePlanningApi implements Pick<PlanningApi, keyof PlanningApi> {
  constructor(readonly calls: string[] = []) {}

  doc: Record<string, unknown> | null = null;
  watchError: unknown = null;
  saveError: unknown = null;
  skipError: unknown = null;
  watchers = 0;
  errorListener: ((error: unknown) => void) | null = null;
  private listener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchPlanning(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchPlanning');
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

  get series(): Record<string, unknown> {
    return (this.doc?.['series'] as Record<string, unknown> | undefined) ?? {};
  }

  async saveSeries(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveSeries');
    if (this.saveError) throw this.saveError;
    this.doc = { ...this.doc, series: { ...this.series, [id]: data } };
    this.emit();
  }

  async deleteSeries(id: string): Promise<void> {
    this.calls.push('deleteSeries');
    if (this.saveError) throw this.saveError;
    const rest = { ...this.series };
    delete rest[id];
    const skipped = { ...this.skipped };
    delete skipped[id];
    this.doc = { ...this.doc, series: rest, skipped };
    this.emit();
  }

  get skipped(): Record<string, Record<string, boolean>> {
    return (this.doc?.['skipped'] as Record<string, Record<string, boolean>> | undefined) ?? {};
  }

  async markSkipped(seriesId: string, date: string): Promise<void> {
    this.calls.push(`markSkipped:${seriesId}:${date}`);
    if (this.skipError) throw this.skipError;
    this.doc = { ...this.doc, skipped: { ...this.skipped, [seriesId]: { ...this.skipped[seriesId], [date]: true } } };
    this.emit();
  }

  /** Dokument `meta/breaks` (Pausen, für alle Teammitglieder lesbar). */
  breaksDoc: Record<string, unknown> | null = null;
  breaksWatchError: unknown = null;
  breaksWatchers = 0;
  breaksErrorListener: ((error: unknown) => void) | null = null;
  private breaksListener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchBreaks(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchBreaks');
    if (this.breaksWatchError) throw this.breaksWatchError;
    this.breaksWatchers += 1;
    this.breaksListener = onData;
    this.breaksErrorListener = onError;
    this.emitBreaks();
    return () => {
      this.breaksWatchers -= 1;
      this.breaksListener = null;
    };
  }

  emitBreaks(meta: SnapshotMeta = { fromCache: false, hasPendingWrites: false }): void {
    this.breaksListener?.(this.breaksDoc, meta);
  }

  get breaks(): Record<string, unknown> {
    return (this.breaksDoc?.['breaks'] as Record<string, unknown> | undefined) ?? {};
  }

  async saveBreak(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveBreak');
    if (this.saveError) throw this.saveError;
    this.breaksDoc = { ...this.breaksDoc, breaks: { ...this.breaks, [id]: data } };
    this.emitBreaks();
  }

  async deleteBreak(id: string): Promise<void> {
    this.calls.push('deleteBreak');
    if (this.saveError) throw this.saveError;
    const rest = { ...this.breaks };
    delete rest[id];
    this.breaksDoc = { ...this.breaksDoc, breaks: rest };
    this.emitBreaks();
  }
}
