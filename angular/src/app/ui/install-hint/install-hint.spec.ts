import { TestBed } from '@angular/core/testing';
import { INSTALL_HINT_KEY, LATER_DAYS, installMode, parseStoredHint } from '../../core/device/install-hint';
import { InstallHintService } from '../../core/device/install-hint.service';
import { InstallHint } from './install-hint';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const device = (userAgent: string, standalone = false) => ({ userAgent, platform: '', maxTouchPoints: 0, standalone });

describe('installMode (Auswahl des Hinweises je Gerät)', () => {
  it('iPhone in Safari: Schritte mit Teilen-Symbol, auch ohne beforeinstallprompt', () => {
    expect(installMode(device(IPHONE_SAFARI), false)).toBe('ios-steps');
  });

  it('iPad, das sich als Mac meldet, zählt als iOS', () => {
    const ipad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.5 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5, standalone: false };
    expect(installMode(ipad, false)).toBe('ios-steps');
  });

  it('iPhone in einem anderen Browser: kein Hinweis (dort gibt es den Weg nicht)', () => {
    expect(installMode(device(IPHONE_CHROME), false)).toBeNull();
  });

  it('Android: Installieren-Knopf, wenn der Browser es anbietet, sonst Menü-Schritte', () => {
    expect(installMode(device(ANDROID_CHROME), true)).toBe('prompt');
    expect(installMode(device(ANDROID_CHROME), false)).toBe('android-steps');
  });

  it('Desktop: nur mit Angebot des Browsers', () => {
    expect(installMode(device(DESKTOP_CHROME), true)).toBe('prompt');
    expect(installMode(device(DESKTOP_CHROME), false)).toBeNull();
  });

  it('schon vom Startbildschirm geöffnet: nie ein Hinweis', () => {
    expect(installMode(device(IPHONE_SAFARI, true), false)).toBeNull();
    expect(installMode(device(ANDROID_CHROME, true), true)).toBeNull();
  });

  it('kaputter gespeicherter Eintrag gilt als nie gesehen', () => {
    expect(parseStoredHint('{kaputt')).toEqual({ never: false, laterUntil: 0 });
    expect(parseStoredHint(null)).toEqual({ never: false, laterUntil: 0 });
  });
});

describe('InstallHint (Hinweis auf der Startseite)', () => {
  const NOW = new Date('2026-10-16T10:00:00Z').getTime();

  function setup(userAgent: string, options: { standalone?: boolean; stored?: string } = {}) {
    localStorage.clear();
    if (options.stored) localStorage.setItem(INSTALL_HINT_KEY, options.stored);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    window.matchMedia = ((query: string) => ({
      matches: query.includes('standalone') && !!options.standalone,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const fixture = TestBed.createComponent(InstallHint);
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const button = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('iPhone: zeigt den Hinweis höflich (role=status) und die Anleitung mit Teilen-Schritten', () => {
    const fixture = setup(IPHONE_SAFARI);
    expect(root(fixture).querySelector('aside[role="status"]')).not.toBeNull();
    expect(button(fixture, 'Anleitung')).toBeDefined();
    expect(button(fixture, 'Später')).toBeDefined();
    expect(button(fixture, 'Nicht mehr anzeigen')).toBeDefined();
    button(fixture, 'Anleitung')?.click();
    fixture.detectChanges();
    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Teilen-Symbol');
    expect(text).toContain('Zum Home-Bildschirm');
    expect(text).toContain('Hinzufügen');
  });

  it('Android ohne Angebot: Anleitung mit Menü und „Zum Startbildschirm hinzufügen“', () => {
    const fixture = setup(ANDROID_CHROME);
    button(fixture, 'Anleitung')?.click();
    fixture.detectChanges();
    const text = root(fixture).textContent ?? '';
    expect(text).toContain('Menü');
    expect(text).toContain('Zum Startbildschirm hinzufügen');
    expect(text).toContain('App installieren');
  });

  it('Android mit beforeinstallprompt: Knopf „Installieren“ löst die Installation aus', async () => {
    const fixture = setup(ANDROID_CHROME);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(button(fixture, 'Anleitung')).toBeUndefined();
    button(fixture, 'Installieren')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(root(fixture).querySelector('aside')).toBeNull(); // installiert: Hinweis weg
  });

  it('Desktop ohne Angebot des Browsers: kein Hinweis', () => {
    const fixture = setup(DESKTOP_CHROME);
    expect(root(fixture).querySelector('aside')).toBeNull();
  });

  it('schon installiert (Standalone): kein Hinweis', () => {
    const fixture = setup(IPHONE_SAFARI, { standalone: true });
    expect(root(fixture).querySelector('aside')).toBeNull();
  });

  it('„Nicht mehr anzeigen“ wird im Gerät gemerkt, auch für eine neue Sitzung', () => {
    const fixture = setup(IPHONE_SAFARI);
    button(fixture, 'Nicht mehr anzeigen')?.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('aside')).toBeNull();
    expect(JSON.parse(localStorage.getItem(INSTALL_HINT_KEY) ?? '{}')).toMatchObject({ never: true });

    TestBed.resetTestingModule();
    const again = setup(IPHONE_SAFARI, { stored: localStorage.getItem(INSTALL_HINT_KEY) ?? '' });
    expect(root(again).querySelector('aside')).toBeNull();
  });

  it(`„Später“ blendet für ${LATER_DAYS} Tage aus, danach kommt der Hinweis wieder`, () => {
    const fixture = setup(IPHONE_SAFARI);
    button(fixture, 'Später')?.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('aside')).toBeNull();
    const stored = localStorage.getItem(INSTALL_HINT_KEY) ?? '';
    expect(JSON.parse(stored).laterUntil).toBe(NOW + LATER_DAYS * 24 * 60 * 60 * 1000);

    TestBed.resetTestingModule();
    vi.spyOn(Date, 'now').mockReturnValue(NOW + (LATER_DAYS * 24 * 60 * 60 * 1000 - 1000));
    expect(root(setup(IPHONE_SAFARI, { stored })).querySelector('aside')).toBeNull();

    TestBed.resetTestingModule();
    vi.spyOn(Date, 'now').mockReturnValue(NOW + LATER_DAYS * 24 * 60 * 60 * 1000 + 1000);
    expect(root(setup(IPHONE_SAFARI, { stored })).querySelector('aside')).not.toBeNull();
  });

  it('gesperrter Speicher: Hinweis lässt sich trotzdem für diese Sitzung schließen', () => {
    const fixture = setup(IPHONE_SAFARI);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    button(fixture, 'Später')?.click();
    fixture.detectChanges();
    expect(root(fixture).querySelector('aside')).toBeNull();
    expect(TestBed.inject(InstallHintService).mode()).toBeNull();
  });
});
