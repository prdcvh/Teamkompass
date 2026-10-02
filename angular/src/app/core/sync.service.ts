import { Injectable, computed, signal } from '@angular/core';
import type { SnapshotMeta } from './firebase.service';

/**
 * idle: noch nichts geladen
 * saved: Stand ist mit der Cloud abgeglichen
 * syncing: lokale Änderungen warten auf Bestätigung
 * offline: Stand stammt aus dem Zwischenspeicher des Geräts
 * error: Laden oder Speichern ist fehlgeschlagen
 */
export type SyncState = 'idle' | 'saved' | 'syncing' | 'offline' | 'error';

/** Sichtbarer Synchronisierungsstatus (Texte wie in der bisherigen App, SCRUM-19). */
@Injectable({ providedIn: 'root' })
export class SyncService {
  readonly state = signal<SyncState>('idle');
  readonly lastSyncedAt = signal<Date | null>(null);
  readonly detail = signal('');
  /** Ein Fehler bleibt stehen, bis ein späterer Schreibvorgang gelingt: ein Snapshot nach dem Zurückrollen darf ihn nicht überdecken. */
  private sticky = false;

  readonly label = computed(() => {
    switch (this.state()) {
      case 'saved': {
        const at = this.lastSyncedAt();
        return at ? `Cloud synchronisiert ${at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'Cloud synchronisiert';
      }
      case 'syncing':
        return 'Wird gespeichert …';
      case 'offline':
        return 'Offline – Änderungen werden gesendet, sobald die Verbindung steht';
      case 'error':
        return 'Speichern fehlgeschlagen – erneut versuchen';
      default:
        return 'Verbinde …';
    }
  });

  /** Übernimmt den Zustand eines Echtzeit-Snapshots. Ein Fehler bleibt sichtbar, bis ein Snapshot ohne Fehler folgt. */
  applySnapshot(meta: SnapshotMeta, now: Date = new Date()): void {
    if (this.sticky) {
      if (!meta.fromCache && !meta.hasPendingWrites) this.lastSyncedAt.set(now);
      return;
    }
    this.detail.set('');
    if (meta.fromCache) this.state.set('offline');
    else if (meta.hasPendingWrites) this.state.set('syncing');
    else {
      this.state.set('saved');
      this.lastSyncedAt.set(now);
    }
  }

  isFailed(): boolean {
    return this.sticky;
  }

  fail(detail: string): void {
    this.sticky = true;
    this.state.set('error');
    this.detail.set(detail);
  }

  /** Nach einem erfolgreichen Schreibvorgang oder neuem Laden: Fehleranzeige zurücknehmen. */
  clearError(): void {
    if (!this.sticky) return;
    this.sticky = false;
    this.detail.set('');
    this.state.set('saved');
  }

  reset(): void {
    this.sticky = false;
    this.state.set('idle');
    this.lastSyncedAt.set(null);
    this.detail.set('');
  }
}
