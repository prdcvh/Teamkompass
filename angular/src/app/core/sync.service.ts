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
    this.detail.set('');
    if (meta.fromCache) this.state.set('offline');
    else if (meta.hasPendingWrites) this.state.set('syncing');
    else {
      this.state.set('saved');
      this.lastSyncedAt.set(now);
    }
  }

  fail(detail: string): void {
    this.state.set('error');
    this.detail.set(detail);
  }

  reset(): void {
    this.state.set('idle');
    this.lastSyncedAt.set(null);
    this.detail.set('');
  }
}
