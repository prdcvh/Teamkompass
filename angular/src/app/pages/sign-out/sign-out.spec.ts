import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { NOTHING_UNSENT, type UnsentChanges, UnsentChangesService } from '../../core/auth/unsent-changes.service';
import { SignOut, unsentHeadline } from './sign-out';

describe('SignOut (Abmelden)', () => {
  let signOut: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(role: Role | null, email: string | null = null, unsent: UnsentChanges = NOTHING_UNSENT) {
    signOut = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { signOut } },
        { provide: UnsentChangesService, useValue: { check: vi.fn().mockResolvedValue(unsent) } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(SessionService).email.set(email);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SignOut);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).textContent).not.toContain('Prüfe, ob alles gespeichert ist');
    });
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const button = (fixture: { nativeElement: unknown }, label: string) =>
    [...root(fixture).querySelectorAll('button')].find((item) => item.textContent?.includes(label)) as HTMLButtonElement;

  it.each<Role>(['trainer', 'physio'])('meldet %s sofort ab', async (role) => {
    await render(role);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/anmelden'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it.each<Role>(['player', 'parent'])('warnt %s vor dem Verlust des Zugangs und meldet erst nach Bestätigung ab', async (role) => {
    const fixture = await render(role);
    expect(root(fixture).textContent).toContain('neuen Einladungscode');
    expect(signOut).not.toHaveBeenCalled();
    button(fixture, 'Abmelden').click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/anmelden'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('bleibt angemeldet, wenn der Spieler abbricht, und geht zurück zu seiner Ansicht', async () => {
    const fixture = await render('player');
    button(fixture, 'Angemeldet bleiben').click();
    expect(signOut).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/ansicht');
  });

  it('meldet einen mit E-Mail verbundenen Spieler-Zugang ohne Warnung ab (SCRUM-114)', async () => {
    await render('player', 'kind@familie.de');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/anmelden'));
    expect(signOut).toHaveBeenCalledOnce();
  });

  describe('noch nicht gesendete Änderungen (SCRUM-220)', () => {
    it('warnt den Trainer mit der Zahl der Änderungen und meldet nicht ab', async () => {
      const fixture = await render('trainer', 'trainer@verein.de', { live: 3, waiting: true });
      expect(root(fixture).textContent).toContain('3 Änderungen sind noch nicht gespeichert – erst wieder Netz abwarten?');
      expect(root(fixture).textContent).toContain('gehen dann verloren');
      expect(signOut).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('„Warten“ lässt angemeldet und führt zurück zur Startseite', async () => {
      const fixture = await render('trainer', 'trainer@verein.de', { live: 1, waiting: false });
      button(fixture, 'Warten').click();
      expect(signOut).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('„Trotzdem abmelden“ meldet genau einmal ab, auch bei Doppel-Tippen', async () => {
      const fixture = await render('trainer', 'trainer@verein.de', { live: 2, waiting: true });
      const leave = button(fixture, 'Trotzdem abmelden (Änderungen gehen verloren)');
      leave.click();
      leave.click();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/anmelden'));
      expect(signOut).toHaveBeenCalledOnce();
    });

    it('warnt auch, wenn nur andere Eingaben (z. B. Bewertungen) noch warten', async () => {
      const fixture = await render('physio', 'medizin@verein.de', { live: 0, waiting: true });
      expect(root(fixture).textContent).toContain('Einige Änderungen sind noch nicht gespeichert');
      expect(signOut).not.toHaveBeenCalled();
    });

    it('nennt Spielern ohne E-Mail zusätzlich den verlorenen Zugang', async () => {
      const fixture = await render('player', null, { live: 0, waiting: true });
      expect(root(fixture).textContent).toContain('noch nicht gespeichert');
      expect(root(fixture).textContent).toContain('neuen Einladungscode');
      button(fixture, 'Warten').click();
      expect(navigate).toHaveBeenCalledWith('/ansicht');
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  it('Überschrift: Einzahl, Mehrzahl, ohne Zahl', () => {
    expect(unsentHeadline({ live: 1, waiting: true })).toBe('1 Änderung ist noch nicht gespeichert – erst wieder Netz abwarten?');
    expect(unsentHeadline({ live: 4, waiting: false })).toBe('4 Änderungen sind noch nicht gespeichert – erst wieder Netz abwarten?');
    expect(unsentHeadline({ live: 0, waiting: true })).toBe('Einige Änderungen sind noch nicht gespeichert – erst wieder Netz abwarten?');
  });
});
