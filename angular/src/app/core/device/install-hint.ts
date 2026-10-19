/** Schlüssel im Browser-Speicher (nur dieses Gerät, nie in der Cloud). */
export const INSTALL_HINT_KEY = 'teamkompass-install-hint';

/** So lange bleibt der Hinweis nach „Später“ weg. */
export const LATER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InstallPlatform = 'ios' | 'android' | 'desktop';

/** Was vom Gerät bekannt ist; getrennt vom echten `navigator`, damit Tests ein Gerät vortäuschen können. */
export interface DeviceInfo {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.standalone` (iPhone) bzw. `display-mode: standalone` (übrige Browser). */
  standalone: boolean;
}

/** Erkennt die Geräteart. iPads melden sich seit iPadOS 13 als Mac, haben aber Touch. */
export function detectPlatform(info: DeviceInfo): InstallPlatform {
  if (/iPhone|iPad|iPod/.test(info.userAgent) || (info.platform === 'MacIntel' && info.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(info.userAgent)) return 'android';
  return 'desktop';
}

/** Auf iOS geht „Zum Home-Bildschirm“ nur in Safari; andere Browser und Apps mit eigenem Browser scheiden aus. */
export function isIosSafari(info: DeviceInfo): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\/|GSA\//.test(info.userAgent);
}

export interface StoredHint {
  /** „Nicht mehr anzeigen“. */
  never: boolean;
  /** „Später“: frühester Zeitpunkt (ms), zu dem der Hinweis wiederkommt. */
  laterUntil: number;
}

export function parseStoredHint(raw: string | null): StoredHint {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === 'object') {
      const { never, laterUntil } = value as Record<string, unknown>;
      return { never: never === true, laterUntil: typeof laterUntil === 'number' ? laterUntil : 0 };
    }
  } catch {
    // kaputter Eintrag: wie nie gesehen behandeln
  }
  return { never: false, laterUntil: 0 };
}

export function laterUntil(now: number): number {
  return now + LATER_DAYS * DAY_MS;
}

export function isSuppressed(hint: StoredHint, now: number): boolean {
  return hint.never || now < hint.laterUntil;
}

export type InstallMode = 'prompt' | 'ios-steps' | 'android-steps';

/**
 * Welcher Hinweis zeigt sich? `null` = gar keiner.
 * - schon installiert/vom Startbildschirm geöffnet: keiner
 * - Browser bietet die Installation an (`beforeinstallprompt`): Knopf „Installieren“ (Android und Desktop)
 * - iPhone/iPad in Safari: Schritte mit Teilen-Symbol
 * - Android ohne Angebot: Schritte über das Menü
 * - Desktop ohne Angebot: keiner
 */
export function installMode(info: DeviceInfo, canPrompt: boolean): InstallMode | null {
  if (info.standalone) return null;
  const platform = detectPlatform(info);
  if (platform === 'ios') return isIosSafari(info) ? 'ios-steps' : null;
  if (canPrompt) return 'prompt';
  return platform === 'android' ? 'android-steps' : null;
}
