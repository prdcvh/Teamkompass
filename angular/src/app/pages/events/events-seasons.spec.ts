import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { todayIso } from '../../core/shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Events } from './events';

/** SCRUM-199: Die Eventliste lädt nur die laufende Saison; ältere Saisons bleiben per Knopf erreichbar. */
describe('Events (Saison-Auswahl)', () => {
  let firebase: FakeFirebase;

  async function render() {
    firebase = new FakeFirebase();
    firebase.events.filterByDate = true;
    firebase.events.events.set('neu', { type: 'Training', title: 'Training heute', date: todayIso() });
    firebase.events.events.set('alt', { type: 'Training', title: 'Training Vorsaison', date: '2001-05-01' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.filters')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('zeigt standardmäßig nur die laufende Saison und lädt ältere auf Knopfdruck nach', async () => {
    const fixture = await render();
    expect(firebase.events.lastFromDate).toMatch(/^\d{4}-07-01$/);
    expect(text(root(fixture).querySelector('.meta'))).toBe('1 Events');
    expect(text(root(fixture).querySelector('.seasons'))).toContain('Ältere Saisons laden');

    root(fixture).querySelector<HTMLButtonElement>('.seasons button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root(fixture).querySelector('.seasons'))).toContain('Alle Saisons werden angezeigt');
    });
    expect(firebase.events.lastFromDate).toBeNull();
    expect(text(root(fixture).querySelector('.meta'))).toBe('2 Events');

    root(fixture).querySelector<HTMLButtonElement>('.seasons button')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root(fixture).querySelector('.meta'))).toBe('1 Events');
    });
  });
});
