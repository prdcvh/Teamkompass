import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Access } from './access';

describe('Access (Zugänge: Spieler, Scouts und Medizin)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(role: 'trainer' | 'physio' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Anna Beispiel', positions: ['ZM'], number: 8, birthdate: '2012-03-12', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ben Widerruf', positions: ['ST'], number: 9, birthdate: '2012-05-01', status: 'Fit', consentStatus: 'revoked' });
    firebase.access.memberDocs.set('u1', { role: 'player', playerId: 'p1', expiresAt: { toDate: () => new Date('2020-01-01T00:00:00Z') } });
    // Bisheriger Scout-Zugang mit der alten Kennung „medical“ (wird seit SCRUM-170 als Scout geführt).
    firebase.access.memberDocs.set('u2', { role: 'medical', email: 'scout@verein.de' });
    firebase.access.memberDocs.set('u4', { role: 'physio', email: 'arzt@verein.de' });
    firebase.access.memberDocs.set('u3', { role: 'trainer', email: 'coach@verein.de' });
    firebase.access.inviteDocs.set('abcdef0123456789abcdef0123456789abcdef0123456789', { role: 'parent', playerId: 'p2', expiresAt: null });
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }] });
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

  const openScouts = async (fixture: Awaited<ReturnType<typeof render>>) => {
    q<HTMLButtonElement>(fixture, '#access-tab-scouts')!.click();
    await flush(fixture);
  };
  const openPhysios = async (fixture: Awaited<ReturnType<typeof render>>) => {
    q<HTMLButtonElement>(fixture, '#access-tab-physios')!.click();
    await flush(fixture);
  };

  it('listet Einladungen und Zugänge ohne Trainer-Konten und ohne den vollen Code', async () => {
    const fixture = await render();
    const rows = qa(fixture, 'article.row').map(text);
    expect(rows).toHaveLength(2);
    expect(text(q(fixture, '.meta'))).toBe('2 Zugänge');
    expect(rows[0]).toContain('Ben Widerruf');
    expect(rows[0]).toContain('Spieler (bisher Eltern-Zugang) · Einladung offen');
    expect(rows[0]).toContain('Code …456789');
    expect(rows[0]).toContain('Unbegrenzt gültig');
    expect(rows.some((row) => row.includes('Anna Beispiel') && row.includes('Abgelaufen seit 01.01.2020'))).toBe(true);
    expect(rows.some((row) => row.includes('arzt@verein.de') || row.includes('scout@verein.de'))).toBe(false);
    expect(text(q(fixture, '#access-tab-players'))).toBe('Spieler (2)');
    expect(text(q(fixture, '#access-tab-scouts'))).toBe('Scouts (1)');
    expect(text(q(fixture, '#access-tab-physios'))).toBe('Medizin (1)');
    await openScouts(fixture);
    const scouts = qa(fixture, 'article.row').map(text);
    expect(scouts).toHaveLength(1);
    expect(scouts[0]).toContain('scout@verein.de');
    expect(scouts[0]).toContain('Scout (Leistungsdaten, keine Gesundheitsdaten)');
    expect(text(q(fixture, '.meta'))).toBe('1 Zugang');
    await openPhysios(fixture);
    const physios = qa(fixture, 'article.row').map(text);
    expect(physios).toHaveLength(1);
    expect(physios[0]).toContain('arzt@verein.de');
    expect(physios[0]).toContain('Medizin (Status, Abwesenheiten, Verletzungen, Messwerte)');
    expect(text(root(fixture))).not.toContain('coach@verein.de');
    expect(text(root(fixture))).not.toContain('abcdef0123456789abcdef0123456789');
  });

  it('zeigt Nicht-Trainern nur einen Hinweis und lädt nichts', async () => {
    const fixture = await render('physio');
    expect(text(root(fixture))).toContain('nur Trainer');
    expect(firebase.calls).not.toContain('readMembers');
    expect(q(fixture, 'tk-invite-dialog')).toBeNull();
  });

  it('erzeugt einen Code, zeigt ihn einmalig und verwirft ihn beim Schließen', async () => {
    const fixture = await render();
    const dialog = await openInvite(fixture);
    expect(text(dialog.querySelector('h2'))).toBe('Zugang erzeugen');
    fill(dialog.querySelector<HTMLSelectElement>('select[name="player"]')!, 'p1', 'change');
    // Seit SCRUM-114 keine Wahl Spieler/Eltern mehr.
    expect(dialog.querySelector('select[name="role"]')).toBeNull();
    fill(dialog.querySelector<HTMLInputElement>('input[name="days"]')!, '14');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.access.inviteDocs.values()].some((invite) => invite['playerId'] === 'p1')).toBe(true));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(dialog.querySelector('[data-testid="invite-code"]')).not.toBeNull();
    });
    const code = text(dialog.querySelector('[data-testid="invite-code"]'));
    expect(code).toMatch(/^[0-9a-f]{48}$/);
    expect(firebase.access.inviteDocs.get(code)).toMatchObject({ playerId: 'p1', role: 'player' });
    expect(text(dialog)).toContain('läuft am');
    expect(text(q(fixture, '.meta'))).toBe('3 Zugänge');

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
    firebase.access.createInviteError = { code: 'permission-denied' };
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
    await openScouts(fixture);
    rowOf('scout@verein.de').querySelector<HTMLButtonElement>('button')!.click();
    await flush(fixture);
    expect(qa(fixture, 'tk-dialog h2').map(text)).toContain('Zugang sperren?');
    expect(qa(fixture, 'tk-dialog').map(text).join(' ')).toContain('verliert sofort den Zugriff');
    expect(firebase.access.memberDocs.has('u2')).toBe(true);
    qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Sperren')!.click();
    await vi.waitFor(() => expect(firebase.access.memberDocs.has('u2')).toBe(false));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(q(fixture, '.meta'))).toBe('0 Zugänge');
    });
    expect(text(q(fixture, '#access-tab-players'))).toBe('Spieler (2)');
  });

  it('zieht einen offenen Code zurück und meldet Fehler im Dialog', async () => {
    const fixture = await render();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invite = qa<HTMLElement>(fixture, 'article.row').find((row) => text(row).includes('Einladung offen'))!;
    expect(text(invite.querySelector('button'))).toBe('Code zurückziehen');
    firebase.access.deleteAccessError = { code: 'unavailable' };
    invite.querySelector<HTMLButtonElement>('button')!.click();
    await flush(fixture);
    const confirm = () => qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Zurückziehen')!;
    confirm().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, 'tk-dialog .error')).not.toBeNull();
    });
    expect(firebase.access.inviteDocs.size).toBe(1);
    firebase.access.deleteAccessError = null;
    confirm().click();
    await vi.waitFor(() => expect(firebase.access.inviteDocs.size).toBe(0));
  });

  it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
    isMobile.set(false);
    firebase = new FakeFirebase();
    firebase.access.readAccessError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Access);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).not.toBeNull();
    });
    firebase.access.readAccessError = null;
    q<HTMLButtonElement>(fixture, '.notice button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.notice')).toBeNull();
    });
  });

  it('zeigt am Handy den Schnellzugriff statt des Kopf-Buttons', async () => {
    const fixture = await render('trainer', true);
    expect(q(fixture, '.head button')).toBeNull();
    expect(q(fixture, 'button.fab')).not.toBeNull();
  });

  it('führt im Reiter Scouts zum Anlegen eines Scout-Zugangs statt zu Einladungscodes', async () => {
    const fixture = await render();
    await openScouts(fixture);
    expect(q(fixture, '#access-tab-scouts')!.getAttribute('aria-selected')).toBe('true');
    expect(q(fixture, '.head button')).toBeNull();
    expect(q<HTMLAnchorElement>(fixture, '.head a')!.getAttribute('href')).toBe('/scout-zugang');
    expect(text(q(fixture, '.head a'))).toBe('+ Scout-Zugang anlegen');
  });

  it('führt im Reiter Medizin zum Anlegen eines Medizin-Zugangs (SCRUM-170)', async () => {
    const fixture = await render();
    await openPhysios(fixture);
    expect(q(fixture, '#access-tab-physios')!.getAttribute('aria-selected')).toBe('true');
    expect(q<HTMLAnchorElement>(fixture, '.head a')!.getAttribute('href')).toBe('/medizin-zugang');
    expect(text(q(fixture, '.head a'))).toBe('+ Medizin-Zugang anlegen');
    expect(text(root(fixture))).toContain('Status, Abwesenheiten, Verletzungen und Messwerte');
    firebase.access.memberDocs.delete('u4');
    await (fixture.componentInstance as unknown as { access: { reload(): Promise<void> } }).access.reload();
    await flush(fixture);
    expect(text(q(fixture, '.empty'))).toContain('Noch kein Medizin-Zugang angelegt.');
  });

  it('wechselt die Reiter auch mit den Pfeiltasten', async () => {
    const fixture = await render();
    q(fixture, '#access-tab-players')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await flush(fixture);
    expect(q(fixture, '#access-tab-scouts')!.getAttribute('aria-selected')).toBe('true');
    q(fixture, '#access-tab-scouts')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await flush(fixture);
    expect(q(fixture, '#access-tab-physios')!.getAttribute('aria-selected')).toBe('true');
    q(fixture, '#access-tab-physios')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await flush(fixture);
    expect(q(fixture, '#access-tab-players')!.getAttribute('aria-selected')).toBe('true');
    q(fixture, '#access-tab-players')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await flush(fixture);
    expect(q(fixture, '#access-tab-physios')!.getAttribute('aria-selected')).toBe('true');
  });

  it('zeigt im leeren Reiter einen Hinweis mit passendem Button', async () => {
    const fixture = await render();
    firebase.access.memberDocs.delete('u2');
    await openScouts(fixture);
    q<HTMLButtonElement>(fixture, '#access-tab-players')!.click();
    await flush(fixture);
    expect(text(q(fixture, '.list'))).toContain('Anna Beispiel');
    firebase.access.memberDocs.clear();
    firebase.access.inviteDocs.clear();
    await (fixture.componentInstance as unknown as { access: { reload(): Promise<void> } }).access.reload();
    await openScouts(fixture);
    expect(text(q(fixture, '.empty'))).toContain('Noch kein Scout-Zugang angelegt.');
  });

  it('verknüpft das Tabpanel in befüllten und leeren Zuständen beider Reiter mit dem aktiven Reiter (SCRUM-103)', async () => {
    const fixture = await render();
    const panel = () => q(fixture, '[role="tabpanel"]')!;
    expect(panel().classList.contains('list')).toBe(true);
    expect(panel().getAttribute('aria-labelledby')).toBe('access-tab-players');
    await openScouts(fixture);
    expect(panel().classList.contains('list')).toBe(true);
    expect(panel().getAttribute('aria-labelledby')).toBe('access-tab-scouts');

    firebase.access.memberDocs.clear();
    firebase.access.inviteDocs.clear();
    await (fixture.componentInstance as unknown as { access: { reload(): Promise<void> } }).access.reload();
    await flush(fixture);
    expect(panel().classList.contains('empty')).toBe(true);
    expect(panel().getAttribute('aria-labelledby')).toBe('access-tab-scouts');
    q<HTMLButtonElement>(fixture, '#access-tab-players')!.click();
    await flush(fixture);
    expect(panel().classList.contains('empty')).toBe(true);
    expect(panel().getAttribute('aria-labelledby')).toBe('access-tab-players');
    expect(q(fixture, '#access-tab-players')!.id).toBe('access-tab-players');
  });
});
