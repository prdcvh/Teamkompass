import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Events } from './events';

describe('Events: Hinweis auf die laufende Pause (SCRUM-150)', () => {
  it('zeigt über der Liste einen Hinweis auf die laufende Pause', async () => {
    const firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('.filters')).not.toBeNull();
    });
    expect(root.querySelector('[data-testid="break-notice"]')).toBeNull();
    const now = new Date();
    const iso = (offset: number) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    firebase.planning.breaksDoc = { breaks: { b1: { name: 'Winterpause', startDate: iso(-1), endDate: iso(3) } } };
    firebase.planning.emitBreaks();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const end = iso(3);
    const notice = root.querySelector('[data-testid="break-notice"]');
    expect(notice?.textContent?.replace(/\s+/g, ' ').trim()).toBe(`Winterpause bis ${end.slice(8, 10)}.${end.slice(5, 7)}.`);
  });
});
