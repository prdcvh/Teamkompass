import { TestBed } from '@angular/core/testing';
import { EventsService } from './events.service';
import { FirebaseService } from './firebase.service';
import { ProfileService } from './profile.service';
import { SessionService } from './session.service';
import { FakeFirebase } from './testing';

describe('ProfileService', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.events.set('e2', { type: 'Spiel', title: 'Spiel', date: '2026-10-05', matchDuration: 70 });
    firebase.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    const events = TestBed.inject(EventsService);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    return TestBed.inject(ProfileService);
  }

  const settle = async (profile: ProfileService) => {
    TestBed.tick();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(profile.loading()).toBe(false);
    });
  };

  it('abonniert je Event nur die Bewertung dieses Spielers', async () => {
    const profile = await setup();
    profile.start('p1');
    await settle(profile);
    expect(firebase.calls).toContain('watchRatingDoc:e1:p1');
    expect(firebase.calls).toContain('watchRatingDoc:e2:p1');
    expect(firebase.calls.some((call) => call.startsWith('watchRatingDoc') && !call.endsWith(':p1'))).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('watchRatings:'))).toBe(false);
    const items = profile.items();
    expect(items.map((item) => item.event.id)).toEqual(['e2', 'e1']); // neueste zuerst
    expect(items[1].rating?.effort).toBe(2);
    expect(items[0].rating).toBeNull();
  });

  it('folgt neuen Bewertungen und neuen Events', async () => {
    const profile = await setup();
    profile.start('p1');
    await settle(profile);
    firebase.pushRatingDoc('e2', 'p1', { attendance: 'present', effort: 1, technique: 1, tactics: 1, comprehension: 1 });
    expect(profile.items()[0].rating?.attendance).toBe('present');

    firebase.events.set('e3', { type: 'Training', title: 'Neu', date: '2026-10-09' });
    firebase.emitEvents();
    await settle(profile);
    expect(firebase.calls).toContain('watchRatingDoc:e3:p1');
    expect(profile.items()).toHaveLength(3);
  });

  it('beendet das Abo eines gelöschten Events', async () => {
    const profile = await setup();
    profile.start('p1');
    await settle(profile);
    expect(firebase.ratingDocWatchers).toBe(2);
    firebase.events.delete('e1');
    firebase.emitEvents();
    await settle(profile);
    expect(firebase.ratingDocWatchers).toBe(1);
    expect(profile.items().map((item) => item.event.id)).toEqual(['e2']);
  });

  it('wechselt den Spieler: alte Abos enden, neue starten', async () => {
    const profile = await setup();
    profile.start('p1');
    await settle(profile);
    profile.start('p2');
    await settle(profile);
    expect(firebase.ratingDocWatchers).toBe(2);
    expect(firebase.calls).toContain('watchRatingDoc:e1:p2');
    expect(profile.items().every((item) => item.rating === null)).toBe(true);
  });

  it('meldet Fehler verständlich und startet mit „Erneut versuchen“ neu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const profile = await setup();
    firebase.watchRatingDocError = { code: 'permission-denied' };
    profile.start('p1');
    await vi.waitFor(() => expect(profile.error()).toContain('Das Profil konnte nicht geladen werden'));
    firebase.watchRatingDocError = null;
    profile.retry();
    await settle(profile);
    expect(profile.error()).toBe('');
    expect(profile.items()).toHaveLength(2);
  });

  it('verwirft Daten und Abos beim Abmelden', async () => {
    const profile = await setup();
    profile.start('p1');
    await settle(profile);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(profile.playerId()).toBeNull();
    expect(profile.items()).toEqual([]);
    expect(firebase.ratingDocWatchers).toBe(0);
  });
});
