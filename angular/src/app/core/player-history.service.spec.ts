import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase.service';
import { PlayerHistoryService } from './player-history.service';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('PlayerHistoryService', () => {
  let firebase: FakeFirebase;

  const doc = (grade: number, overrides: Record<string, unknown> = {}) => ({
    attendance: 'present',
    effort: grade,
    technique: grade,
    tactics: grade,
    comprehension: grade,
    grade,
    minutes: '',
    goals: '',
    assists: '',
    note: '',
    ...overrides,
  });

  function setup(role: 'trainer' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.ratings.set('e1', new Map([['p1', { ...doc(2), playerId: 'p1' }], ['p2', { ...doc(5), playerId: 'p2' }]]));
    firebase.ratings.set('e2', new Map([['p1', { ...doc(3, { note: 'Solide' }), playerId: 'p1' }]]));
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(PlayerHistoryService);
  }

  const ready = (history: PlayerHistoryService) => vi.waitFor(() => expect(history.load()).toBe('ready'));

  it('abonniert je Event nur die Bewertung des Spielers und meldet „bereit“, wenn alle da sind', async () => {
    const history = setup();
    history.watch('p1', ['e1', 'e2', 'e3']);
    await ready(history);
    expect(firebase.playerRatingWatchers).toBe(3);
    expect(firebase.calls.filter((call) => call.startsWith('watchPlayerRating'))).toEqual([
      'watchPlayerRating:e1:p1',
      'watchPlayerRating:e2:p1',
      'watchPlayerRating:e3:p1',
    ]);
    expect(firebase.calls.some((call) => call.startsWith('watchRatings'))).toBe(false);
    expect(history.ratings().get('e1')).toMatchObject({ attendance: 'present', effort: 2 });
    expect(history.ratings().get('e2')?.note).toBe('Solide');
    expect(history.ratings().has('e3')).toBe(false); // Event ohne Bewertungsdokument
    expect(TestBed.inject(SyncService).state()).toBe('saved');
  });

  it('ist ohne Events sofort bereit und startet bei gleichen Werten nichts doppelt', async () => {
    const history = setup();
    history.watch('p1', []);
    expect(history.load()).toBe('ready');
    history.watch('p1', ['e1']);
    history.watch('p1', ['e1']);
    await ready(history);
    expect(firebase.playerRatingWatchers).toBe(1);
  });

  it('gleicht die Abos an, wenn Events dazukommen oder wegfallen', async () => {
    const history = setup();
    history.watch('p1', ['e1', 'e2']);
    await ready(history);
    history.watch('p1', ['e2', 'e3']);
    await ready(history);
    expect(firebase.playerRatingWatchers).toBe(2);
    expect(firebase.calls.filter((call) => call === 'watchPlayerRating:e2:p1')).toHaveLength(1);
    expect(history.ratings().has('e1')).toBe(false);
    expect(history.ratings().has('e2')).toBe(true);
  });

  it('beendet alle Abos beim Wechsel zu einem anderen Spieler und zeigt nichts vom alten', async () => {
    const history = setup();
    history.watch('p1', ['e1', 'e2']);
    await ready(history);
    history.watch('p2', ['e1', 'e2']);
    expect(history.ratings().get('e1')?.effort).not.toBe(2); // nichts vom alten Spieler
    await ready(history);
    expect(firebase.playerRatingWatchers).toBe(2);
    expect(history.playerId()).toBe('p2');
    expect(history.ratings().get('e1')?.effort).toBe(5);
    expect(history.ratings().has('e2')).toBe(false);
  });

  it('folgt Änderungen in Echtzeit', async () => {
    const history = setup();
    history.watch('p1', ['e1']);
    await ready(history);
    await firebase.saveRating('e1', 'p1', doc(1, { note: 'Neu' }));
    expect(history.ratings().get('e1')).toMatchObject({ effort: 1, note: 'Neu' });
  });

  it('verwirft ein Abo, das erst nach dem Stoppen eintrifft', async () => {
    const history = setup();
    history.watch('p1', ['e1']);
    history.stop();
    await vi.waitFor(() => expect(firebase.calls).toContain('watchPlayerRating:e1:p1'));
    await Promise.resolve();
    expect(firebase.playerRatingWatchers).toBe(0);
    expect(history.load()).toBe('idle');
  });

  it('meldet Ladefehler verständlich, beendet die Abos und lässt „Erneut versuchen“ zu', async () => {
    const history = setup();
    history.watch('p1', ['e1', 'e2']);
    await ready(history);
    firebase.failPlayerRating('e1', 'p1', { code: 'permission-denied' });
    expect(history.load()).toBe('error');
    expect(history.error()).toContain('Die Bewertungen des Spielers konnten nicht geladen werden');
    expect(history.error()).toContain('permission-denied');
    expect(TestBed.inject(SyncService).state()).toBe('error');
    expect(firebase.playerRatingWatchers).toBe(0);
    history.watch('p1', ['e1', 'e2']); // bleibt im Fehlerzustand, bis der Nutzer es ausdrücklich erneut versucht
    expect(history.load()).toBe('error');
    TestBed.inject(SyncService).reset();
    history.retry();
    await ready(history);
    expect(firebase.playerRatingWatchers).toBe(2);
  });

  it('meldet einen Fehler beim Öffnen des Abos', async () => {
    const history = setup();
    firebase.watchPlayerRatingError = { code: 'unavailable' };
    history.watch('p1', ['e1']);
    await vi.waitFor(() => expect(history.load()).toBe('error'));
    expect(history.error()).toContain('unavailable');
  });

  it('verwirft Abos und Daten beim Abmelden', async () => {
    const history = setup();
    history.watch('p1', ['e1']);
    await ready(history);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(history.playerId()).toBeNull();
    expect(history.ratings().size).toBe(0);
    expect(history.load()).toBe('idle');
    expect(firebase.playerRatingWatchers).toBe(0);
  });

  it('stoppt bei fehlendem Spieler', async () => {
    const history = setup();
    history.watch('p1', ['e1']);
    await ready(history);
    history.watch(null, ['e1']);
    expect(history.load()).toBe('idle');
    expect(firebase.playerRatingWatchers).toBe(0);
  });
});
