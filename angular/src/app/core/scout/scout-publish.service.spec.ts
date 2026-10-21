import { TestBed } from '@angular/core/testing';
import type { Role } from '../auth/role';
import { SessionService } from '../auth/session.service';
import { TeamService } from '../team/team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { ScoutPublishService } from './scout-publish.service';

describe('ScoutPublishService (Trainer pflegt die Scout-Sicht, SCRUM-170)', () => {
  let firebase: FakeFirebase;

  function setup(role: Role, members: Record<string, Record<string, unknown>> = { s1: { role: 'scout', email: 'scout@x.de' } }) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: 'Ben Widerruf', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Fit', consentStatus: 'revoked' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01', notes: 'Ali Knie' });
    firebase.ratings.ratings.set('e1', new Map([
      ['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, note: 'Knie schonen', playerId: 'p1' }],
      ['p2', { attendance: 'absent', note: 'Verletzt', autoAbsence: true, playerId: 'p2' }],
    ]));
    firebase.records.playerRecords.set('p1/absences', new Map([['a1', { kind: 'injury', label: 'Zerrung', from: '2026-10-01', to: '2026-12-01', playerId: 'p1' }]]));
    for (const [uid, data] of Object.entries(members)) firebase.access.memberDocs.set(uid, data);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(ScoutPublishService);
  }

  const settle = async (check: () => void) =>
    vi.waitFor(() => {
      TestBed.tick();
      check();
    });

  it('schreibt bei vorhandenem Scout-Zugang die bereinigte Sicht – ohne Verletzung, Grund, Notiz oder widerrufene Spieler', async () => {
    const publisher = setup('trainer');
    const team = TestBed.inject(TeamService);
    await settle(() => expect(team.ready()).toBe(true));
    await publisher.publish();
    expect([...firebase.scout.profiles.keys()]).toEqual(['p1']);
    const text = JSON.stringify([...firebase.scout.profiles.values()]);
    for (const hidden of ['Verletzt', 'Knie', 'Zerrung', 'injury', 'status', 'note', 'Widerruf']) expect(text).not.toContain(hidden);
    expect(firebase.scout.profiles.get('p1')).toMatchObject({ name: 'Ali Adler', entries: [{ eventId: 'e1', attendance: 'present', effort: 2 }] });

    // Unverändert: kein weiterer Schreibvorgang.
    await publisher.publish();
    expect(firebase.scout.applied).toHaveLength(1);
  });

  it('bisherige Scout-Konten („medical“) zählen als Scout', async () => {
    const publisher = setup('trainer', { old: { role: 'medical', email: 'alt@x.de' } });
    await settle(() => expect(publisher.scoutAccounts()).toBe(1));
  });

  it('löscht die Scout-Sicht, wenn es keinen Scout-Zugang (mehr) gibt, und lädt dafür keine Bewertungen', async () => {
    const publisher = setup('trainer', { m1: { role: 'physio', email: 'arzt@x.de' } });
    firebase.scout.profiles.set('p1', { playerId: 'p1', name: 'alt', entries: [] });
    await settle(() => expect(publisher.scoutAccounts()).toBe(0));
    await publisher.publish();
    expect(firebase.scout.profiles.size).toBe(0);
    expect(firebase.calls.some((call) => call.startsWith('watchRatings'))).toBe(false);
  });

  it('schreibt ohne bekannte Zahl der Scout-Zugänge nichts (z. B. wenn die Mitgliederliste nicht lädt)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase = new FakeFirebase();
    firebase.access.readAccessError = { code: 'unavailable' };
    firebase.scout.profiles.set('p1', { playerId: 'p1', name: 'alt', entries: [] });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const publisher = TestBed.inject(ScoutPublishService);
    await settle(() => expect(firebase.calls).toContain('readMembers'));
    await publisher.publish();
    expect(firebase.scout.applied).toEqual([]);
    expect(firebase.scout.profiles.size).toBe(1);
  });

  it.each<Role>(['scout', 'physio', 'player', 'parent'])('tut für %s nichts', async (role) => {
    const publisher = setup(role);
    TestBed.tick();
    await publisher.publish();
    expect(firebase.calls.filter((call) => ['readMembers', 'watchScoutProfiles'].includes(call) || call.startsWith('applyScoutChanges'))).toEqual([]);
  });
});
