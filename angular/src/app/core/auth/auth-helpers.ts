import { ApplicationRef, type Injector, afterNextRender } from '@angular/core';
import type { AuthApi } from '../firebase/auth.api';
import { LiveOutboxService } from '../live/live-outbox.service';
import type { Role } from './role';

/** Wartezeit vor dem zweiten Versuch, den lokalen Firestore-Speicher zu leeren (ein anderer Tab hält ihn evtl. noch kurz offen). */
export const CACHE_CLEAR_RETRY_MS = 1000;

/**
 * Leert den lokalen Firestore-Speicher (SCRUM-199) und die Warteschlange ungesendeter Live-Punkte. Ein Fehler darf das
 * Abmelden nie aufhalten. (Aus dem AuthService ausgelagert, Verhalten unverändert.)
 */
export async function purgeLocalCaches(authApi: Pick<AuthApi, 'clearLocalCache'>, injector: Injector): Promise<void> {
  // Wie die Firestore-Warteschlange: ungesendete Live-Punkte (SCRUM-216) bleiben nicht liegen. Erst hier geholt (keine Startabhängigkeit).
  try { injector.get(LiveOutboxService).clear(); } catch (error) { console.error(error); }
  try {
    if (!(await authApi.clearLocalCache())) {
      await new Promise((resolve) => setTimeout(resolve, CACHE_CLEAR_RETRY_MS));
      await authApi.clearLocalCache();
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Führt sofort einen Durchlauf der Oberfläche aus (Teamwechsel, SCRUM-182): Dienste, die auf die geleerte Rolle
 * reagieren, räumen dabei auf (Abos beenden, Daten verwerfen), und die Seiten des alten Teams werden entfernt. Bewusst
 * ein direkter Durchlauf statt „irgendwann“: ohne ihn sähen diese Dienste die leere Rolle nie, wenn gleich danach die
 * neue gesetzt wird.
 */
export async function flushTeardown(injector: Injector): Promise<void> {
  try {
    injector.get(ApplicationRef).tick();
  } catch (error) {
    // Läuft gerade schon ein Durchlauf (sollte nach einem await nie passieren): auf den nächsten warten.
    console.warn(error);
    await new Promise<void>((resolve) => afterNextRender(() => resolve(), { injector }));
  }
}

export function displayNameFor(role: Role, email: string | null): string {
  if (role === 'player') return 'Spieler';
  if (role === 'parent') return 'Eltern';
  if (email) return email.split('@')[0];
  if (role === 'scout') return 'Scout';
  return role === 'physio' ? 'Medizin' : 'Trainer';
}
