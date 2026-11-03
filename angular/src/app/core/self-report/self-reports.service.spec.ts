import { TestBed } from '@angular/core/testing';
import type { Role } from '../auth/role';
import { SessionService } from '../auth/session.service';
import { eventFromDoc } from '../events/event';
import { ProfileService } from '../profile/profile.service';
import { TeamService } from '../team/team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { SelfReportsService } from './self-reports.service';

/** Laden und Speichern der Spielerangaben (SCRUM-138) und dass Profil und Teamauswertung mit dem Spielerwert rechnen. */
describe('SelfReportsService', () => {
  let firebase: FakeFirebase;
  const event = eventFromDoc('e1', { type: 'Training', title: 'Training', date: '2026-11-03', exertion: 4 });

  function setup(role: Role, playerId: string | null = null) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-11-03', exertion: 4, durationMinutes: 90 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
    firebase.selfReports.set('p1', 'selfReports', 'e1', { exertion: 8, date: '2026-11-03', updatedAt: null });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    return TestBed.inject(SelfReportsService);
  }

  it('lädt Anstrengung und Befinden; beim Abmelden ist alles weg', async () => {
    const service = setup('trainer');
    firebase.selfReports.set('p1', 'wellness', 'e1', { date: '2026-11-03', fatigue: 3, sleep: 4, soreness: 5, stress: 6 });
    service.start('p1');
    await vi.waitFor(() => expect(service.loaded()).toBe(true));
    expect(service.reports().get('e1')?.exertion).toBe(8);
    expect(service.wellness().get('e1')?.fatigue).toBe(3);
    expect(service.wellnessReadable()).toBe(true);
    expect(service.reportsFor('p2').size).toBe(0);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(service.reports().size).toBe(0);
    expect(service.playerId()).toBeNull();
  });

  it('Fehler beim Laden blockieren nichts: Befinden fehlt still, Anstrengung meldet „nicht geladen“', async () => {
    const service = setup('physio');
    firebase.selfReports.watchErrors.set('wellness', { code: 'permission-denied' });
    firebase.selfReports.watchErrors.set('selfReports', { code: 'permission-denied' });
    service.start('p1');
    await vi.waitFor(() => expect(service.loaded()).toBe(true));
    expect(service.failed()).toBe(true);
    expect(service.wellnessReadable()).toBe(false);
  });

  it('nur Spieler und Eltern speichern, und nur für den eigenen Spieler', async () => {
    for (const [role, playerId, allowed] of [['trainer', null, false], ['physio', null, false], ['player', 'p2', false], ['player', 'p1', true], ['parent', 'p1', true]] as const) {
      TestBed.resetTestingModule();
      const service = setup(role, playerId);
      service.start('p1');
      expect(await service.save(event, 5, null)).toBe(allowed);
      expect(firebase.calls.includes('saveSelfReport:p1:selfReports:e1')).toBe(allowed);
    }
  });

  it('prüft den Wert und schreibt leeres Befinden nur zum Zurücknehmen einer Antwort', async () => {
    const service = setup('player', 'p1');
    service.start('p1');
    await vi.waitFor(() => expect(service.wellnessReadable()).toBe(true));
    expect(await service.save(event, 11, null)).toBe(false);
    expect(await service.save(event, 3, { fatigue: null, sleep: null, soreness: null, stress: null })).toBe(true);
    expect(firebase.calls).not.toContain('saveSelfReport:p1:wellness:e1');
    expect(await service.save(event, 3, { fatigue: 2, sleep: null, soreness: null, stress: null })).toBe(true);
    expect(firebase.selfReports.docs.get('p1/wellness')?.get('e1')).toMatchObject({ fatigue: 2, by: 'player', date: '2026-11-03' });
    expect(await service.save(event, 3, { fatigue: null, sleep: null, soreness: null, stress: null })).toBe(true);
    expect(firebase.selfReports.docs.get('p1/wellness')?.get('e1')).toMatchObject({ fatigue: null });
  });

  it('Speicherfehler: Meldung, kein Erfolg', async () => {
    const service = setup('player', 'p1');
    service.start('p1');
    firebase.selfReports.saveError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await service.save(event, 3, null)).toBe(false);
    expect(service.saving()).toBe(false);
  });

  it('Profil und Teamauswertung rechnen mit dem Spielerwert (Minuten × Anstrengung)', async () => {
    const service = setup('trainer');
    const profile = TestBed.inject(ProfileService);
    profile.start('p1');
    service.start('p1');
    await vi.waitFor(() => expect(profile.items().find((item) => item.event.id === 'e1')?.event.exertion).toBe(8));
    const team = TestBed.inject(TeamService);
    team.start();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(team.data()[0]?.items.find((item) => item.event.id === 'e1')?.event.exertion).toBe(8);
    });
    expect(firebase.calls.some((call) => call.startsWith('watchSelfReports:p1:selfReports:'))).toBe(true);
  });

  it('Teamauswertung: nicht lesbare Spielerangaben lassen den Trainerwert stehen, ohne Fehler', async () => {
    setup('trainer');
    firebase.selfReports.watchErrors.set('selfReports', { code: 'permission-denied' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const team = TestBed.inject(TeamService);
    team.start();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(team.ready()).toBe(true);
    });
    expect(team.error()).toBe('');
    expect(team.data()[0].items.find((item) => item.event.id === 'e1')?.event.exertion).toBe(4);
  });
});
