import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { TeamService } from '../team/team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { ScoutSyncService } from './scout-sync.service';

// SCRUM-170: Die Trainer-App pflegt die bereinigte Scout-Ansicht, sobald alle Bewertungen geladen sind.
describe('ScoutSyncService (Trainer pflegt scoutProfiles)', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'medical' | 'scout' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'revoked' });
    firebase.players.players.set('p2', { name: 'Ben Bauer', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.ratings.ratings.set(
      'e1',
      new Map([
        ['p1', { attendance: 'absent', note: 'Verletzung: Kreuzband', autoAbsence: true, playerId: 'p1' }],
        ['p2', { attendance: 'limited', effort: 2, technique: 2, tactics: 2, comprehension: 2, minutes: 40, note: 'Knie schonen', playerId: 'p2' }],
      ]),
    );
    firebase.scoutProfiles.profiles.set('weg', { playerId: 'weg', name: 'Gelöscht' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(ScoutSyncService).delayMs = 0;
    return TestBed.inject(TeamService);
  }

  const tick = async () => {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 5));
  };

  it('schreibt bereinigte Profile für alle Spieler und entfernt verwaiste – ohne Gesundheitsdaten', async () => {
    const team = setup();
    team.start();
    await vi.waitFor(async () => {
      await tick();
      expect(firebase.scoutProfiles.profiles.has('p1')).toBe(true);
      expect(firebase.scoutProfiles.profiles.has('weg')).toBe(false);
    });
    expect(firebase.scoutProfiles.profiles.get('p1')).toEqual({
      playerId: 'p1', name: 'Ali Adler', number: 9, positions: ['ST'], birthdate: '2012-05-05',
      ratings: { e1: { attendance: 'absent', effort: '', technique: '', tactics: '', comprehension: '', minutes: '', goals: '', assists: '' } },
    });
    expect(firebase.scoutProfiles.profiles.get('p2')!['ratings']).toEqual({
      e1: { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, minutes: 40, goals: '', assists: '' },
    });
    const json = JSON.stringify([...firebase.scoutProfiles.profiles.values()]);
    for (const text of ['Verletz', 'Kreuzband', 'Knie', 'revoked', 'limited', 'note', 'status', '2026-12-01']) expect(json).not.toContain(text);
  });

  it('schreibt nichts, wenn der gespeicherte Stand schon stimmt, und zieht Änderungen nach', async () => {
    const team = setup();
    team.start();
    await vi.waitFor(async () => {
      await tick();
      expect(firebase.scoutProfiles.writes).toContain('set:p2');
    });
    const writes = firebase.scoutProfiles.writes.length;
    firebase.players.emitPlayers();
    await tick();
    await tick();
    expect(firebase.scoutProfiles.writes.length).toBe(writes);
    await firebase.ratings.saveRating('e1', 'p2', { attendance: 'present', effort: 1, technique: 1, tactics: 1, comprehension: 1, playerId: 'p2' });
    await vi.waitFor(async () => {
      await tick();
      expect((firebase.scoutProfiles.profiles.get('p2')!['ratings'] as Record<string, { effort: number }>)['e1'].effort).toBe(1);
    });
  });

  it.each(['medical', 'scout'] as const)('Rolle %s pflegt nichts', async (role) => {
    const sync = (setup(role), TestBed.inject(ScoutSyncService));
    sync.update([], new Map());
    await tick();
    expect(firebase.calls).not.toContain('watchScoutProfiles');
    expect(firebase.scoutProfiles.writes).toEqual([]);
  });
});
