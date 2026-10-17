import type { EventsApi } from '../firebase/events.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link EventsApi} in Tests (gleiches Muster wie bei den Spielern). */
export class FakeEventsApi implements Pick<EventsApi, keyof EventsApi> {
  constructor(readonly calls: string[] = []) {}

  events = new Map<string, Record<string, unknown>>();
  eventsMeta: SnapshotMeta = { fromCache: false, hasPendingWrites: false };
  watchEventsError: unknown = null;
  saveEventError: unknown = null;
  deleteEventError: unknown = null;
  /** 1-basiert: der n-te Aufruf von saveEventsBatch schlägt fehl. */
  failBatchNumber: number | null = null;
  private batchCalls = 0;
  eventWatchers = 0;
  private eventsListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private eventsErrorListener: ((error: unknown) => void) | null = null;

  async watchEvents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchEvents');
    if (this.watchEventsError) throw this.watchEventsError;
    this.eventWatchers += 1;
    this.eventsListener = onData;
    this.eventsErrorListener = onError;
    this.emitEvents();
    return () => {
      this.eventWatchers -= 1;
      this.eventsListener = null;
      this.eventsErrorListener = null;
    };
  }

  emitEvents(meta: SnapshotMeta = this.eventsMeta): void {
    this.eventsMeta = meta;
    this.eventsListener?.(
      [...this.events].map(([id, data]) => ({ id, data })),
      meta,
    );
  }

  failEvents(error: unknown): void {
    this.eventsErrorListener?.(error);
  }

  async saveEvent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveEvent:${id}`);
    if (this.saveEventError) throw this.saveEventError;
    this.events.set(id, { ...this.events.get(id), ...data });
    this.emitEvents();
  }

  async saveEventsBatch(entries: readonly { readonly id: string; readonly data: Readonly<Record<string, unknown>> }[]): Promise<void> {
    this.batchCalls += 1;
    this.calls.push(`saveEventsBatch:${entries.length}`);
    if (this.failBatchNumber === this.batchCalls) throw { code: 'unavailable' };
    for (const entry of entries) this.events.set(entry.id, { ...this.events.get(entry.id), ...entry.data });
    this.emitEvents();
  }

  async deleteEvent(id: string): Promise<void> {
    this.calls.push(`deleteEvent:${id}`);
    if (this.deleteEventError) throw this.deleteEventError;
    this.events.delete(id);
    this.emitEvents();
  }
}
