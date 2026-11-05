import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { AlertsService } from './alerts.service';

describe('AlertsService (Wenn-dann-Regeln)', () => {
  function setup() {
    const firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    return { firebase, session };
  }

  it('bleibt aktiv, wenn start() vor dem ersten Durchlauf der Effekte kommt', async () => {
    const { session } = setup();
    session.role.set('trainer');
    const service = TestBed.inject(AlertsService);
    service.start();
    TestBed.tick();
    expect(service.active()).toBe(true);
    await vi.waitFor(() => expect(service.ready()).toBe(true));
  });

  it('verwirft alles beim Abmelden und beim Rollenwechsel', async () => {
    const { session, firebase } = setup();
    session.role.set('trainer');
    const service = TestBed.inject(AlertsService);
    service.start();
    await vi.waitFor(() => expect(service.ready()).toBe(true));
    session.role.set('physio');
    TestBed.tick();
    expect(service.active()).toBe(false);
    service.start();
    await vi.waitFor(() => expect(service.ready()).toBe(true));
    session.role.set(null);
    TestBed.tick();
    expect(service.active()).toBe(false);
    expect(service.result()).toEqual({ hints: [], log: [] });
    expect(firebase.calls.filter((call) => call.startsWith('watchSelfReports:p1:wellness')).length).toBe(2);
  });

  it('startet für Spieler, Eltern und Scouts nichts', () => {
    const { session, firebase } = setup();
    for (const role of ['player', 'parent', 'scout'] as const) {
      session.role.set(role);
      const service = TestBed.inject(AlertsService);
      service.start();
      TestBed.tick();
      expect(service.active()).toBe(false);
    }
    expect(firebase.calls.some((call) => call.includes(':wellness'))).toBe(false);
  });
});
