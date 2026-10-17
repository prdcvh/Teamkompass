import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import {
  type DeviceInfo,
  INSTALL_HINT_KEY,
  type InstallMode,
  type StoredHint,
  installMode,
  isSuppressed,
  laterUntil,
  parseStoredHint,
} from './install-hint';

/** Das Ereignis `beforeinstallprompt` (Chromium) ist nicht in den Standardtypen. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Hinweis „Zum Startbildschirm hinzufügen“. Die Entscheidung „Später“/„Nicht mehr anzeigen“ liegt nur im
 * `localStorage` dieses Geräts. Der Dienst wird beim App-Start erzeugt, damit ein früh feuerndes
 * `beforeinstallprompt` nicht verloren geht.
 */
@Injectable({ providedIn: 'root' })
export class InstallHintService {
  private readonly view = inject(DOCUMENT).defaultView;
  private readonly prompt = signal<InstallPromptEvent | null>(null);
  private readonly installed = signal(false);
  private readonly stored = signal<StoredHint>(this.read());

  /** Welche Variante des Hinweises gezeigt wird; `null` = kein Hinweis. */
  readonly mode = computed<InstallMode | null>(() => {
    if (this.installed()) return null;
    const mode = installMode(this.device(), this.prompt() !== null);
    if (!mode || isSuppressed(this.stored(), Date.now())) return null;
    return mode;
  });

  constructor() {
    const view = this.view;
    if (!view) return;
    view.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault(); // eigenen Knopf statt der Mini-Leiste des Browsers zeigen
      this.prompt.set(event as InstallPromptEvent);
    });
    view.addEventListener('appinstalled', () => {
      this.prompt.set(null);
      this.installed.set(true);
    });
  }

  /** Löst die Installation des Browsers aus (nur wenn er sie angeboten hat). */
  async install(): Promise<void> {
    const event = this.prompt();
    if (!event) return;
    this.prompt.set(null); // ein Ereignis gilt nur einmal
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') this.installed.set(true);
    } catch {
      // Abbruch durch den Browser: der Hinweis bleibt über „Später“ beherrschbar
    }
  }

  later(): void {
    this.write({ never: false, laterUntil: laterUntil(Date.now()) });
  }

  never(): void {
    this.write({ never: true, laterUntil: 0 });
  }

  private device(): DeviceInfo {
    const view = this.view;
    const nav = (view?.navigator ?? {}) as Navigator & { standalone?: boolean };
    return {
      userAgent: nav.userAgent ?? '',
      platform: nav.platform ?? '',
      maxTouchPoints: nav.maxTouchPoints ?? 0,
      standalone:
        nav.standalone === true ||
        (typeof view?.matchMedia === 'function' && view.matchMedia('(display-mode: standalone)').matches),
    };
  }

  private read(): StoredHint {
    try {
      return parseStoredHint(localStorage.getItem(INSTALL_HINT_KEY));
    } catch {
      return parseStoredHint(null);
    }
  }

  private write(hint: StoredHint): void {
    this.stored.set(hint); // gilt auch dann für diese Sitzung, wenn der Speicher gesperrt ist
    try {
      localStorage.setItem(INSTALL_HINT_KEY, JSON.stringify(hint));
    } catch {
      // privater Modus: nur für diese Sitzung
    }
  }
}
