import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CurrentTeam, LAST_TEAM_KEY } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Login } from './login';

/** Einladungslink mit Team (?team=…&code=…, SCRUM-181): ein Build für alle Teams. */
describe('Login – Einladungslink mit Team', () => {
  let firebase: FakeFirebase;

  async function render(query: Record<string, string>) {
    localStorage.removeItem(LAST_TEAM_KEY);
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }],
    }).compileComponents();
    TestBed.inject(AuthService).start(0);
    firebase.auth.emit(null);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(Login);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  afterEach(() => vi.restoreAllMocks());

  it('füllt den Code ein und löst ihn im Team aus dem Link ein', async () => {
    const fixture = await render({ team: 'U17', code: 'c0de' });
    expect(root(fixture).querySelector('h3')?.textContent).toBe('Spieler- oder Elternzugang');
    firebase.access.invites.set('c0de', { role: 'player', playerId: 'p1', expiresAt: null });
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.calls).toContain('claim:c0de'));
    expect(TestBed.inject(CurrentTeam).id()).toBe('U17');
    await vi.waitFor(() => expect(TestBed.inject(AuthService).status()).toBe('ready'));
    expect(TestBed.inject(CurrentTeam).id()).toBe('U17');
  });

  it('ignoriert ein Team mit unzulässigen Zeichen', async () => {
    const fixture = await render({ team: '../x', code: 'c0de' });
    firebase.access.invites.set('c0de', { role: 'player', playerId: 'p1', expiresAt: null });
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.calls).toContain('claim:c0de'));
    expect(TestBed.inject(CurrentTeam).id()).toBe(TestBed.inject(CurrentTeam).fallbackId);
  });

  it('verlinkt die Registrierung mit Einladungscode', async () => {
    const fixture = await render({});
    expect(root(fixture).querySelector('a[href="/registrieren"]')?.textContent).toContain('registrieren');
  });
});
