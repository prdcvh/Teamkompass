import type { SnapshotMeta } from '../firebase/types';
import type { PlanningApi } from '../firebase/planning.api';

/** Ersatz für {@link PlanningApi} in Tests (ein Dokument meta/planning mit `series`-Map). */
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
}
