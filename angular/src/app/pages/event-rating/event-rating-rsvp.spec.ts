import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { RsvpService } from '../../core/rsvp/rsvp.service';
import { addDays, todayIso } from '../../core/shared/dates';
import { LayoutService } from '../../core/shell/layout.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from './event-rating';

describe('EventRating: Zu-/Absagen (SCRUM-205)', () => {
  const isMobile = signal(false);
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function render(mobile: boolean) {
    isMobile.set(mobile);
    const firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training morgen', date: addDays(todayIso(), 1) });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Elias Wagner', positions: ['RV'], number: 2, birthdate: '2012-06-06', status: 'Fit' });
    firebase.players.players.set('p3', { name: 'Jan Braun', positions: ['ST'], number: 9, birthdate: '2013-01-01', status: 'Fit' });
    firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'yes', reason: '', by: 'player' });
    firebase.rsvp.set('e1', 'p2', { playerId: 'p2', status: 'no', reason: '<b>Schule</b>', by: 'parent' });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    TestBed.inject(RsvpService); // läuft sonst über die Shell
    const fixture = TestBed.createComponent(EventRating);
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector('.rsvp-summary')).not.toBeNull();
    });
    return { fixture, root, firebase };
  }

  it('Desktop: Zählung über der Matrix und Schild je Spieler; die Absage steht schon auf „Fehlt“', async () => {
    const { fixture, root, firebase } = await render(false);
    expect([...root.querySelectorAll('.rsvp-summary tk-chip')].map(text)).toEqual(['1 zugesagt', '1 abgesagt', '1 offen']);
    const rows = [...root.querySelectorAll('tbody tr')].map((row) => text(row.querySelector('.rsvp-badge')));
    expect(rows).toEqual(['Zugesagt', 'Abgesagt (Eltern): <b>Schule</b>', 'Offen']);
    expect(root.querySelector('tbody b')).toBeNull(); // Grund wird nie als HTML ausgegeben
    await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p2')).toMatchObject({ attendance: 'absent', rsvpAbsence: true }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelector<HTMLSelectElement>('select[aria-label="Anwesenheit: Elias Wagner"]')?.value).toBe('absent');
    });
  });

  it('Handy: Schild auf der Spielerkarte', async () => {
    const { root } = await render(true);
    expect(text(root.querySelector('.rating-card .rsvp-badge'))).toBe('Zugesagt');
  });
});
