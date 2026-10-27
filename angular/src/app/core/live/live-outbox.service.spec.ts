import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { EventsService } from '../events/events.service';
import { pointsFromDoc } from '../points/points';
import { RatingsService } from '../ratings/ratings.service';
import { SyncService } from '../shell/sync.service';
import { CurrentTeam } from '../team/current-team.service';
import { environment } from '../../../environments/environment';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { OUTBOX_STORAGE_KEY, type PendingLiveChange, loadOutbox } from './live-outbox';
import { LiveOutboxService } from './live-outbox.service';

/**
 * Funkloch auf dem Platz (SCRUM-216): Punkte gehen ohne Netz nicht verloren, kommen nach dem Neustart an und zählen genau
 * einmal – auch wenn sie mehrfach gesendet werden.
 */
describe('LiveOutboxService (Funkloch, SCRUM-216)', () => {
  let firebase: FakeFirebase;

  beforeEach(() => {
    localStorage.removeItem(OUTBOX_STORAGE_KEY);
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-10' });
    firebase.ratings.privateNotes.set('e1', new Map([['p1', { playerId: 'p1', note: 'Notiz', points: 2 }]]));
  });
  afterEach(() => localStorage.removeItem(OUTBOX_STORAGE_KEY));

  /** Startet die App (neu) als angemeldeter Trainer – wie ein Öffnen der App. */
  function open(uid = 'u1') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set('trainer');
    session.uid.set(uid);
    const outbox = TestBed.inject(LiveOutboxService);
    TestBed.tick();
    return { outbox, teamId: TestBed.inject(CurrentTeam).id() };
  }

  async function openRatings() {
    const app = open();
    const events = TestBed.inject(EventsService);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    const ratings = TestBed.inject(RatingsService);
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    return { ...app, ratings };
  }

  const serverPoints = (playerId = 'p1') => pointsFromDoc(firebase.ratings.privateNotes.get('e1')?.get(playerId));

  it('ohne Netz: Punkte erscheinen sofort, warten im Gerätespeicher und gehen automatisch raus, sobald Netz da ist', async () => {
    const { outbox, ratings } = await openRatings();
    firebase.ratings.goOffline();
    expect(ratings.pointsMeta().fromCache).toBe(true);
    expect(ratings.addPoints('p1', 3)).toBe(true);
    expect(ratings.addPoints('p1', -1)).toBe(true);
    expect(ratings.addPoints('p2', 2)).toBe(true);
    expect(ratings.pointsFor('p1')).toBe(4);
    expect(ratings.pointsFor('p2')).toBe(2);
    expect(outbox.pending()).toHaveLength(3);
    expect(outbox.pendingFor('e1', 'p1')).toBe(2);
    // Liegt auf dem Gerät: übersteht das Schließen der App.
    expect(loadOutbox(localStorage).map((entry) => entry.delta)).toEqual([3, -1, 2]);

    firebase.ratings.goOnline();
    await vi.waitFor(() => expect(outbox.pending()).toHaveLength(0));
    expect(localStorage.getItem(OUTBOX_STORAGE_KEY)).toBeNull();
    expect(serverPoints('p1')).toBe(4);
    expect(serverPoints('p2')).toBe(2);
    expect(ratings.pointsMeta()).toEqual({ fromCache: false, hasPendingWrites: false });
    // Die Notiz bleibt unangetastet.
    expect(firebase.ratings.privateNotes.get('e1')?.get('p1')?.['note']).toBe('Notiz');
  });

  it('App ohne Netz geschlossen: beim nächsten Öffnen wird alles Offene übertragen – genau einmal', async () => {
    const first = await openRatings();
    firebase.ratings.goOffline();
    first.ratings.addPoints('p1', 5);
    first.ratings.addPoints('p1', 1);
    const saved = loadOutbox(localStorage);
    expect(saved).toHaveLength(2);

    // „Schließen“: die Firestore-Warteschlange gibt es in diesem Szenario nicht mehr (z. B. privates Fenster ohne
    // Offline-Speicher) – nur der Postausgang auf dem Gerät ist geblieben. Die erste Änderung war schon angekommen,
    // nur die Bestätigung nicht (Funkloch im falschen Moment).
    const store = firebase.ratings.privateNotes.get('e1')!;
    store.set('p1', { playerId: 'p1', note: 'Notiz', points: 2, live: { [saved[0]!.id]: 5 } });
    firebase.ratings.killPending();
    firebase.calls.length = 0;

    const { outbox } = open();
    await vi.waitFor(() => expect(outbox.pending()).toHaveLength(0));
    expect(firebase.calls.filter((call) => call.startsWith('addPoints:e1:p1'))).toEqual(['addPoints:e1:p1:5', 'addPoints:e1:p1:1']);
    expect(serverPoints()).toBe(8); // 2 + 5 + 1, die doppelt gesendete +5 zählt einmal

    // Noch einmal öffnen: nichts mehr offen, nichts wird erneut gezählt.
    const again = open();
    TestBed.tick();
    expect(again.outbox.pending()).toHaveLength(0);
    expect(serverPoints()).toBe(8);
  });

  it('mehrfaches Senden derselben Änderung (Netz kommt und geht) zählt einmal', async () => {
    const { outbox, ratings } = await openRatings();
    firebase.ratings.goOffline();
    ratings.addPoints('p1', 2);
    window.dispatchEvent(new Event('online')); // Browser meldet Netz, Firestore erreicht den Server aber noch nicht
    window.dispatchEvent(new Event('online'));
    firebase.ratings.goOnline();
    await vi.waitFor(() => expect(outbox.pending()).toHaveLength(0));
    window.dispatchEvent(new Event('online'));
    expect(serverPoints()).toBe(4);
  });

  it('sendet nur Änderungen des eigenen Kontos und Teams', () => {
    const teamId = environment.teamId;
    const foreign: PendingLiveChange[] = [
      { id: 'fremdesKonto1', uid: 'u2', teamId, eventId: 'e1', playerId: 'p1', delta: 9, at: 1 },
      { id: 'fremdesTeam01', uid: 'u1', teamId: 'ANDERES', eventId: 'e1', playerId: 'p1', delta: 9, at: 2 },
    ];
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(foreign));
    const { outbox } = open('u1');
    expect(outbox.pending()).toHaveLength(0);
    expect(firebase.calls.some((call) => call.startsWith('addPoints'))).toBe(false);
    expect(loadOutbox(localStorage)).toHaveLength(2); // bleiben liegen (z. B. für das andere Team)
  });

  it('endgültig abgelehnt (keine Berechtigung): Änderung wird verworfen und deutlich gemeldet statt ewig zu warten', async () => {
    const { outbox, ratings } = await openRatings();
    firebase.ratings.addPointsError = { code: 'permission-denied' };
    ratings.addPoints('p1', 1);
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(outbox.pending()).toHaveLength(0);
    expect(TestBed.inject(SyncService).detail()).toContain('Punkte konnten nicht gespeichert werden');
  });

  it('vorübergehender Fehler: Änderung bleibt im Postausgang und geht beim nächsten Versuch raus', async () => {
    const { outbox, ratings } = await openRatings();
    firebase.ratings.addPointsError = new Error('Netzwerk weg');
    ratings.addPoints('p1', 1);
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(outbox.pending()).toHaveLength(1);
    firebase.ratings.addPointsError = null;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(outbox.pending()).toHaveLength(0));
    expect(serverPoints()).toBe(3);
    expect(TestBed.inject(SyncService).state()).not.toBe('error');
  });

  it('Abmelden leert den Postausgang (keine Teamdaten im Browser)', async () => {
    const { outbox, ratings } = await openRatings();
    firebase.ratings.goOffline();
    ratings.addPoints('p1', 1);
    expect(loadOutbox(localStorage)).toHaveLength(1);
    outbox.clear();
    expect(outbox.pending()).toHaveLength(0);
    expect(localStorage.getItem(OUTBOX_STORAGE_KEY)).toBeNull();
  });

  it('Endwert im Formular nach Live-Punkten: Live-Einträge bleiben, gespeichert wird der passende Grundwert', async () => {
    const { ratings } = await openRatings();
    ratings.addPoints('p1', 3); // 2 + 3 = 5
    await vi.waitFor(() => expect(serverPoints()).toBe(5));
    expect(ratings.setPoints('p1', '10')).toBe(true);
    await vi.waitFor(() => expect(serverPoints()).toBe(10));
    expect(firebase.ratings.privateNotes.get('e1')?.get('p1')?.['points']).toBe(7);
    ratings.addPoints('p1', -1);
    await vi.waitFor(() => expect(serverPoints()).toBe(9));
  });
});
