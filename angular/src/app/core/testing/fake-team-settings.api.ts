import type { SnapshotMeta } from '../firebase/types';
import type { TeamSettingsApi } from '../firebase/team-settings.api';

/** Ersatz für {@link TeamSettingsApi} in Tests (ein Dokument meta/settings). */
export class FakeTeamSettingsApi implements Pick<TeamSettingsApi, keyof TeamSettingsApi> {
  constructor(readonly calls: string[] = []) {}

  settings: Record<string, unknown> | null = null;
  watchError: unknown = null;
  saveError: unknown = null;
  watchers = 0;
  errorListener: ((error: unknown) => void) | null = null;
  private listener: ((data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void) | null = null;

  async watchSettings(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchSettings');
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
    this.listener?.(this.settings, meta);
  }

  async saveSettings(data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveSettings');
    if (this.saveError) throw this.saveError;
    this.settings = { ...this.settings, ...data };
    this.emit();
  }
}
