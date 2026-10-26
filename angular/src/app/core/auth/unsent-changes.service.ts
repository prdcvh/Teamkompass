import { Injectable, Injector, inject } from '@angular/core';
import { AuthApi } from '../firebase/auth.api';
import { LiveOutboxService } from '../live/live-outbox.service';

/** So lange darf die Prüfung beim Abmelden höchstens auf die Bestätigung des Servers warten (mit Netz: fast sofort). */
export const PENDING_WRITES_TIMEOUT_MS = 1500;

/**
 * Was auf dem Gerät noch nicht beim Server angekommen ist (SCRUM-220).
 * live: Änderungen im Postausgang des Live-Modus (genaue Zahl, auch aus anderen Teams des Kontos).
 * waiting: Firestore hat noch ungesendete Änderungen (Bewertungen, Notizen, …; auch die Live-Punkte selbst) – ohne Zahl.
 */
export interface UnsentChanges {
  readonly live: number;
  readonly waiting: boolean;
}

export const NOTHING_UNSENT: UnsentChanges = { live: 0, waiting: false };

export function hasUnsent(changes: UnsentChanges): boolean {
  return changes.live > 0 || changes.waiting;
}

/**
 * Prüft vor dem Abmelden, ob noch Eingaben auf dem Gerät warten. Das Abmelden leert aus Datenschutzgründen den ganzen
 * lokalen Speicher – was dann noch nicht gesendet ist, ginge verloren. Die Seite „Abmelden“ fragt deshalb vorher nach.
 * Ein Fehler bei der Prüfung blockiert das Abmelden nie (dann gilt: nichts bekannt).
 */
@Injectable({ providedIn: 'root' })
export class UnsentChangesService {
  private readonly authApi = inject(AuthApi);
  private readonly injector = inject(Injector);

  async check(timeoutMs = PENDING_WRITES_TIMEOUT_MS): Promise<UnsentChanges> {
    let live = 0;
    try {
      // Erst hier geholt: der Postausgang startet sonst schon beim Laden der Abmelde-Seite mit (keine Startabhängigkeit).
      live = this.injector.get(LiveOutboxService).pendingForAccount();
    } catch (error) {
      console.error(error);
    }
    let waiting = false;
    try {
      waiting = await this.authApi.hasPendingWrites(timeoutMs);
    } catch (error) {
      console.error(error);
    }
    return { live, waiting };
  }
}
