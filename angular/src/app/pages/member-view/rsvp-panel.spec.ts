import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { weekEnd } from '../../core/rsvp/rsvp';
import { addDays, todayIso } from '../../core/shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { RsvpPanel } from './rsvp-panel';

describe('RsvpPanel: Nächste Termine (SCRUM-205)', () => {
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  async function render(role: Role, playerId: string | null = 'p1', extra = false) {
    const firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training morgen', date: addDays(todayIso(), 1), startTime: '17:30' });
    firebase.events.events.set('alt', { type: 'Training', title: 'Training gestern', date: addDays(todayIso(), -1) });
    if (extra) {
      const end = weekEnd(todayIso());
      firebase.events.events.set('spaet', { type: 'Spiel', title: 'Spiel später', date: addDays(end, 3) });
      firebase.events.events.set('spaeter', { type: 'Training', title: 'Training noch später', date: addDays(end, 9) });
    }
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    const fixture = TestBed.createComponent(RsvpPanel);
    const root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root, firebase };
  }

  it('Spieler: nur kommende Termine; Absage mit Grund wird gespeichert und angezeigt', async () => {
    const { fixture, root, firebase } = await render('player');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelectorAll('.rsvp-item')).toHaveLength(1);
    });
    expect(text(root.querySelector('.rsvp-item'))).toContain('Training morgen');
    expect(text(root.querySelector('tk-chip'))).toBe('Noch offen');
    root.querySelector<HTMLInputElement>('input[name="reason"]')!.value = 'Familienfeier';
    [...root.querySelectorAll<HTMLButtonElement>('.rsvp-actions button')].find((button) => text(button) === 'Ich kann nicht')!.click();
    await vi.waitFor(() => expect(firebase.rsvp.responses.get('e1')?.get('p1')).toMatchObject({ status: 'no', reason: 'Familienfeier', by: 'player' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root.querySelector('tk-chip'))).toBe('Abgesagt');
    });
  });

  it('SCRUM-401: Termine außerhalb der Woche erst nach „Weitere Termine“; leere Woche zeigt Hinweis', async () => {
    const { fixture, root } = await render('player', 'p1', true);
    const end = weekEnd(todayIso());
    const button = () => root.querySelector<HTMLButtonElement>('.rsvp-more');
    const titles = () => [...root.querySelectorAll('.rsvp-item strong')].map(text);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(titles().length).toBeGreaterThan(0);
    });
    const withinWeek = addDays(todayIso(), 1) <= end;
    if (withinWeek) {
      expect(titles()).toEqual(['Training morgen']);
      expect(root.querySelector('.rsvp-week-empty')).toBeNull();
    } else {
      expect(titles()).toEqual(['Training morgen']); // morgen liegt schon in der nächsten Woche: Hinweis + nächster Termin
      expect(root.querySelector('.rsvp-week-empty')).not.toBeNull();
    }
    expect(text(button())).toBe('Weitere Termine anzeigen (2)');
    button()!.click();
    fixture.detectChanges();
    expect(titles()).toEqual(['Training morgen', 'Spiel später', 'Training noch später']);
    expect(text(button())).toBe('Weniger Termine anzeigen');
    button()!.click();
    fixture.detectChanges();
    expect(titles()).toEqual(['Training morgen']);
  });

  it('Eltern: Knöpfe „Zusagen“/„Absagen“, Antwort für das eigene Kind', async () => {
    const { fixture, root, firebase } = await render('parent');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root.querySelectorAll('.rsvp-actions button')).toHaveLength(2);
    });
    expect([...root.querySelectorAll('.rsvp-actions button')].map(text)).toEqual(['Zusagen', 'Absagen']);
    root.querySelector<HTMLButtonElement>('.rsvp-actions button')!.click();
    await vi.waitFor(() => expect(firebase.rsvp.responses.get('e1')?.get('p1')).toMatchObject({ status: 'yes', by: 'parent' }));
  });

  it('Trainer, Medizin, Scout und Zugänge ohne Spieler sehen nichts', async () => {
    for (const [role, playerId] of [['trainer', null], ['physio', null], ['scout', null], ['player', null]] as const) {
      TestBed.resetTestingModule();
      const { root } = await render(role, playerId);
      expect(root.querySelector('.rsvp')).toBeNull();
    }
  });
});
