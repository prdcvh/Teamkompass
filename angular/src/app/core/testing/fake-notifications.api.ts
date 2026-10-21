import type { NotificationsApi } from '../firebase/notifications.api';

/** Ersatz für {@link NotificationsApi} in Tests (ein Dokument je Konto). */
export class FakeNotificationsApi implements Pick<NotificationsApi, keyof NotificationsApi> {
  constructor(readonly calls: string[] = []) {}

  docs = new Map<string, Record<string, unknown>>();
  readError: unknown = null;
  saveError: unknown = null;

  async readNotifications(uid: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push('readNotifications');
    if (this.readError) throw this.readError;
    return this.docs.get(uid) ?? null;
  }

  async saveNotifications(uid: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push('saveNotifications');
    if (this.saveError) throw this.saveError;
    this.docs.set(uid, { ...this.docs.get(uid), ...data });
  }
}
