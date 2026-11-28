import { ApplicationRef, Component } from '@angular/core';
import { Location, ViewportScroller } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { routerScrolling } from '../../app.config';
import { SessionService } from '../auth/session.service';
import { ListFilters } from './list-filters';

describe('ListFilters (SCRUM-310: Suche und Filter überstehen den Seitenwechsel)', () => {
  it('beginnt ohne Filter', () => {
    const filters = TestBed.inject(ListFilters);
    expect(filters.squadQuery()).toBe('');
    expect(filters.squadPosition()).toBe('all');
    expect(filters.squadStatus()).toBe('all');
    expect(filters.squadSort()).toBe('number');
    expect(filters.eventsQuery()).toBe('');
    expect(filters.eventsType()).toBe('all');
    expect(filters.eventsSort()).toBe('chronological');
    expect(filters.knowledge().query).toBe('');
    expect(filters.opponentsQuery()).toBe('');
  });

  it('wird beim Abmelden / Teamwechsel (Sitzung leeren) komplett zurückgesetzt', () => {
    const filters = TestBed.inject(ListFilters);
    filters.squadQuery.set('Tim');
    filters.squadPosition.set('TW');
    filters.squadStatus.set('verletzt');
    filters.squadSort.set('name');
    filters.eventsQuery.set('Pokal');
    filters.eventsType.set('Spiel');
    filters.eventsSort.set('date-desc');
    filters.knowledge.update((filter) => ({ ...filter, query: 'Pressing' }));
    filters.opponentsQuery.set('Taunus');

    TestBed.inject(SessionService).clear();

    expect(filters.squadQuery()).toBe('');
    expect(filters.squadPosition()).toBe('all');
    expect(filters.squadStatus()).toBe('all');
    expect(filters.squadSort()).toBe('number');
    expect(filters.eventsQuery()).toBe('');
    expect(filters.eventsType()).toBe('all');
    expect(filters.eventsSort()).toBe('chronological');
    expect(filters.knowledge().query).toBe('');
    expect(filters.opponentsQuery()).toBe('');
  });
});

describe('Router-Scrolling (SCRUM-310)', () => {
  @Component({ template: 'Seite' })
  class Page {}

  @Component({ selector: 'tk-test-root', imports: [RouterOutlet], template: '<router-outlet />' })
  class Root {}

  /** Der Router-Scroller hängt am Bootstrap-Ereignis der App; im Test wird sie deshalb wie in main.ts gestartet. */
  async function bootstrap(url: string): Promise<void> {
    document.body.append(document.createElement('tk-test-root'));
    const app = TestBed.inject(ApplicationRef);
    app.bootstrap(Root);
    await TestBed.inject(Router).navigateByUrl(url);
    await app.whenStable();
  }

  let scroller: { scrollToPosition: ReturnType<typeof vi.fn>; scrollToAnchor: ReturnType<typeof vi.fn>; getScrollPosition: ReturnType<typeof vi.fn>; setHistoryScrollRestoration: ReturnType<typeof vi.fn> };
  let position: [number, number];

  beforeEach(() => {
    position = [0, 0];
    scroller = {
      scrollToPosition: vi.fn(),
      scrollToAnchor: vi.fn(),
      getScrollPosition: vi.fn(() => position),
      setHistoryScrollRestoration: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'liste', component: Page }, { path: 'profil/:id', component: Page }], routerScrolling),
        { provide: ViewportScroller, useValue: scroller },
      ],
    });
  });

  it('eine neu geöffnete Seite beginnt oben, auch aus einer gescrollten Liste', async () => {
    await bootstrap('/liste');
    position = [0, 900];
    scroller.scrollToPosition.mockClear();
    await TestBed.inject(Router).navigateByUrl('/profil/p1');
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scroller.scrollToPosition).toHaveBeenLastCalledWith([0, 0]);
  });

  it('„Zurück“ führt an die Stelle der Liste, an der man war', async () => {
    await bootstrap('/liste');
    position = [0, 900];
    await TestBed.inject(Router).navigateByUrl('/profil/p1');
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    position = [0, 0];
    scroller.scrollToPosition.mockClear();
    TestBed.inject(Location).back();
    await new Promise((resolve) => setTimeout(resolve, 50));
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scroller.scrollToPosition).toHaveBeenLastCalledWith([0, 900], expect.anything());
    expect(TestBed.inject(Router).url).toBe('/liste');
  });

  it('Sprungmarken werden angesprungen', async () => {
    await bootstrap('/liste');
    await TestBed.inject(Router).navigateByUrl('/profil/p1#einwilligung');
    TestBed.inject(ApplicationRef).tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(scroller.scrollToAnchor).toHaveBeenCalledWith('einwilligung');
  });
});
