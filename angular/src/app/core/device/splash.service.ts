import { DOCUMENT, Injectable, inject } from '@angular/core';

/** Mindestdauer der Start-Animation ab Seitenstart – nie länger als nötig (SCRUM-283). */
export const SPLASH_MIN_MS = 1200;

interface SplashHandle {
  hide(): void;
}

/**
 * Blendet den Begrüßungsbildschirm aus `index.html` aus, sobald die App bereit ist (Anmeldezustand
 * geprüft). War die App sehr schnell, wartet er höchstens bis zur Mindestdauer, damit die Animation
 * nicht abgehackt wirkt. Ohne Begrüßungsbildschirm (Tests, andere Hosts) passiert nichts.
 */
@Injectable({ providedIn: 'root' })
export class SplashService {
  private readonly document = inject(DOCUMENT);
  private done = false;

  /** Aufrufen, sobald die App bereit ist. `now` = Millisekunden seit Seitenstart. Mehrfachaufrufe sind harmlos. */
  markReady(now: number = performance.now()): void {
    if (this.done) return;
    this.done = true;
    const wait = Math.max(0, SPLASH_MIN_MS - now);
    if (wait === 0) this.hide();
    else setTimeout(() => this.hide(), wait);
  }

  private hide(): void {
    const handle = (this.document.defaultView as (Window & { tkSplash?: SplashHandle }) | null)?.tkSplash;
    handle?.hide();
  }
}
