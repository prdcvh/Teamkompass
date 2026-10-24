import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { teamChoiceGuard } from '../../core/auth/auth.guard';
import { CurrentTeam, LAST_TEAM_KEY } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { RELOAD, TeamChoice } from './team-choice';

describe('TeamChoice (Teamauswahl)', () => {
  let firebase: FakeFirebase;

  async function render(remembered: string | null = null) {
    localStorage.removeItem(LAST_TEAM_KEY);
    if (remembered) localStorage.setItem(LAST_TEAM_KEY, remembered);
    firebase = new FakeFirebase();
    firebase.teams.memberships.set('uid-1', [
      { teamId: 'A', role: 'trainer', playerId: null, expiresAt: null },
      { teamId: 'B', role: 'parent', playerId: 'p1', expiresAt: null },
    ]);
    firebase.teams.metas.set('A', { name: 'SV Muster U11', label: 'U11', clubId: 'c1', clubName: 'SV Muster', logoUrl: null });
    firebase.teams.metas.set('B', { name: 'FC Beispiel U15', label: 'U15', clubId: 'c2', clubName: 'FC Beispiel', logoUrl: null });
    await TestBed.configureTestingModule({ imports: [TeamChoice], providers: [provideRouter([]), ...provideFakeFirebase(firebase)] }).compileComponents();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const auth = TestBed.inject(AuthService);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    const fixture = TestBed.createComponent(TeamChoice);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('FC Beispiel U15');
    });
    return fixture;
  }

  afterEach(() => vi.restoreAllMocks());

  it('listet alle Teams mit Verein und Rolle; Wahl öffnet das Team mit der Rolle dort', async () => {
    const fixture = await render();
    const auth = TestBed.inject(AuthService);
    expect(auth.status()).toBe('chooseTeam');
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('SV Muster · Trainer');
    // Bestehende Eltern-Zugänge erscheinen seit SCRUM-114 als Spieler-Zugang.
    expect(items[1].textContent).toContain('FC Beispiel · Spieler');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    items[1].click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/ansicht'));
    expect(TestBed.inject(CurrentTeam).id()).toBe('B');
  });

  it('„Team wechseln“ später: merkt die Wahl und lädt die App neu (keine Daten des alten Teams im Speicher)', async () => {
    const fixture = await render('A');
    expect(TestBed.inject(AuthService).status()).toBe('ready');
    const reload = vi.spyOn(RELOAD, 'to').mockImplementation(() => undefined);
    const items = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.item');
    expect(items[0].textContent).toContain('geöffnet');
    items[1].click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem(LAST_TEAM_KEY)).toBe('B');
    expect(TestBed.inject(CurrentTeam).id()).toBe('A');
  });

  it('Guard: ohne Anmeldung zur Anmeldung, mit nur einem Team zur Startseite', async () => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase)] });
    const auth = TestBed.inject(AuthService);
    auth.start(0);
    firebase.auth.emit(null);
    const router = TestBed.inject(Router);
    const run = () => TestBed.runInInjectionContext(() => teamChoiceGuard({} as never, {} as never)) as Promise<unknown>;
    expect(router.serializeUrl((await run()) as never)).toBe('/anmelden');
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    await auth.signInTrainer('coach@verein.de', 'x');
    expect(router.serializeUrl((await run()) as never)).toBe('/');
  });
});
