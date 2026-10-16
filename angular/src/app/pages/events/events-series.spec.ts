import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { Events } from './events';

describe('Events: Wiederholen-Symbol für Serien-Trainings (SCRUM-146)', () => {
  async function render(mobile: boolean) {
    const firebase = new FakeFirebase();
    firebase.events.events.set('serie-sabc-2026-10-20', { type: 'Training', title: 'Training', date: '2026-10-20', startTime: '17:30' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Einzeltraining', date: '2026-10-21' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(mobile) } }],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.filters')).not.toBeNull();
    });
    return fixture.nativeElement as HTMLElement;
  }

  it.each([
    ['am Desktop', false],
    ['am Handy', true],
  ])('markiert nur Serien-Trainings %s', async (_label, mobile) => {
    const root = await render(mobile);
    const marks = root.querySelectorAll('.series-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute('aria-label')).toBe('Aus Trainingsserie');
    expect(marks[0].closest('tr, li')?.textContent).toContain('Training');
    expect(marks[0].closest('tr, li')?.textContent).not.toContain('Einzeltraining');
  });
});
