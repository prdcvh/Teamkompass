import type { GradeReleasesApi } from '../firebase/grade-releases.api';
import type { SnapshotMeta } from '../firebase/types';
import { type GradeRelease, releaseFromDoc } from '../ratings/grade-release';

interface Listener { onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }

/** Ersatz für {@link GradeReleasesApi} in Tests: Freigaben je Spieler (`publishedUntil` = Zeitpunkt von `publish`). */
export class FakeGradeReleasesApi implements Pick<GradeReleasesApi, keyof GradeReleasesApi> {
  constructor(readonly calls: string[] = []) {}

  releases = new Map<string, Record<string, unknown>>();
  publishError: unknown = null;
  watchError: unknown = null;
  /** Wird nach jeder Änderung aufgerufen (FakeFirebase meldet damit den Noten-Abos die neue Freigabe). */
  onChange: (playerId: string) => void = () => undefined;
  private listeners = new Map<string, Set<Listener>>();

  release(playerId: string): GradeRelease | null {
    return releaseFromDoc(this.releases.get(playerId) ?? null);
  }

  async watchRelease(playerId: string, onData: Listener['onData'], onError: Listener['onError']): Promise<() => void> {
    this.calls.push(`watchRelease:${playerId}`);
    const listener = { onData, onError };
    const set = this.listeners.get(playerId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(playerId, set);
    if (this.watchError) onError(this.watchError);
    else onData(this.releases.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => set.delete(listener);
  }

  /** Test-Hilfe: Freigabe direkt setzen (null = keine) und alle Abos benachrichtigen. */
  set(playerId: string, data: Record<string, unknown> | null): void {
    if (data) this.releases.set(playerId, data);
    else this.releases.delete(playerId);
    this.onChange(playerId);
    for (const listener of this.listeners.get(playerId) ?? []) listener.onData(data, { fromCache: false, hasPendingWrites: false });
  }

  async publish(playerId: string, expiresAt: Date | null): Promise<void> {
    this.calls.push(`publishGrades:${playerId}:${expiresAt ? expiresAt.toISOString().slice(0, 10) : 'unbefristet'}`);
    if (this.publishError) throw this.publishError;
    this.set(playerId, { playerId, publishedUntil: new Date(), expiresAt, createdBy: 'coach' });
  }

  async revoke(playerId: string): Promise<void> {
    this.calls.push(`revokeGrades:${playerId}`);
    if (this.publishError) throw this.publishError;
    this.set(playerId, null);
  }
}
