import type { RsvpApi } from '../firebase/rsvp.api';
import type { RawDoc } from '../firebase/types';

type Listener = (docs: RawDoc[]) => void;
type OwnListener = (data: Readonly<Record<string, unknown>> | null) => void;

/** Ersatz für {@link RsvpApi} in Tests: Zu-/Absagen je Event und Spieler; Abos bekommen jede Änderung sofort. */
export class FakeRsvpApi implements Pick<RsvpApi, keyof RsvpApi> {
  constructor(readonly calls: string[] = []) {}

  responses = new Map<string, Map<string, Record<string, unknown>>>();
  saveError: unknown = null;
  watchers = 0;
  private listeners = new Map<string, Set<Listener>>();
  private ownListeners = new Map<string, Set<OwnListener>>();

  async watchResponses(eventId: string, onData: Listener): Promise<() => void> {
    this.calls.push(`watchResponses:${eventId}`);
    return this.add(this.listeners, eventId, onData, () => onData(this.docs(eventId)));
  }

  async watchOwnResponse(eventId: string, playerId: string, onData: OwnListener): Promise<() => void> {
    this.calls.push(`watchOwnResponse:${eventId}:${playerId}`);
    return this.add(this.ownListeners, `${eventId}/${playerId}`, onData, () => onData(this.responses.get(eventId)?.get(playerId) ?? null));
  }

  async saveResponse(
    eventId: string,
    playerId: string,
    data: { readonly playerId: string; readonly status: string; readonly reason: string; readonly by: string },
  ): Promise<void> {
    this.calls.push(`saveResponse:${eventId}:${playerId}:${data.status}`);
    if (this.saveError) throw this.saveError;
    this.set(eventId, playerId, { ...data, updatedAt: 'server-time' });
  }

  /** Test-Hilfe: setzt (oder löscht mit null) eine Rückmeldung und benachrichtigt die Abos – wie ein anderes Gerät. */
  set(eventId: string, playerId: string, data: Record<string, unknown> | null): void {
    const store = this.responses.get(eventId) ?? new Map<string, Record<string, unknown>>();
    if (data) store.set(playerId, data);
    else store.delete(playerId);
    this.responses.set(eventId, store);
    this.listeners.get(eventId)?.forEach((listener) => listener(this.docs(eventId)));
    this.ownListeners.get(`${eventId}/${playerId}`)?.forEach((listener) => listener(data));
  }

  private docs(eventId: string): RawDoc[] {
    return [...(this.responses.get(eventId) ?? new Map<string, Record<string, unknown>>())].map(([id, data]) => ({ id, data }));
  }

  private add<T>(map: Map<string, Set<T>>, key: string, listener: T, first: () => void): () => void {
    const set = map.get(key) ?? new Set<T>();
    set.add(listener);
    map.set(key, set);
    this.watchers += 1;
    first();
    return () => {
      set.delete(listener);
      this.watchers -= 1;
    };
  }
}
