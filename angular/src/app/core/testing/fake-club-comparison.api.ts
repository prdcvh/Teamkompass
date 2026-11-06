import type { ClubComparisonData } from '../club/club-comparison';
import type { ClubComparisonApi } from '../firebase/club-comparison.api';
import type { RawDoc } from '../firebase/types';

/** Ersatz für {@link ClubComparisonApi} (Vereinsvergleich, SCRUM-197). Eigene Aufrufliste. */
export class FakeClubComparisonApi implements Pick<ClubComparisonApi, keyof ClubComparisonApi> {
  readonly calls: string[] = [];
  /** Eingeschaltete Vereine. */
  enabled = new Set<string>();
  /** Kurzfassungen je `clubId` → `teamId`. */
  docs = new Map<string, Map<string, Readonly<Record<string, unknown>>>>();
  readers = new Map<string, string>();
  written: { clubId: string; teamId: string; data: ClubComparisonData }[] = [];
  readError: unknown = null;

  async readEnabled(clubId: string): Promise<boolean> {
    this.calls.push(`enabled:${clubId}`);
    return this.enabled.has(clubId);
  }

  async setEnabled(clubId: string, enabled: boolean): Promise<void> {
    this.calls.push(`set:${clubId}:${enabled}`);
    if (enabled) this.enabled.add(clubId);
    else this.enabled.delete(clubId);
  }

  async registerReader(clubId: string, uid: string, teamId: string): Promise<void> {
    this.calls.push(`reader:${clubId}:${uid}:${teamId}`);
    this.readers.set(`${clubId}/${uid}`, teamId);
  }

  async readReader(clubId: string, uid: string): Promise<string | null> {
    return this.readers.get(`${clubId}/${uid}`) ?? null;
  }

  async writeComparison(clubId: string, teamId: string, data: ClubComparisonData): Promise<void> {
    this.calls.push(`write:${clubId}:${teamId}`);
    this.written.push({ clubId, teamId, data });
    const club = this.docs.get(clubId) ?? new Map<string, Readonly<Record<string, unknown>>>();
    club.set(teamId, { ...data, updatedAt: { toDate: () => new Date() } });
    this.docs.set(clubId, club);
  }

  async readComparisons(clubId: string): Promise<RawDoc[]> {
    this.calls.push(`list:${clubId}`);
    if (this.readError) throw this.readError;
    return [...(this.docs.get(clubId) ?? new Map<string, Readonly<Record<string, unknown>>>()).entries()].map(([id, data]) => ({ id, data }));
  }

  async deleteAll(clubId: string): Promise<void> {
    this.calls.push(`deleteAll:${clubId}`);
    this.docs.delete(clubId);
    for (const key of [...this.readers.keys()]) if (key.startsWith(`${clubId}/`)) this.readers.delete(key);
  }
}
