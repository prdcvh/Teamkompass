import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { PLAYER_STATS_VERSION } from './player-stats';
import { PlayerStatsMode } from './player-stats-mode';
import { PlayerStatsService } from './player-stats.service';
import { TeamService } from './team.service';

/** SCRUM-201: Stand der Zusammenfassungen, Übersichten aus Zusammenfassungen, Neuberechnung und Prüfung. */
describe('Zusammenfassungen je Spieler (Dienste)', () => {
  let firebase: FakeFirebase;
  const marker = { version: PLAYER_STATS_VERSION, builtAt: '2026-10-21T20:00:00.000Z' };

  function setup(options: { role?: 'trainer' | 'player' | null; marker?: Record<string, unknown> | null; markerError?: unknown } = {}) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ben Bauer', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Spiel', date: '2026-10-04', matchDuration: 80 });
    firebase.ratings.ratings.set(
      'e1',
      new Map([
        ['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 3, comprehension: 1, note: 'Gut', playerId: 'p1' }],
        ['p2', { attendance: 'absent', note: 'Krank', autoAbsence: true, playerId: 'p2' }],
      ]),
    );
    firebase.ratings.ratings.set('e2', new Map([['p1', { attendance: 'limited', grade: 3, minutes: 40, goals: 1, playerId: 'p1' }]]));
    firebase.playerStats.marker = options.marker === undefined ? null : options.marker;
    firebase.playerStats.markerError = options.markerError ?? null;
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(options.role === undefined ? 'trainer' : options.role);
    TestBed.tick();
    return { mode: TestBed.inject(PlayerStatsMode), stats: TestBed.inject(PlayerStatsService), team: TestBed.inject(TeamService) };
  }

  const settle = async (team: TeamService) =>
    vi.waitFor(() => {
      TestBed.tick();
      expect(team.ready()).toBe(true);
    });

  /** Bewertungen ohne Rückmeldungstext (der steht bewusst nicht in der Zusammenfassung). */
  const numbersOf = (team: TeamService) =>
    team.data().map(({ player, items }) => ({ id: player.id, items: items.map(({ event, rating }) => ({ event: event.id, rating: rating && { ...rating, note: '', autoAbsence: false } })) }));

  describe('Stand (Kennzeichen)', () => {
    it('ohne Kennzeichen: nicht eingerichtet, Bewertungen werden trotzdem mitgeschrieben', async () => {
      const { mode } = setup();
      await vi.waitFor(() => expect(mode.state()).toBe('absent'));
      expect(mode.reads()).toBe(false);
      expect(await mode.writesSummary()).toBe(true);
    });

    it('mit Kennzeichen: eingerichtet', async () => {
      const { mode } = setup({ marker });
      await vi.waitFor(() => expect(mode.state()).toBe('on'));
      expect(mode.reads()).toBe(true);
      expect(mode.builtAt()).toBe(marker.builtAt);
    });

    it('andere Version gilt als nicht eingerichtet', async () => {
      const { mode } = setup({ marker: { version: 99, builtAt: 'x' } });
      await vi.waitFor(() => expect(mode.state()).toBe('absent'));
    });

    it('Regeln kennen die Sammlung noch nicht: nichts mitschreiben (sonst scheitert die Bewertung)', async () => {
      const { mode } = setup({ markerError: { code: 'permission-denied' } });
      await vi.waitFor(() => expect(mode.state()).toBe('denied'));
      expect(await mode.writesSummary()).toBe(false);
    });

    it('offline ohne Zwischenspeicher: wie nicht eingerichtet lesen, aber mitschreiben', async () => {
      firebase = new FakeFirebase();
      firebase.playerStats.markerFromCache = true;
      TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
      TestBed.inject(SessionService).role.set('trainer');
      const mode = TestBed.inject(PlayerStatsMode);
      TestBed.tick();
      await vi.waitFor(() => expect(mode.state()).toBe('cacheMissing'));
      expect(mode.reads()).toBe(false);
      expect(await mode.writesSummary()).toBe(true);
    });

    it('nur für Trainer; beim Abmelden zurückgesetzt', async () => {
      const { mode } = setup({ role: 'player', marker });
      expect(firebase.calls).not.toContain('watchPlayerStatsMarker');
      expect(mode.state()).toBe('loading');
      TestBed.inject(SessionService).role.set('trainer');
      TestBed.tick();
      await vi.waitFor(() => expect(mode.state()).toBe('on'));
      TestBed.inject(SessionService).role.set(null);
      TestBed.tick();
      expect(mode.state()).toBe('loading');
      expect(mode.builtAt()).toBeNull();
    });
  });

  describe('Teamauswertung', () => {
    it('nicht eingerichtet: wie bisher ein Abo je Event', async () => {
      const { team } = setup();
      team.start();
      await settle(team);
      expect(firebase.calls).toEqual(expect.arrayContaining(['watchRatings:e1', 'watchRatings:e2']));
      expect(firebase.calls).not.toContain('watchPlayerStats');
    });

    it('eingerichtet: ein Abo auf die Zusammenfassungen, keine Einzelbewertungen – und dieselben Zahlen', async () => {
      // Erst wie bisher rechnen (Vergleichswert) …
      const legacy = setup();
      legacy.team.start();
      await settle(legacy.team);
      const before = numbersOf(legacy.team);
      const beforeRatings = legacy.team.ratingsByEvent();
      await legacy.stats.rebuild();
      TestBed.resetTestingModule();

      // … dann mit den neu berechneten Zusammenfassungen.
      const stats = firebase.playerStats.stats;
      const { team } = setup({ marker });
      firebase.playerStats.stats = stats;
      team.start();
      await settle(team);
      expect(firebase.calls).toContain('watchPlayerStats');
      expect(firebase.calls.filter((call) => call.startsWith('watchRatings'))).toEqual([]);
      expect(numbersOf(team)).toEqual(before);
      expect([...team.ratingsByEvent().keys()].sort()).toEqual([...beforeRatings.keys()].sort());
    });

    it('wird das Kennzeichen entfernt, rechnet die Auswertung wieder wie bisher', async () => {
      const { team, stats } = setup();
      team.start();
      await settle(team);
      await stats.rebuild();
      await settle(team);
      expect(firebase.playerStats.statsWatchers).toBe(1);
      expect(firebase.ratings.ratingWatchers).toBe(0);
      firebase.playerStats.marker = null;
      firebase.playerStats.emitMarker();
      await settle(team);
      expect(firebase.playerStats.statsWatchers).toBe(0);
      expect(firebase.ratings.ratingWatchers).toBe(2);
      expect(team.data().find((entry) => entry.player.id === 'p1')!.items.find((item) => item.event.id === 'e1')!.rating?.note).toBe('Gut');
    });

    it('wartet auf das Kennzeichen, bevor Bewertungen abonniert werden', async () => {
      firebase = new FakeFirebase();
      firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01' });
      let release: () => void = () => undefined;
      const original = firebase.playerStats.watchMarker.bind(firebase.playerStats);
      firebase.playerStats.watchMarker = (onData, onError) =>
        new Promise((resolve) => {
          release = () => resolve(original(onData, onError));
        }).then((unsubscribe) => unsubscribe as () => void);
      TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
      TestBed.inject(SessionService).role.set('trainer');
      const team = TestBed.inject(TeamService);
      team.start();
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve, 20));
      TestBed.tick();
      expect(team.loading()).toBe(true);
      expect(firebase.calls.filter((call) => call.startsWith('watchRatings'))).toEqual([]);
      release();
      await settle(team);
      expect(firebase.calls).toContain('watchRatings:e1');
    });

    it('JSON-Sicherung: mit Zusammenfassungen werden die Bewertungen samt Rückmeldung einmalig gelesen', async () => {
      const { team, stats } = setup();
      team.start();
      await settle(team);
      expect(await team.fullRatings()).toBe(team.ratingsByEvent());
      await stats.rebuild();
      await settle(team);
      expect(team.ratingsByEvent().get('e1')?.get('p1')?.note).toBe('');
      const full = await team.fullRatings();
      expect(full.get('e1')?.get('p1')?.note).toBe('Gut');
      expect(full.get('e1')?.get('p2')?.autoAbsence).toBe(true);
      expect(firebase.calls.filter((call) => call.startsWith('readAllRatings:e')).map((call) => call.split(':')[1].split(',').sort().join(','))).toEqual(['e1,e2']);
    });
  });

  describe('Neuberechnung und Prüfung', () => {
    it('Neuberechnung schreibt alle Zusammenfassungen, löscht verwaiste, setzt das Kennzeichen und prüft', async () => {
      const { stats, mode } = setup();
      firebase.playerStats.stats.set('alt', { playerId: 'alt', version: 1, events: {} });
      const result = await stats.rebuild();
      expect(firebase.calls).toContain('writeRebuild:p1,p2|alt');
      expect(result).toEqual({ players: 2, ratings: 3, differences: [] });
      expect(firebase.playerStats.marker?.['version']).toBe(PLAYER_STATS_VERSION);
      await vi.waitFor(() => expect(mode.state()).toBe('on'));
      expect(firebase.playerStats.stats.get('p1')?.['events']).toEqual({
        e1: { attendance: 'present', effort: 2, technique: 2, tactics: 3, comprehension: 1, minutes: null, goals: null, assists: null },
        e2: { attendance: 'limited', effort: 3, technique: 3, tactics: 3, comprehension: 3, minutes: 40, goals: 1, assists: null },
      });
    });

    it('Prüfung meldet Abweichungen (z. B. Bewertung ohne die App geändert) und schreibt nichts', async () => {
      const { stats } = setup();
      await stats.rebuild();
      firebase.ratings.ratings.get('e2')!.set('p2', { attendance: 'present', effort: 1, technique: 1, tactics: 1, comprehension: 1, playerId: 'p2' });
      const writes = firebase.calls.filter((call) => call.startsWith('writeRebuild')).length;
      const result = await stats.check();
      expect(result?.differences).toEqual([{ playerId: 'p2', eventId: 'e2' }]);
      expect(stats.result()).toBe(result);
      expect(firebase.calls.filter((call) => call.startsWith('writeRebuild')).length).toBe(writes);
    });

    it('nur für Trainer', async () => {
      const { stats } = setup({ role: 'player' });
      expect(await stats.rebuild()).toBeNull();
      expect(await stats.check()).toBeNull();
      expect(firebase.calls.filter((call) => call.startsWith('readAllRatings'))).toEqual([]);
    });

    it('Fehler beim Lesen: verständliche Meldung, nichts geschrieben', async () => {
      const { stats } = setup();
      firebase.playerStats.readAllRatings = () => Promise.reject({ code: 'permission-denied' });
      expect(await stats.rebuild()).toBeNull();
      expect(stats.error()).toContain('Die Neuberechnung ist fehlgeschlagen.');
      expect(firebase.calls.filter((call) => call.startsWith('writeRebuild'))).toEqual([]);
      expect(stats.busy()).toBe('idle');
    });
  });
});
