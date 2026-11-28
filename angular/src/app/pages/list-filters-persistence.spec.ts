import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../core/auth/session.service';
import { ListFilters } from '../core/shell/list-filters';
import { LayoutService } from '../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../core/testing/fake-firebase';
import { Events } from './events/events';
import { Squad } from './squad/squad';

/** SCRUM-310: Suche, Filter und Sortierung bleiben stehen, wenn man eine Seite verlässt und zurückkommt. */
describe('Kader und Events: Filter überstehen den Seitenwechsel (SCRUM-310)', () => {
  const isMobile = signal(false);

  function setup() {
    const firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'pending' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'pending' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2 });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }] });
    TestBed.inject(SessionService).role.set('trainer');
  }

  const search = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="search"]')!;
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('Kader: Suchtext bleibt nach dem Zurückkommen stehen, die Liste ist weiter gefiltert', async () => {
    setup();
    const first = TestBed.createComponent(Squad);
    await first.whenStable();
    await vi.waitFor(() => {
      first.detectChanges();
      expect(search(first.nativeElement)).not.toBeNull();
    });
    type(search(first.nativeElement), 'wagner');
    first.detectChanges();
    first.destroy();

    const again = TestBed.createComponent(Squad);
    await again.whenStable();
    again.detectChanges();
    expect(search(again.nativeElement).value).toBe('wagner');
    expect(again.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);

    // Abmelden / Teamwechsel räumt den Stand weg
    TestBed.inject(SessionService).clear();
    expect(TestBed.inject(ListFilters).squadQuery()).toBe('');
  });

  it('Events: Suchtext bleibt nach dem Zurückkommen stehen', async () => {
    setup();
    const first = TestBed.createComponent(Events);
    await first.whenStable();
    await vi.waitFor(() => {
      first.detectChanges();
      expect(search(first.nativeElement)).not.toBeNull();
    });
    type(search(first.nativeElement), 'nord');
    first.detectChanges();
    first.destroy();

    const again = TestBed.createComponent(Events);
    await again.whenStable();
    again.detectChanges();
    expect(search(again.nativeElement).value).toBe('nord');
    expect(TestBed.inject(ListFilters).eventsQuery()).toBe('nord');
  });
});
