import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Access } from './access';

describe('Access (Spieler-Zugänge)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Anna Beispiel', positions: ['ZM'], number: 8, birthdate: '2012-03-12', status: 'Fit' });
    firebase.players.set('p2', { name: 'Ben Widerruf', positions: ['ST'], number: 9, birthdate: '2012-05-01', status: 'Fit', consentStatus: 'revoked' });
    firebase.memberDocs.set('u1', { role: 'player', playerId: 'p1', expiresAt: { toDate: () => new Date('2020-01-01T00:00:00Z') } });
    firebase.memberDocs.set('u2', { role: 'medical', email: 'arzt@verein.de' });
    firebase.memberDocs.set('u3', { role: 'trainer', email: 'coach@verein.de' });
    firebase.inviteDocs.set('abcdef0123456789abcdef0123456789abcdef0123456789', { role: 'parent', playerId: 'p2', expiresAt: null });
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Access);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.list, .notice, .empty, p.muted:not([role="status"])')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const fill = (input: HTMLInputElement | HTMLSelectElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };
  const openInvite = async (fixture: Awaited<ReturnType<typeof render>>) => {
    q<HTMLButtonElement>(fixture, '.head button')!.click();
    await flush(fixture);
    return q<HTMLElement>(fixture, 'tk-invite-dialog')!;
  };

  it('listet Einladungen und Zugänge ohne Trainer-Konten und ohne den vollen Code', async () => {
    const fixture = await render();
    const rows = qa(fixture, 'article.row').map(text);
    expect(rows).toHaveLength(3);
    expect(text(q(fixture, '.meta'))).toBe('3 Zugänge');
    expect(rows[0]).toContain('Ben Widerruf');
    expect(rows[0]).toContain('Eltern · Einladung offen');
    expect(rows[0]).toContain('Code …456789');
    expect(rows[0]).toContain('Unbegrenzt gültig');
    expect(rows.some((row) => row.includes('Anna Beispiel') && row.includes('Abgelaufen seit 01.01.2020'))).toBe(true);
    expect(rows.some((row) => row.includes('arzt@verein.de') && row.includes('Medizin (nur lesen)'))).toBe(true);
    expect(text(root(fixture))).not.toContain('coach@verein.de');
    expect(text(root(fixture))).not.toContain('abcdef0123456789abcdef0123456789');
  });

  it('zeigt Nicht-Trainern nur einen Hinweis und lädt nichts', async () => {
    const fixture = await render('medical');
    expect(text(root(fixture))).toContain('nur Trainer');
    expect(firebase.calls).not.toContain('readMembers');
    expect(q(fixture, 'tk-invite-dialog')).toBeNull();
  });

  it('erzeugt einen Code, zeigt ihn einmalig und verwirft ihn beim Schließen', async () => {
    const fixture = await render();
    const dialog = await openInvite(fixture);
    expect(text(dialog.querySelector('h2'))).toBe('Zugang erzeugen');
    fill(dialog.querySelector<HTMLSelectElement>('select[name="player"]')!, 'p1', 'change');
    fill(dialog.querySelector<HTMLSelectElement>('select[name="role"]')!, 'parent', 'change');
    fill(dialog.querySelector<HTMLInputElement>('input[name="days"]')!, '14');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.inviteDocs.values()].some((invite) => invite['playerId'] === 'p1')).toBe(true));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(dialog.querySelector('[data-testid="invite-code"]')).not.toBeNull();
    });
    const code = text(dialog.querySelector('[data-testid="invite-code"]'));
    expect(code).toMatch(/^[0-9a-f]{48}$/);
    expect(firebase.inviteDocs.get(code)).toMatchObject({ playerId: 'p1', role: 'parent' });
    expect(text(dialog)).toContain('läuft am');
    expect(text(q(fixture, '.meta'))).toBe('4 Zugänge');

    dialog.querySelector<HTMLButtonElement>('menu button:last-child')!.click(); // Fertig
    await flush(fixture);
    expect(text(root(fixture))).not.toContain(code);
  });

  it('verlangt einen Spieler und eine gültige Befristung', async () => {
    const fixture = await render();
    const dialog = await openInvite(fixture);
    fill(dialog.querySelector<HTMLInputElement>('input[name="days"]')!, 'abc');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(text(dialog)).toContain('Bitte einen Spieler auswählen.');
    expect(text(dialog)).toContain('ganze Zahl von 1 bis 365');
    expect(firebase.calls.some((call) => call.startsWith('createInvite'))).toBe(false);
  });

  it('warnt bei widerrufener Einwilligung, blockiert aber nicht (SCRUM-51)', async () => {
    const fixture = await render();
    const dialog = await openInvite(fixture);
    expect(dialog.querySelector('.consent-warning')).toBeNull();
    fill(dialog.querySelector<HTMLSelectElement>('select[name="player"]')!, 'p2', 'change');
    await flush(fixture);
    expect(text(dialog.querySelector('.consent-warning'))).toContain('Die Datennutzung für Ben Widerruf wurde widerrufen.');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.calls.some((call) => call.startsWith('createInvite'))).toBe(true));
  });

  it('meldet einen Fehler beim Erzeugen und zeigt keinen Code', async () => {
    const fixture = await render();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.createInviteError = { code: 'permission-denied' };
    const dialog = await openInvite(fixture);
    fill(dialog.querySelector<HTMLSelectElement>('select[name="player"]')!, 'p1', 'change');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(dialog)).toContain('konnte nicht erstellt werden');
    });
    expect(dialog.querySelector('[data-testid="invite-code"]')).toBeNull();
  });

  it('sperrt einen Zugang erst nach Bestätigung', async () => {
    const fixture = await render();
    const rowOf = (name: string) => qa<HTMLElement>(fixture, 'article.row').find((row) => text(row).includes(name))!;
    rowOf('arzt@verein.de').querySelector<HTMLButtonElement>('button')!.click();
    await flush(fixture);
    expect(qa(fixture, 'tk-dialog h2').map(text)).toContain('Zugang sperren?');
    expect(firebase.memberDocs.has('u2')).toBe(true);
    qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Sperren')!.click();
    await vi.waitFor(() => expect(firebase.memberDocs.has('u2')).toBe(false));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.meta'))).toBe('2 Zugänge');
    });
  });

  it('zieht einen offenen Code zurück und meldet Fehler im Dialog', async () => {
    const fixture = await render();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invite = qa<HTMLElement>(fixture, 'article.row').find((row) => text(row).includes('Einladung offen'))!;
    expect(text(invite.querySelector('button'))).toBe('Code zurückziehen');
    firebase.deleteAccessError = { code: 'unavailable' };
    invite.querySelector<HTMLButtonElement>('button')!.click();
    await flush(fixture);
    const confirm = () => qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Zurückziehen')!;
    confirm().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, 'tk-dialog .error')).not.toBeNull();
    });
    expect(firebase.inviteDocs.size).toBe(1);
    firebase.deleteAccessError = null;
    confirm().click();
    await vi.waitFor(() => expect(firebase.inviteDocs.size).toBe(0));
  });

  it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
    isMobile.set(false);
    firebase = new FakeFirebase();
    firebase.readAccessError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Access);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).not.toBeNull();
    });
    firebase.readAccessError = null;
    q<HTMLButtonElement>(fixture, '.notice button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).toBeNull();
    });
  });

  it('zeigt am Handy den Schnellzugriff statt des Kopf-Buttons', async () => {
    const fixture = await render('trainer', true);
    expect(q(fixture, '.head button')).toBeNull();
    expect(q(fixture, '.fab')).not.toBeNull();
  });
});
