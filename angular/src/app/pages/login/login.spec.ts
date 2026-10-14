import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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

  it('zeigt zuerst den Trainer-Login', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Trainer-Login');
    expect(root(fixture).querySelector('input[type="password"]')).not.toBeNull();
  });

  it('wechselt auf den Einladungscode für Spieler/Eltern', async () => {
    const fixture = await render();
    const tabs = root(fixture).querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[1].click();
    await fixture.whenStable();
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Spieler- oder Elternzugang');
    expect(root(fixture).querySelector('input[name="code"]')).not.toBeNull();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
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

  it('führt Spieler nach dem Einlösen des Einladungscodes zur eigenen Ansicht', async () => {
    const fixture = await render();
    firebase.access.invites.set('ABC123', { role: 'player', playerId: 'p1', expiresAt: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (root(fixture).querySelector('#tab-code') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const code = root(fixture).querySelector('input[name="code"], #code') as HTMLInputElement;
    code.value = 'ABC123';
    code.dispatchEvent(new Event('input'));
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/ansicht'), { timeout: 3000 });
    expect(firebase.calls).toContain('claim:ABC123');
    expect(TestBed.inject(SessionService).role()).toBe('player');
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
      const first = root(fixture).querySelector('#tab-trainer') as HTMLElement;
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
      expect(root(fixture).querySelector('h3')?.textContent).toBe('Trainer-Login');
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
