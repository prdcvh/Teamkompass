import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { TEAM_DATA_PREFIX } from '../../core/device/local-data';
import { ThemeService } from '../../core/device/theme.service';
import { WORKSPACE_KEY } from '../../core/device/workspace';
import { Settings } from './settings';

describe('Settings (Einstellungen & Datenschutz)', () => {
  beforeEach(() => localStorage.clear());

  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'physio' | 'player' | null = null) {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    if (role) TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  it('rendert die Bereiche Darstellung, Lokale Daten, Aktivitätsverlauf und Wettervorhersage', async () => {
    const fixture = await render();
    const headings = [...root(fixture).querySelectorAll('.page > tk-card h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Darstellung', 'Lokale Daten', 'Aktivitätsverlauf', 'Wettervorhersage']);
    expect(root(fixture).textContent).toContain('Noch keine lokalen Aktivitäten protokolliert.');
  });

  it('erklärt den Datenschutz der Wettervorhersage (Open-Meteo)', async () => {
    const text = root(await render()).textContent ?? '';
    expect(text).toContain('Wettervorhersage');
    expect(text).toContain('open-meteo.com');
    expect(text).toContain('IP-Adresse');
    expect(text).toContain('Koordinaten');
    expect(text).toContain('90 Tage');
    expect(text).toContain('keine Spieler- oder Teamdaten');
    expect(text).toContain('CC BY 4.0');
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

  describe('Erinnerung per E-Mail (SCRUM-100)', () => {
    async function renderAs(role: 'trainer' | 'physio' | 'player', email: string | null) {
      firebase = new FakeFirebase();
      await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
      const session = TestBed.inject(SessionService);
      session.role.set(role);
      session.uid.set('u1');
      session.email.set(email);
      const fixture = TestBed.createComponent(Settings);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }
    const toggle = (fixture: { nativeElement: unknown }) => root(fixture).querySelector<HTMLInputElement>('#email-erinnerung input[role="switch"]');

    it('ist nur für Trainer mit E-Mail-Konto sichtbar', async () => {
      expect(toggle(await renderAs('trainer', null))).toBeNull();
      TestBed.resetTestingModule();
      expect(toggle(await renderAs('physio', 'a@b.de'))).toBeNull();
      TestBed.resetTestingModule();
      expect(toggle(await renderAs('player', null))).toBeNull();
      TestBed.resetTestingModule();
      expect(toggle(await renderAs('trainer', 'trainer@example.test'))).not.toBeNull();
    });

    it('ist standardmäßig aus, nennt die Kontoadresse und grenzt sich vom Geräte-Hinweis ab', async () => {
      const fixture = await renderAs('trainer', 'trainer@example.test');
      expect(toggle(fixture)?.checked).toBe(false);
      expect(root(fixture).textContent).toContain('trainer@example.test');
      expect(root(fixture).querySelector('header')?.textContent).toContain('gilt dagegen für dein Konto');
      expect(firebase.notifications.docs.size).toBe(0);
    });

    it('speichert den Schalter in der Cloud und lädt ihn wieder', async () => {
      const fixture = await renderAs('trainer', 'trainer@example.test');
      toggle(fixture)!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(firebase.notifications.docs.get('u1')).toEqual({ emailReminders: true });
      TestBed.resetTestingModule();
      firebase = new FakeFirebase();
      firebase.notifications.docs.set('u1', { emailReminders: true });
      await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
      const session = TestBed.inject(SessionService);
      session.role.set('trainer');
      session.uid.set('u1');
      session.email.set('trainer@example.test');
      const again = TestBed.createComponent(Settings);
      await again.whenStable();
      again.detectChanges();
      expect(toggle(again)?.checked).toBe(true);
    });

    it('zeigt bei einem Speicherfehler eine verständliche Meldung und lässt den Schalter aus', async () => {
      const fixture = await renderAs('trainer', 'trainer@example.test');
      firebase.notifications.saveError = { code: 'permission-denied' };
      toggle(fixture)!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root(fixture).querySelector('#email-erinnerung [role="alert"]')?.textContent).toContain('konnte nicht gespeichert werden');
      expect(toggle(fixture)?.checked).toBe(false);
    });

    it('zeigt bei einem Ladefehler eine Meldung und bietet erneutes Laden an', async () => {
      firebase = new FakeFirebase();
      firebase.notifications.readError = { code: 'unavailable' };
      await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
      const session = TestBed.inject(SessionService);
      session.role.set('trainer');
      session.uid.set('u1');
      session.email.set('trainer@example.test');
      const fixture = TestBed.createComponent(Settings);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root(fixture).querySelector('#email-erinnerung [role="alert"]')?.textContent).toContain('konnte nicht geladen werden');
      expect(toggle(fixture)?.disabled).toBe(true);
      expect(firebase.calls.filter((call) => call === 'readNotifications')).toHaveLength(1);
    });
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
      const fixture = await render('physio');
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

  describe('Kennzahlen-Zusammenfassung (SCRUM-201)', () => {
    const card = (fixture: { nativeElement: unknown }) => root(fixture).querySelector('#kennzahlen-zusammenfassung');

    it('nur für Trainer sichtbar', async () => {
      expect(card(await render('player'))).toBeNull();
      TestBed.resetTestingModule();
      expect(card(await render('physio'))).toBeNull();
    });

    it('nicht eingerichtet: Neu berechnen richtet ein und meldet das Prüfergebnis', async () => {
      const fixture = await render('trainer');
      firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
      firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(card(fixture)?.textContent).toContain('Noch nicht eingerichtet');
      });
      const buttons = () => [...card(fixture)!.querySelectorAll('button')].map((entry) => entry.textContent?.trim());
      expect(buttons()).toEqual(['Neu berechnen']);
      const button = [...card(fixture)!.querySelectorAll('button')].find((entry) => entry.textContent?.includes('Neu berechnen')) as HTMLButtonElement;
      button.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(card(fixture)?.querySelector('[data-testid="stats-result"]')?.textContent).toContain('stimmt mit allen 1 Bewertungen überein (1 Spieler)');
      });
      expect(card(fixture)?.querySelector('[data-testid="stats-state"]')?.textContent).toContain('Eingerichtet');
      expect(buttons()).toEqual(['Neu berechnen', 'Prüfen']);
    });

    it('fehlende Freigabe in der Cloud: Hinweis statt Knöpfe', async () => {
      firebase = new FakeFirebase();
      firebase.playerStats.markerError = { code: 'permission-denied' };
      await TestBed.configureTestingModule({ imports: [Settings], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
      TestBed.inject(SessionService).role.set('trainer');
      const fixture = TestBed.createComponent(Settings);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(card(fixture)?.textContent).toContain('Die Freigabe in der Cloud fehlt noch');
      });
      expect(card(fixture)?.querySelector('button')).toBeNull();
    });
  });
});
