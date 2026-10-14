import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Update-Verhalten der installierten App (SCRUM-76). Der Service Worker lädt eine neue Version im
 * Hintergrund; die App zeigt dann „Neue Version verfügbar“ und lädt erst auf Knopfdruck neu, damit
 * niemand mitten im Bewerten eine halb ausgefüllte Eingabe verliert. Kann der Service Worker eine
 * Version nicht mehr ausliefern (unrecoverable), lädt die App sofort neu.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  // Ohne provideServiceWorker (z. B. in Komponententests) einfach still bleiben.
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);

  readonly ready = signal(false);

  constructor() {
    const updates = this.updates;
    if (!updates?.isEnabled) return;
    updates.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(() => this.ready.set(true));
    updates.unrecoverable.subscribe(() => this.reload());
    // Eine installierte App bleibt oft tagelang offen: beim Zurückholen in den Vordergrund nachsehen.
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'visible') void updates.checkForUpdate().catch(() => false);
    });
  }

  reload(): void {
    this.document.location.reload();
  }
}
