import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Login } from './login';

describe('Login', () => {
  let firebase: FakeFirebase;

  async function render() {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), ...provideFakeFirebase(firebase)],
    }).compileComponents();
    TestBed.inject(AuthService).start(0);
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const type = (fixture: { nativeElement: unknown }, name: string, value: string) => {
    const input = root(fixture).querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const openCodeTab = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }) => {
    (root(fixture).querySelector('#tab-code') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const submit = (fixture: { nativeElement: unknown }) => (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

  it('zeigt zuerst die Anmeldung mit E-Mail (Trainer und Spieler mit Konto)', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Mit E-Mail anmelden');
    expect(root(fixture).querySelector('[role="tab"]')?.textContent).toBe('Anmelden');
    expect(root(fixture).querySelector('input[type="password"]')).not.toBeNull();
  });

  it('wechselt auf den Einladungscode', async () => {
    const fixture = await render();
    const tabs = root(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[1].click();
    await fixture.whenStable();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Neu hier? Code einlösen');
    expect(root(fixture).querySelector('input[name="code"]')).not.toBeNull();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('füllt den Code aus einem Einladungslink der bisherigen App vor und entfernt ihn aus der Adresszeile (SCRUM-169)', async () => {
    const code = 'cd'.repeat(24);
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ invite: code.toUpperCase() }) } } },
      ],
    }).compileComponents();
    TestBed.inject(AuthService).start(0);
    const location = TestBed.inject(Location);
    const replace = vi.spyOn(location, 'replaceState');
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Neu hier? Code einlösen');
    expect(root(fixture).querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe(code);
    expect(replace).toHaveBeenCalledWith('/anmelden');
    // Angemeldet wird erst per Knopfdruck.
    expect(firebase.calls.some((call) => call.startsWith('anon') || call.includes('claim'))).toBe(false);
  });

  it('zeigt Fehlermeldungen sichtbar als Hinweis an', async () => {
    const fixture = await render();
    TestBed.inject(AuthService).error.set('E-Mail oder Passwort ist falsch.');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('falsch');
  });

  it('geht nach erfolgreicher Anmeldung zur Startseite', async () => {
    const fixture = await render();
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const email = root(fixture).querySelector('input[type="email"]') as HTMLInputElement;
    const password = root(fixture).querySelector('input[type="password"]') as HTMLInputElement;
    email.value = 'coach@verein.de';
    email.dispatchEvent(new Event('input'));
    password.value = 'geheim';
    password.dispatchEvent(new Event('input'));
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
  });

  it('legt mit Einladungscode ein Spieler-Konto mit E-Mail an und führt zur eigenen Ansicht (SCRUM-114)', async () => {
    const fixture = await render();
    firebase.access.invites.set('ABC123', { role: 'player', playerId: 'p1', expiresAt: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await openCodeTab(fixture);
    type(fixture, 'code', 'ABC123');
    type(fixture, 'newEmail', 'kind@familie.de');
    type(fixture, 'newPassword', 'Sicher-Passwort-1');
    type(fixture, 'newRepeat', 'Sicher-Passwort-1');
    submit(fixture);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/ansicht'), { timeout: 3000 });
    expect(firebase.calls).toContain('claim:ABC123');
    expect(firebase.calls).toContain('link:uid-1:kind@familie.de:Sicher-Passwort-1');
    expect(TestBed.inject(SessionService).role()).toBe('player');
    expect(TestBed.inject(SessionService).playerId()).toBe('p1');
    expect(TestBed.inject(SessionService).email()).toBe('kind@familie.de');
  });

  it('prüft E-Mail und Passwort, bevor der Einmal-Code angefasst wird', async () => {
    const fixture = await render();
    firebase.access.invites.set('ABC123', { role: 'player', playerId: 'p1', expiresAt: null });
    await openCodeTab(fixture);
    type(fixture, 'code', 'ABC123');
    type(fixture, 'newEmail', 'kein-at');
    type(fixture, 'newPassword', 'kurz');
    type(fixture, 'newRepeat', 'anders');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    const errors = [...root(fixture).querySelectorAll('.field-error')].map((node) => node.textContent ?? '');
    expect(errors.some((text) => text.includes('gültige E-Mail'))).toBe(true);
    expect(errors.some((text) => text.includes('12 Zeichen'))).toBe(true);
    expect(root(fixture).querySelector('input[name="newEmail"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(firebase.calls.some((call) => call === 'anonymous' || call.startsWith('invite:') || call.startsWith('claim:'))).toBe(false);
    expect(firebase.access.invites.has('ABC123')).toBe(true);
  });

  it('verlangt beim Einlösen den Code', async () => {
    const fixture = await render();
    await openCodeTab(fixture);
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root(fixture).querySelector('.error[role="alert"]')?.textContent).toContain('Einladungscode');
    expect(firebase.calls).not.toContain('anonymous');
  });

  it('meldet einen Spieler mit Konto über E-Mail und Passwort an (anderes Gerät)', async () => {
    const fixture = await render();
    firebase.access.members.set('uid-1', { role: 'player', playerId: 'p1' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    type(fixture, 'email', 'kind@familie.de');
    type(fixture, 'password', 'Sicher-Passwort-1');
    submit(fixture);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/ansicht'));
    expect(TestBed.inject(SessionService).playerId()).toBe('p1');
  });

  describe('Gestaltung (SCRUM-84)', () => {
    it('hat keine Inline-Styles (CSP-konform) und dekorative Grafik ist für Screenreader versteckt', async () => {
      const fixture = await render();
      expect(root(fixture).querySelectorAll('[style]')).toHaveLength(0);
      expect(root(fixture).querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('zeigt Vereins- und Teamnamen und die Kernpunkte', async () => {
      const fixture = await render();
      const text = root(fixture).textContent ?? '';
      expect(text).toContain('1. FC Königstein');
      expect(text).toContain('U14');
      expect(root(fixture).querySelectorAll('.points li')).toHaveLength(3);
    });

    it('kann das Passwort anzeigen und wieder verbergen', async () => {
      const fixture = await render();
      const reveal = root(fixture).querySelector('.reveal') as HTMLButtonElement;
      expect(reveal.getAttribute('aria-label')).toBe('Passwort anzeigen');
      reveal.click();
      fixture.detectChanges();
      expect(root(fixture).querySelector('input[name="password"]')?.getAttribute('type')).toBe('text');
      expect(reveal.getAttribute('aria-pressed')).toBe('true');
      reveal.click();
      fixture.detectChanges();
      expect(root(fixture).querySelector('input[name="password"]')?.getAttribute('type')).toBe('password');
    });

    it('wechselt die Tabs per Pfeiltaste und setzt den Fokus', async () => {
      const fixture = await render();
      const first = root(fixture).querySelector('#tab-email') as HTMLElement;
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root(fixture).querySelector('#tab-code')?.getAttribute('aria-selected')).toBe('true');
      expect(root(fixture).querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe('tab-code');
    });

    it('zeigt beim Anmelden einen Ladezustand und sperrt den Knopf', async () => {
      const fixture = await render();
      TestBed.inject(AuthService).busy.set(true);
      fixture.detectChanges();
      const submit = root(fixture).querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(submit.getAttribute('aria-busy')).toBe('true');
      expect(submit.textContent).toContain('Anmelden …');
      expect(submit.querySelector('.spinner')).not.toBeNull();
    });
  });

  describe('Passwort vergessen', () => {
    const openReset = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }) => {
      (root(fixture).querySelector('.linklike') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const sendTo = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }, value: string) => {
      const input = root(fixture).querySelector('input[name="resetEmail"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('öffnet das Formular zum Zurücksetzen und kommt wieder zur Anmeldung zurück', async () => {
      const fixture = await render();
      await openReset(fixture);
      expect(root(fixture).querySelector('h3')?.textContent).toBe('Passwort zurücksetzen');
      expect(root(fixture).querySelector('input[type="password"]')).toBeNull();
      (root(fixture).querySelector('.linklike') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(root(fixture).querySelector('h3')?.textContent).toBe('Mit E-Mail anmelden');
    });

    it('schickt die Mail und bestätigt neutral', async () => {
      const fixture = await render();
      await openReset(fixture);
      await sendTo(fixture, 'coach@verein.de');
      expect(firebase.calls).toContain('reset:coach@verein.de');
      expect(root(fixture).querySelector('[role="status"]')?.textContent).toContain('Wenn zu dieser E-Mail-Adresse ein Konto existiert');
    });

    it('bestätigt auch bei unbekannter Adresse gleich (keine Konto-Erkennung)', async () => {
      const fixture = await render();
      firebase.auth.resetError = { code: 'auth/user-not-found' };
      await openReset(fixture);
      await sendTo(fixture, 'unbekannt@verein.de');
      expect(root(fixture).querySelector('[role="status"]')?.textContent).toContain('Wenn zu dieser E-Mail-Adresse ein Konto existiert');
      expect(root(fixture).querySelector('[role="alert"]')).toBeNull();
    });

    it('meldet eine ungültige Adresse', async () => {
      const fixture = await render();
      await openReset(fixture);
      await sendTo(fixture, 'kein-at');
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('gültige E-Mail');
      expect(firebase.calls.some((call) => call.startsWith('reset:'))).toBe(false);
    });
  });
});
