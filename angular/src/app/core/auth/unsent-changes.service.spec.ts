import { TestBed } from '@angular/core/testing';
import { LiveOutboxService } from '../live/live-outbox.service';
import { OUTBOX_STORAGE_KEY, type PendingLiveChange } from '../live/live-outbox';
import { CurrentTeam } from '../team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { SessionService } from './session.service';
import { UnsentChangesService } from './unsent-changes.service';

/** Abmelden ohne Netz (SCRUM-220): vorher erkennen, was noch nicht beim Server angekommen ist. */
describe('UnsentChangesService (vor dem Abmelden)', () => {
  let firebase: FakeFirebase;

  beforeEach(() => {
    localStorage.removeItem(OUTBOX_STORAGE_KEY);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set('trainer');
    session.uid.set('u1');
  });
  afterEach(() => localStorage.removeItem(OUTBOX_STORAGE_KEY));

  const entry = (id: string, uid: string, teamId: string): PendingLiveChange => ({ id, uid, teamId, eventId: 'e1', playerId: 'p1', delta: 1, at: 1 });

  it('nichts offen: keine Warnung', async () => {
    expect(await TestBed.inject(UnsentChangesService).check(10)).toEqual({ live: 0, waiting: false });
  });

  it('zählt im Funkloch aufgenommene Live-Punkte, bis der Server sie bestätigt', async () => {
    const outbox = TestBed.inject(LiveOutboxService);
    TestBed.tick();
    firebase.ratings.goOffline();
    outbox.record('e1', 'p1', 2);
    outbox.record('e1', 'p2', -1);
    firebase.auth.pendingWrites = true;
    expect(await TestBed.inject(UnsentChangesService).check(10)).toEqual({ live: 2, waiting: true });

    firebase.ratings.goOnline();
    firebase.auth.pendingWrites = false;
    await vi.waitFor(() => expect(outbox.pendingForAccount()).toBe(0));
    expect(await TestBed.inject(UnsentChangesService).check(10)).toEqual({ live: 0, waiting: false });
  });

  it('zählt auch Änderungen des Kontos aus einem anderen Team (das Abmelden löscht alle), aber keine fremden Konten', async () => {
    const team = TestBed.inject(CurrentTeam).id();
    localStorage.setItem(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([entry('aaaaaaaa1', 'u1', team), entry('aaaaaaaa2', 'u1', 'ANDERES'), entry('aaaaaaaa3', 'u2', team)]),
    );
    firebase.ratings.goOffline();
    expect((await TestBed.inject(UnsentChangesService).check(10)).live).toBe(2);
  });

  it('meldet wartende Firestore-Eingaben (z. B. Bewertungen) auch ohne Live-Punkte', async () => {
    firebase.auth.pendingWrites = true;
    expect(await TestBed.inject(UnsentChangesService).check(10)).toEqual({ live: 0, waiting: true });
  });

  it('ein Fehler bei der Prüfung blockiert das Abmelden nicht', async () => {
    vi.spyOn(firebase.auth, 'hasPendingWrites').mockRejectedValue(new Error('kaputt'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await TestBed.inject(UnsentChangesService).check(10)).toEqual({ live: 0, waiting: false });
    expect(error).toHaveBeenCalled();
  });
});
