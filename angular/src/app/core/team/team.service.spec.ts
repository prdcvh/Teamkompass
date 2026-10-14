import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { TeamService } from './team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('TeamService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'medical' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ben Bauer', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(TeamService);
  }

  const settle = async (team: TeamService) =>
    vi.waitFor(() => {
      TestBed.tick();
      expect(team.ready()).toBe(true);
    });

  it('lädt Bewertungen aller Spieler je Event sowie Abwesenheiten und Messwerte je Spieler', async () => {
    const team = setup();
    team.start();
    await settle(team);
    expect(firebase.calls).toEqual(
      expect.arrayContaining(['watchRatings:e1', 'watchPlayerRecords:p1:absences', 'watchPlayerRecords:p1:measurements', 'watchPlayerRecords:p2:absences', 'watchPlayerRecords:p2:measurements']),
    );
    const data = team.data();
    expect(data.map((entry) => entry.player.name).sort()).toEqual(['Ali Adler', 'Ben Bauer']);
    const ali = data.find((entry) => entry.player.id === 'p1')!;
    expect(ali.items[0].rating?.attendance).toBe('present');
    expect(data.find((entry) => entry.player.id === 'p2')!.items[0].rating).toBeNull();
  });

  it('folgt neuen Spielern und Events und beendet Abos entfernter Events', async () => {
    const team = setup();
    team.start();
    await settle(team);
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Spiel', date: '2026-10-05' });
    firebase.events.emitEvents();
    firebase.players.players.set('p3', { name: 'Cem Cakir', positions: ['TW'], number: 1, birthdate: '2013-01-01' });
    firebase.players.emitPlayers();
    await settle(team);
    expect(firebase.calls).toContain('watchRatings:e2');
    expect(firebase.calls).toContain('watchPlayerRecords:p3:absences');

    const before = firebase.ratings.ratingWatchers;
    firebase.events.events.delete('e2');
    firebase.events.emitEvents();
    TestBed.tick();
    expect(firebase.ratings.ratingWatchers).toBe(before - 1);
    expect(team.data()[0].items.map((item) => item.event.id)).toEqual(['e1']);
  });

  it('startet für andere Rollen als Trainer nichts', () => {
    const team = setup('medical');
    team.start();
    expect(team.active()).toBe(false);
    expect(firebase.calls).not.toContain('watchRatings:e1');
  });

  it('verwirft beim Abmelden alle Abos und Daten', async () => {
    const team = setup();
    team.start();
    await settle(team);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(team.active()).toBe(false);
    expect(team.data()).toEqual([]);
    expect(firebase.ratings.ratingWatchers).toBe(0);
    expect(firebase.records.recordWatchers).toBe(0);
  });

  it('meldet einen Abo-Fehler mit verständlichem Text und kann es erneut versuchen', async () => {
    const team = setup();
    firebase.ratings.watchRatingsError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    team.start();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(team.error()).not.toBe('');
    });
    expect(team.error()).toContain('Teamauswertung');
    expect(team.loading()).toBe(false);
    firebase.ratings.watchRatingsError = null;
    team.retry();
    await settle(team);
    expect(team.error()).toBe('');
  });
});
