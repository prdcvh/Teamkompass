import { DestroyRef, Injectable, inject } from '@angular/core';

/** Das Wake-Lock-Objekt des Browsers (in älteren TypeScript-Bibliotheken nicht enthalten). */
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}
interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Hält den Bildschirm an, solange eine Ansicht es braucht (Live-Modus, SCRUM-213). Wo der Browser keinen Wake Lock kann,
 * passiert nichts. Der Browser gibt die Sperre beim Wechsel in den Hintergrund selbst frei – beim Zurückkommen wird sie
 * neu angefordert.
 */
@Injectable({ providedIn: 'root' })
export class WakeLockService {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;
  private readonly onVisible = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
  }

  /** Bildschirm anhalten. Gibt zurück, ob der Browser die Sperre gewährt hat. */
  async keepAwake(): Promise<boolean> {
    if (!this.wanted) {
      this.wanted = true;
      document.addEventListener('visibilitychange', this.onVisible);
    }
    return this.acquire();
  }

  release(): void {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    const sentinel = this.sentinel;
    this.sentinel = null;
    void sentinel?.release().catch(() => undefined);
  }

  private async acquire(): Promise<boolean> {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api || this.sentinel) return this.sentinel !== null;
    try {
      const sentinel = await api.request('screen');
      if (!this.wanted) {
        void sentinel.release().catch(() => undefined);
        return false;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
      return true;
    } catch {
      return false; // z. B. Energiesparmodus oder Seite nicht sichtbar
    }
  }
}
