import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { FirebaseService } from '../../core/firebase.service';
import { FakeFirebase } from '../../core/testing';
import { Login } from './login';

describe('Login', () => {
  let firebase: FakeFirebase;

  async function render() {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: FirebaseService, useValue: firebase }],
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
    firebase.members.set('uid-1', { role: 'trainer', playerId: null });
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
});
