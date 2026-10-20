import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { StaffAccount } from './staff-account';

describe('StaffAccount (Trainer-Konto, Scout- und Medizin-Zugang)', () => {
  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'scout' | 'physio', session: 'trainer' | 'physio' = 'trainer') {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { role } } } },
      ],
    });
    TestBed.inject(SessionService).role.set(session);
    const fixture = TestBed.createComponent(StaffAccount);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const fill = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }, name: string, value: string) => {
    const input = (fixture as unknown as { nativeElement: HTMLElement }).nativeElement.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const submit = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown>; nativeElement: unknown }) => {
    q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('zeigt je Route den passenden Titel und maskiert die Passwortfelder', async () => {
    let fixture = await render('trainer');
    expect(text(q(fixture, 'h1'))).toBe('Trainer-Konto anlegen');
    expect(q<HTMLInputElement>(fixture, 'input[name="password"]')!.type).toBe('password');
    expect(q<HTMLInputElement>(fixture, 'input[name="password"]')!.autocomplete).toBe('new-password');
    expect(q<HTMLInputElement>(fixture, 'input[name="repeat"]')!.type).toBe('password');
    TestBed.resetTestingModule();
    fixture = await render('scout');
    expect(text(q(fixture, 'h1'))).toBe('Scout-Zugang');
    expect(text(root(fixture))).toContain('Keine Verletzungen, Abwesenheitsgründe, Messwerte oder Notizen');
    TestBed.resetTestingModule();
    fixture = await render('physio');
    expect(text(q(fixture, 'h1'))).toBe('Medizin-Zugang');
    expect(text(root(fixture))).toContain('Status, Abwesenheiten, Verletzungen und Messwerte');
  });

  it('zeigt Nicht-Trainern kein Formular', async () => {
    const fixture = await render('trainer', 'physio');
    expect(q(fixture, 'form')).toBeNull();
    expect(text(root(fixture))).toContain('nur Trainer');
  });

  it('lehnt zu kurze Passwörter und Abweichungen ab, ohne ein Konto anzulegen', async () => {
    const fixture = await render('trainer');
    await fill(fixture, 'email', 'neu@verein.de');
    await fill(fixture, 'password', 'Abcdefgh12');
    await fill(fixture, 'repeat', 'Abcdefgh12');
    await submit(fixture);
    expect(text(root(fixture))).toContain('mindestens 12 Zeichen');
    await fill(fixture, 'password', 'LangGenug123');
    await fill(fixture, 'repeat', 'LangGenug124');
    await submit(fixture);
    expect(text(root(fixture))).toContain('stimmen nicht überein');
    expect(firebase.calls.some((call) => call.startsWith('createStaff'))).toBe(false);
  });

  it('legt das Konto an, meldet Erfolg und leert die Passwörter', async () => {
    const fixture = await render('physio');
    await fill(fixture, 'email', ' arzt@verein.de ');
    await fill(fixture, 'password', 'LangGenug123');
    await fill(fixture, 'repeat', 'LangGenug123');
    await submit(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.success'))).toBe('Der Medizin-Zugang für arzt@verein.de wurde angelegt.');
    });
    expect(firebase.calls).toContain('createStaff:physio:arzt@verein.de');
    expect(firebase.access.lastStaffPassword).toBe('LangGenug123');
    expect(q<HTMLInputElement>(fixture, 'input[name="password"]')!.value).toBe('');
    expect(q<HTMLInputElement>(fixture, 'input[name="repeat"]')!.value).toBe('');
    expect(q<HTMLInputElement>(fixture, 'input[name="email"]')!.value).toBe('');
  });

  it('legt einen Scout-Zugang mit der Rolle „scout“ an (SCRUM-170)', async () => {
    const fixture = await render('scout');
    await fill(fixture, 'email', 'scout@verein.de');
    await fill(fixture, 'password', 'LangGenug123');
    await fill(fixture, 'repeat', 'LangGenug123');
    await submit(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.success'))).toBe('Der Scout-Zugang für scout@verein.de wurde angelegt.');
    });
    expect(firebase.calls).toContain('createStaff:scout:scout@verein.de');
    expect(firebase.access.memberDocs.get('staff-uid-1')).toMatchObject({ role: 'scout' });
  });

  it('meldet Firebase-Fehler verständlich und behält die Eingabe', async () => {
    const fixture = await render('trainer');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.access.createStaffError = { code: 'auth/email-already-in-use' };
    await fill(fixture, 'email', 'da@verein.de');
    await fill(fixture, 'password', 'LangGenug123');
    await fill(fixture, 'repeat', 'LangGenug123');
    await submit(fixture);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.error[role="alert"]'))).toBe('Das Trainer-Konto konnte nicht angelegt werden. Diese E-Mail wird bereits verwendet.');
    });
    expect(q<HTMLInputElement>(fixture, 'input[name="email"]')!.value).toBe('da@verein.de');
    expect(q(fixture, '.success')).toBeNull();
  });
});
