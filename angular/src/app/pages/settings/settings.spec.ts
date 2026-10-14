import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { TEAM_DATA_PREFIX } from '../../core/local-data';
import { ThemeService } from '../../core/theme.service';
import { WORKSPACE_KEY } from '../../core/workspace';
import { Settings } from './settings';

describe('Settings (Einstellungen & Datenschutz)', () => {
  beforeEach(() => localStorage.clear());

  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'medical' | 'player' | null = null) {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    if (role) TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('rendert die Bereiche Darstellung, Lokale Daten und Aktivitätsverlauf', async () => {
    const fixture = await render();
    const headings = [...root(fixture).querySelectorAll('.page > tk-card h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Darstellung', 'Lokale Daten', 'Aktivitätsverlauf']);
    expect(root(fixture).textContent).toContain('Noch keine lokalen Aktivitäten protokolliert.');
  });

  it('schaltet den Darkmode um', async () => {
    const fixture = await render();
    const theme = TestBed.inject(ThemeService);
    theme.set(false);
    (root(fixture).querySelector('input[role="switch"]') as HTMLInputElement).click();
    expect(theme.dark()).toBe(true);
    theme.set(false);
  });

  it('speichert die Aufbewahrungsdauer und protokolliert die Änderung', async () => {
    const fixture = await render();
    const select = root(fixture).querySelector('select') as HTMLSelectElement;
    select.value = '180';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? '{}');
    expect(stored.retentionDays).toBe(180);
    expect(root(fixture).textContent).toContain('Lokale Aufbewahrung auf 180 Tage gesetzt');
  });

  it('löscht lokale Teamdaten erst nach Bestätigung und lässt die Einstellungen stehen', async () => {
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    const fixture = await render();
    const button = [...root(fixture).querySelectorAll('button')].find((b) => b.textContent?.includes('Zwischenspeicher löschen')) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).not.toBeNull();
    const confirm = [...root(fixture).querySelectorAll('tk-dialog button')].find((b) => b.textContent?.trim() === 'Löschen') as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
    expect(root(fixture).textContent).toContain('Der lokale Zwischenspeicher wurde gelöscht.');
    expect(root(fixture).textContent).toContain('Lokalen Zwischenspeicher gelöscht');
  });

  it('gibt Verlaufstexte nie als HTML aus', async () => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ activity: [{ id: '1', at: '2026-10-01T10:00:00.000Z', action: '<img src=x onerror=alert(1)>' }] }));
    const fixture = await render();
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(root(fixture).textContent).toContain('<img src=x onerror=alert(1)>');
  });

  describe('Passwort ändern', () => {
    const fill = (fixture: { nativeElement: unknown }, name: string, value: string) => {
      const input = root(fixture).querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }) => {
      root(fixture).querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('ist für Spieler nicht sichtbar', async () => {
      expect(root(await render('player')).textContent).not.toContain('Passwort ändern');
    });

    it('ist ohne Anmeldung nicht sichtbar', async () => {
      expect(root(await render(null)).textContent).not.toContain('Passwort ändern');
    });

    it('hat verdeckte Felder mit passenden Autofill-Hinweisen', async () => {
      const fixture = await render('trainer');
      fixture.detectChanges();
      expect(root(fixture).querySelector<HTMLInputElement>('input[name="current"]')!.type).toBe('password');
      expect(root(fixture).querySelector<HTMLInputElement>('input[name="next"]')!.autocomplete).toBe('new-password');
      expect(root(fixture).querySelector<HTMLInputElement>('input[name="repeat"]')!.type).toBe('password');
    });

    it('ändert das Passwort und leert die Felder', async () => {
      const fixture = await render('medical');
      fixture.detectChanges();
      fill(fixture, 'current', 'AltesPasswort1');
      fill(fixture, 'next', 'NeuesPasswort1');
      fill(fixture, 'repeat', 'NeuesPasswort1');
      await submit(fixture);
      expect(firebase.calls).toContain('changePassword:AltesPasswort1:NeuesPasswort1');
      expect(root(fixture).textContent).toContain('Das Passwort wurde geändert.');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(root(fixture).querySelector<HTMLInputElement>('input[name="next"]')!.value).toBe('');
      expect(root(fixture).querySelector<HTMLInputElement>('input[name="current"]')!.value).toBe('');
    });

    it('zeigt Richtlinie und Fehler an, ohne Firebase zu fragen', async () => {
      const fixture = await render('trainer');
      fixture.detectChanges();
      fill(fixture, 'current', 'AltesPasswort1');
      fill(fixture, 'next', 'kurz1A');
      fill(fixture, 'repeat', 'kurz1A');
      await submit(fixture);
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('mindestens 12');
      expect(firebase.calls.some((call) => call.startsWith('changePassword'))).toBe(false);
    });

    it('meldet ein falsches aktuelles Passwort', async () => {
      const fixture = await render('trainer');
      fixture.detectChanges();
      firebase.auth.changePasswordError = { code: 'auth/invalid-credential' };
      fill(fixture, 'current', 'Falsch');
      fill(fixture, 'next', 'NeuesPasswort1');
      fill(fixture, 'repeat', 'NeuesPasswort1');
      await submit(fixture);
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('aktuelle Passwort ist falsch');
    });
  });
});
