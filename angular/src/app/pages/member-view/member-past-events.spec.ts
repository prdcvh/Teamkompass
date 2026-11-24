import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { MemberView } from './member-view';

/** Vergangene Termine in der Spieleransicht: eingeklappt, 5 neueste, „Ältere anzeigen“ (SCRUM-402). */
const TOGGLE = '[data-testid="history-toggle"]';
const MORE = '[data-testid="history-more"]';

async function render(role: Role) {
  const firebase = new FakeFirebase();
  firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
  for (let i = 1; i <= 7; i++) {
    firebase.events.events.set(`x${i}`, { type: 'Training', title: `Altlast ${i}`, date: `2026-08-0${i}` });
    firebase.ratings.ratings.set(`x${i}`, new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
  }
  firebase.players.readablePlayerDocs = new Set(['p1']);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
  });
  const session = TestBed.inject(SessionService);
  session.role.set(role);
  session.playerId.set('p1');
  const fixture = TestBed.createComponent(MemberView);
  const root = fixture.nativeElement as HTMLElement;
  const settled = (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      check();
    });
  const click = (selector: string) => (root.querySelector(selector) as HTMLButtonElement).click();
  const titles = () => [...root.querySelectorAll('ul.history li strong')].map((e) => e.textContent?.trim());
  await fixture.whenStable();
  await settled(() => expect(root.querySelector(TOGGLE)).not.toBeNull());
  return { root, settled, click, titles };
}

describe('Spieleransicht: vergangene Termine (SCRUM-402)', () => {
  it.each(['player', 'parent'] as const)('%s: standardmäßig eingeklappt, Anzahl am Knopf', async (role) => {
    const { root } = await render(role);
    const toggle = root.querySelector(TOGGLE)!;
    expect(toggle.textContent?.replace(/\s+/g, ' ').trim()).toBe('Vergangene Termine (7) anzeigen');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('ul.history')).toBeNull();
    expect(root.textContent).not.toContain('Altlast');
  });

  it('zeigt aufgeklappt die 5 neuesten, dann mit „Ältere anzeigen“ den Rest, und klappt wieder ein', async () => {
    const { root, settled, click, titles } = await render('player');
    click(TOGGLE);
    await settled(() => expect(titles()).toHaveLength(5));
    expect(titles()).toEqual(['Altlast 7', 'Altlast 6', 'Altlast 5', 'Altlast 4', 'Altlast 3']);
    expect(root.querySelector(TOGGLE)!.getAttribute('aria-expanded')).toBe('true');
    click(MORE);
    await settled(() => expect(titles()).toHaveLength(7));
    expect(root.querySelector(MORE)).toBeNull();
    click(TOGGLE);
    await settled(() => expect(root.querySelector('ul.history')).toBeNull());
    // Erneutes Aufklappen beginnt wieder mit den 5 neuesten.
    click(TOGGLE);
    await settled(() => expect(titles()).toHaveLength(5));
  });

  it('Übersicht und Verfügbarkeit bleiben ohne Aufklappen sichtbar', async () => {
    const { root } = await render('player');
    expect(root.textContent).toContain('Übersicht');
    expect(root.textContent).toContain('Verfügbarkeit');
  });
});
