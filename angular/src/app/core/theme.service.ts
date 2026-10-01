import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'teamkompass-theme';

/** Dunkles Design: Auswahl wird pro Gerät gemerkt; ohne Auswahl gilt die Systemeinstellung. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(this.initial());

  toggle(): void {
    this.set(!this.dark());
  }

  set(dark: boolean): void {
    this.dark.set(dark);
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Speicher gesperrt (privater Modus): Auswahl gilt nur für diese Sitzung.
    }
  }

  private initial(): boolean {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // siehe oben
    }
    const dark =
      stored === 'dark' ||
      (stored === null && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (stored) document.documentElement.dataset['theme'] = stored;
    return dark;
  }
}
