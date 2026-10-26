import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { ConnectEmail } from './connect-email';

/** Spieler-Zugang nachträglich mit E-Mail verbinden (SCRUM-114). */
describe('ConnectEmail', () => {
  let firebase: FakeFirebase;
  const good = 'Sicher-Passwort-1';

  async function render(role: Role, email: string | null = null) {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('anon-1');
    session.playerId.set(role === 'player' || role === 'parent' ? 'p1' : null);
    session.email.set(email);
    const fixture = TestBed.createComponent(ConnectEmail);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const type = (fixture: { nativeElement: unknown }, name: string, value: string) => {
    const input = root(fixture).querySelector(`input[name="${name}"]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const button = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll('button')].find((item) => item.textContent?.includes(label)) as HTMLButtonElement;
  const refresh = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it.each<Role>(['trainer', 'physio', 'scout'])('zeigt %s nichts', async (role) => {
    const fixture = await render(role, null);
    expect(root(fixture).textContent?.trim()).toBe('');
  });

  it('bietet einem reinen Code-Zugang das Verbinden an und verbindet E-Mail und Passwort', async () => {
    const fixture = await render('player');
    expect(root(fixture).textContent).toContain('Zugang mit E-Mail sichern');
    button(fixture, 'Mit E-Mail verbinden').click();
    await refresh(fixture);
    type(fixture, 'connectEmail', 'kind@familie.de');
    type(fixture, 'connectPassword', good);
    type(fixture, 'connectRepeat', good);
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(async () => {
      await refresh(fixture);
      expect(root(fixture).textContent).toContain('Angemeldet mit kind@familie.de');
    });
    expect(firebase.calls).toContain(`link:anon-1:kind@familie.de:${good}`);
    expect(root(fixture).querySelector('form')).toBeNull();
  });

  it('zeigt Fehler beim Verbinden an und bleibt im Formular', async () => {
    const fixture = await render('parent');
    firebase.auth.linkError = { code: 'auth/email-already-in-use' };
    button(fixture, 'Mit E-Mail verbinden').click();
    await refresh(fixture);
    type(fixture, 'connectEmail', 'kind@familie.de');
    type(fixture, 'connectPassword', good);
    type(fixture, 'connectRepeat', good);
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(async () => {
      await refresh(fixture);
      expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('bereits verwendet');
    });
    expect(root(fixture).querySelector('form')).not.toBeNull();
  });

  it('zeigt den Hinweis einer Registrierung, bei der das Verbinden scheiterte', async () => {
    const fixture = await render('player');
    TestBed.inject(AuthService).notice.set('Dein Zugang ist angelegt, aber die E-Mail-Adresse konnte nicht verbunden werden.');
    await refresh(fixture);
    expect(root(fixture).querySelector('[role="alert"]')?.textContent).toContain('konnte nicht verbunden werden');
  });

  it('zeigt einem verbundenen Spieler-Konto nur die E-Mail', async () => {
    const fixture = await render('player', 'kind@familie.de');
    expect(root(fixture).textContent).toContain('Angemeldet mit kind@familie.de');
    expect(button(fixture, 'Mit E-Mail verbinden')).toBeUndefined();
  });
});
