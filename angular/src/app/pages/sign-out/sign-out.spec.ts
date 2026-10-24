import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { SignOut } from './sign-out';

describe('SignOut (Abmelden)', () => {
  let signOut: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(role: Role | null, email: string | null = null) {
    signOut = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { signOut } }],
    });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(SessionService).email.set(email);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SignOut);
    await fixture.whenStable();
    fixture.detectChanges();
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
});
