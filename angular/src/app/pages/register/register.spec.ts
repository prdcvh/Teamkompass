import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LAST_TEAM_KEY } from '../../core/team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Register } from './register';

describe('Register (Seite)', () => {
  let firebase: FakeFirebase;

  async function render(query: Record<string, string> = {}) {
    localStorage.removeItem(LAST_TEAM_KEY);
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    const auth = TestBed.inject(AuthService);
    auth.start(0);
    firebase.auth.emit(null);
    await auth.whenResolved();
    const fixture = TestBed.createComponent(Register);
    await fixture.whenStable();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;

  function type(fixture: { nativeElement: unknown }, name: string, value: string): void {
    const input = root(fixture).querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('übernimmt den Code aus dem Link und zeigt die Passwortregel', async () => {
    const fixture = await render({ code: 'abcdefghjklmnpqr' });
    expect(root(fixture).querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe('ABCD-EFGH-JKLM-NPQR');
    expect(root(fixture).textContent).toContain('Mindestens 12 Zeichen');
    expect(root(fixture).querySelector('input[name="repeat"]')).not.toBeNull();
  });

  it('Rücksprung aus der Bestätigungsmail (?weiter=1): Anmelden statt neues Konto', async () => {
    const fixture = await render({ code: 'ABCDEFGHJKLMNPQR', weiter: '1' });
    expect(root(fixture).querySelector('input[name="repeat"]')).toBeNull();
    expect(root(fixture).querySelector('button[type="submit"]')?.textContent).toContain('Anmelden und weitermachen');
  });

  it('zeigt Fehler direkt am Feld', async () => {
    const fixture = await render();
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(root(fixture).querySelectorAll('.field .error').length).toBeGreaterThanOrEqual(2);
    expect(firebase.registration.calls).toEqual([]);
  });

  it('kompletter Weg: Konto → Bestätigung → Verein und Team → Einstieg', async () => {
    const fixture = await render({ code: 'ABCDEFGHJKLMNPQR' });
    firebase.registration.invites.set('ABCDEFGHJKLMNPQR', {
      code: 'ABCDEFGHJKLMNPQR',
      kind: 'club',
      clubId: 'Club0000000000000001',
      teamId: 'Team0000000000000001',
      expiresAt: new Date(Date.now() + 86_400_000),
      email: null,
    });
    firebase.teams.memberships.set('new-coach', [{ teamId: 'Team0000000000000001', role: 'trainer', playerId: null, expiresAt: null }]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    type(fixture, 'email', 'neu@verein.de');
    type(fixture, 'password', 'Sicher12345678');
    type(fixture, 'repeat', 'Sicher12345678');
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(root(fixture).textContent).toContain('neu@verein.de'));
    expect(root(fixture).querySelector('h1')?.textContent).toContain('E-Mail bestätigen');

    firebase.registration.verified = true;
    (root(fixture).querySelector('.verify button') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('input[name="clubName"]')).not.toBeNull();
    });
    type(fixture, 'clubName', 'SV Muster');
    const select = root(fixture).querySelector<HTMLSelectElement>('select[name="ageGroup"]')!;
    select.value = 'U11';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root(fixture).querySelector<HTMLInputElement>('input[name="teamName"]')?.value).toBe('SV Muster U11');
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/willkommen'));
    const writes = firebase.registration.committed[0];
    expect(writes.find((write) => write.path[0] === 'clubs' && write.path.length === 2)?.data?.['name']).toBe('SV Muster');
    expect(writes.find((write) => write.path.length === 2 && write.path[0] === 'teams')?.data?.['name']).toBe('SV Muster U11');
  });
});
