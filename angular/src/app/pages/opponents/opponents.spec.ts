import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Opponents } from './opponents';

describe('Opponents (Gegneranalyse)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.opponents.set('o1', {
      name: 'JSG Taunus', formation: '4-3-3', style: 'Pressing', strengths: 'Außen schnell', gamePlan: 'Tief stehen', updatedAt: '2026-10-01',
    });
    firebase.opponents.set('o2', { name: '<img src=x onerror=alert(1)>', formation: '3-2-3', style: 'Ballbesitz', notes: '<b>fett</b>', updatedAt: '2026-09-15' });
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(Opponents);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.search, .notice, .muted[role="status"]:not(.sync)')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const type = (input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('zeigt Gegner alphabetisch mit Spielweise, Formation und Aktualisierungsdatum', async () => {
    const fixture = await render();
    const cards = qa(fixture, 'article.opponent');
    expect(cards).toHaveLength(2);
    expect(text(q(fixture, '.meta'))).toBe('2 Gegner');
    expect(text(cards[1])).toContain('JSG Taunus');
    expect(text(cards[1])).toContain('Pressing');
    expect(text(cards[1])).toContain('Formation 4-3-3');
    expect(text(cards[1])).toContain('aktualisiert 01.10.2026');
    // Details nur, wenn Felder gefüllt sind
    expect([...cards[1].querySelectorAll('details .detail-grid section')].map((section) => `${text(section.querySelector('span'))} ${text(section.querySelector('p'))}`)).toEqual(['Stärken Außen schnell', 'Matchplan Tief stehen']);
  });

  it('gibt alle Texte als Text aus (kein HTML aus Namen oder Notizen)', async () => {
    const fixture = await render();
    expect(root(fixture).querySelector('img')).toBeNull();
    expect(root(fixture).querySelector('article b')).toBeNull();
    expect(text(root(fixture))).toContain('<img src=x onerror=alert(1)>');
    expect(text(root(fixture))).toContain('<b>fett</b>');
  });

  it('sucht nach Name, Formation und Spielweise', async () => {
    const fixture = await render();
    const search = q<HTMLInputElement>(fixture, 'input[type="search"]')!;
    type(search, 'taunus');
    fixture.detectChanges();
    expect(qa(fixture, 'article.opponent')).toHaveLength(1);
    type(search, 'gibtesnicht');
    fixture.detectChanges();
    expect(text(q(fixture, '.empty'))).toContain('Kein Gegner gefunden.');
    q<HTMLButtonElement>(fixture, '.empty button')!.click();
    fixture.detectChanges();
    expect(qa(fixture, 'article.opponent')).toHaveLength(2);
  });

  it('erfasst einen neuen Gegner', async () => {
    const fixture = await render();
    qa<HTMLButtonElement>(fixture, '.head button')[0].click();
    await flush(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-opponent-dialog')!;
    expect(text(dialog.querySelector('h2'))).toBe('Gegner erfassen');
    type(dialog.querySelector<HTMLInputElement>('input[name="name"]')!, '  SV Nord  ');
    type(dialog.querySelector<HTMLSelectElement>('select[name="style"]')!, 'Umschaltspiel', 'change');
    type(dialog.querySelector<HTMLTextAreaElement>('textarea[name="strengths"]')!, 'Konter');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect([...firebase.opponents.values()].some((data) => data['name'] === 'SV Nord')).toBe(true));
    const saved = [...firebase.opponents.values()].find((data) => data['name'] === 'SV Nord')!;
    expect(saved).toMatchObject({ style: 'Umschaltspiel', strengths: 'Konter' });
  });

  it('verlangt einen Namen', async () => {
    const fixture = await render();
    qa<HTMLButtonElement>(fixture, '.head button')[0].click();
    await flush(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-opponent-dialog')!;
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(text(dialog.querySelector('#err-name'))).toBe('Bitte den Namen des Gegners eingeben.');
    expect(dialog.querySelector('input[name="name"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(firebase.calls.some((call) => call.startsWith('saveOpponent'))).toBe(false);
  });

  it('bearbeitet einen Gegner mit vorbelegten Werten', async () => {
    const fixture = await render();
    qa<HTMLButtonElement>(fixture, 'article.opponent .actions button')[2].click(); // JSG Taunus: Bearbeiten
    await flush(fixture);
    const dialog = q<HTMLElement>(fixture, 'tk-opponent-dialog')!;
    expect(text(dialog.querySelector('h2'))).toBe('Gegner bearbeiten');
    expect(dialog.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('JSG Taunus');
    expect(dialog.querySelector<HTMLTextAreaElement>('textarea[name="gamePlan"]')!.value).toBe('Tief stehen');
    type(dialog.querySelector<HTMLInputElement>('input[name="formation"]')!, '4-4-2');
    (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.opponents.get('o1')?.['formation']).toBe('4-4-2'));
    expect(firebase.opponents.size).toBe(2);
  });

  it('löscht nur nach Bestätigung und meldet Fehler', async () => {
    const fixture = await render();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    qa<HTMLButtonElement>(fixture, 'article.opponent .actions button.danger')[1].click(); // JSG Taunus
    await flush(fixture);
    expect(qa(fixture, 'tk-dialog h2').map(text)).toContain('Gegnerprofil löschen?');
    expect(firebase.opponents.has('o1')).toBe(true);
    firebase.deleteOpponentError = { code: 'unavailable' };
    const confirm = () => qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button).includes('löschen'))!;
    confirm().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q(fixture, '.confirm-actions')?.parentElement?.querySelector('[role="alert"]')).not.toBeNull();
    });
    firebase.deleteOpponentError = null;
    confirm().click();
    await vi.waitFor(() => expect(firebase.opponents.has('o1')).toBe(false));
  });

  it('zeigt für Medizin nichts außer einem Hinweis und lädt keine Gegner', async () => {
    isMobile.set(false);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set('medical');
    const fixture = TestBed.createComponent(Opponents);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(root(fixture))).toContain('nur Trainer');
    expect(q(fixture, 'tk-opponent-dialog')).toBeNull();
    expect(firebase.calls).not.toContain('watchOpponents');
  });

  it('zeigt am Handy den Anlegen-Knopf unten statt in der Kopfzeile', async () => {
    const fixture = await render('trainer', true);
    expect(q(fixture, '.head button')).toBeNull();
    expect(q(fixture, '.fab')).not.toBeNull();
  });
});
