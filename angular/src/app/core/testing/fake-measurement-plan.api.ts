import type { MeasurementPlanApi } from '../firebase/measurement-plan.api';
import type { SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link MeasurementPlanApi} in Tests (Dokument meta/settings mit `measurementPlan`-Map). */
export class FakeMeasurementPlanApi implements Pick<MeasurementPlanApi, keyof MeasurementPlanApi> {
  constructor(readonly calls: string[] = []) {}

  doc: Record<string, unknown> | null = null;
  watchError: unknown = null;
  saveError: unknown = null;
  private listener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchPlan(onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void): Promise<() => void> {
    this.calls.push('watchPlan');
    if (this.watchError) throw this.watchError;
    this.listener = onData;
    this.emit();
    return () => {
      this.listener = null;
    };
  }

  emit(): void {
    this.listener?.(this.doc, { fromCache: false, hasPendingWrites: false });
  }

  get plan(): Record<string, unknown> {
    return (this.doc?.['measurementPlan'] as Record<string, unknown> | undefined) ?? {};
  }

  async savePlayerPlan(playerId: string, data: Readonly<Record<string, unknown>> | null): Promise<void> {
    this.calls.push(`savePlayerPlan:${playerId}`);
    if (this.saveError) throw this.saveError;
    const rest = { ...this.plan };
    if (data === null) delete rest[playerId];
    else rest[playerId] = data;
    this.doc = { ...this.doc, measurementPlan: rest };
    this.emit();
  }
}
