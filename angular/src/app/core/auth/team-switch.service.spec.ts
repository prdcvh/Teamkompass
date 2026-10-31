import { TestBed } from '@angular/core/testing';
import { TEAM_DATA_PREFIX } from '../device/local-data';
import { EventsService } from '../events/events.service';
import { SquadService } from '../player/squad.service';
import { CurrentTeam, LAST_TEAM_KEY } from '../team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { TeamSwitch } from './team-switch.service';

/** Teamwechsel ohne Neuladen (SCRUM-182): nichts vom alten Team bleibt sichtbar, es gilt die Rolle im neuen Team. */
describe('TeamSwitch – Teamwechsel ohne Neuladen', () => {
  let firebase: FakeFirebase;
  let auth: AuthService;
  let team: CurrentTeam;
  let session: SessionService;
  let switcher: TeamSwitch;

  const trainerA = { teamId: 'A', role: 'trainer', playerId: null, expiresAt: null };
  const parentB = { teamId: 'B', role: 'parent', playerId: 'p7', expiresAt: null };

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(LAST_TEAM_KEY, 'A');
    firebase = new FakeFirebase();
    firebase.teams.memberships.set('uid-1', [trainerA, parentB]);
    firebase.teams.metas.set('A', { name: 'SV Muster U11', label: 'U11', clubId: 'c1', clubName: 'SV Muster', logoUrl: null });
    firebase.teams.metas.set('B', { name: 'FC Beispiel U15', label: 'U15', clubId: 'c2', clubName: 'FC Beispiel', logoUrl: 'data:image/png;base64,AAAA' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    auth = TestBed.inject(AuthService);
    team = TestBed.inject(CurrentTeam);
    session = TestBed.inject(SessionService);
    switcher = TestBed.inject(TeamSwitch);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    await vi.waitFor(() => expect(team.title()).toBe('SV Muster · U11'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('wechselt ohne Neuladen ins andere Team, mit der Rolle dort, und merkt die Wahl', async () => {
    expect(team.id()).toBe('A');
    expect(session.role()).toBe('trainer');

    expect(await switcher.switchTo('B')).toBe(true);

    expect(auth.status()).toBe('ready');
    expect(team.id()).toBe('B');
    expect(session.role()).toBe('parent');
    expect(session.playerId()).toBe('p7');
    expect(session.uid()).toBe('uid-1');
    expect(localStorage.getItem(LAST_TEAM_KEY)).toBe('B');
    // Name und Logo des neuen Teams, nie die des alten.
    await vi.waitFor(() => expect(team.title()).toBe('FC Beispiel · U15'));
    expect(team.logoSrc()).toBe('data:image/png;base64,AAAA');
    // Zurück geht genauso – wieder als Trainer.
    expect(await switcher.switchTo('A')).toBe(true);
    expect(session.role()).toBe('trainer');
    expect(session.playerId()).toBeNull();
  });

  it('baut die Daten des alten Teams ab: Kader und Termine sind leer, Abos beendet, Browser-Teamdaten gelöscht', async () => {
    firebase.players.players.set('p1', { name: 'Spieler aus Team A', number: 7 });
    const squad = TestBed.inject(SquadService);
    const events = TestBed.inject(EventsService);
    squad.start();
    events.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.players().map((player) => player.name)).toEqual(['Spieler aus Team A']);
    expect(firebase.players.playerWatchers).toBe(1);
    localStorage.setItem(`${TEAM_DATA_PREFIX}entwurf`, 'Notiz aus Team A');

    const statuses: string[] = [];
    const setStatus = auth.status.set.bind(auth.status);
    vi.spyOn(auth.status, 'set').mockImplementation((value) => {
      statuses.push(value);
      setStatus(value);
    });
    const stop = vi.spyOn(squad, 'stop');
    expect(await switcher.switchTo('B')).toBe(true);

    // Erst „switching“ (Oberfläche weg, Rolle leer), dann das neue Team.
    expect(statuses).toEqual(['switching', 'ready']);
    // Der Kader wurde abgebaut, als die Rolle leer war – bevor das neue Team aufging.
    expect(stop).toHaveBeenCalled();
    expect(squad.players()).toEqual([]);
    expect(squad.load()).toBe('idle');
    expect(firebase.players.playerWatchers).toBe(0);
    expect(events.events()).toEqual([]);
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}entwurf`)).toBeNull();
    // Neu geladen wird erst, wenn eine Seite des neuen Teams es anfordert – dann mit der neuen Rolle (nur das eigene Kind).
    squad.start();
    expect(firebase.calls.filter((call) => call === 'watchPlayers').length).toBe(1);
  });

  it('prüft den Zugang frisch: inzwischen gesperrter Zugang öffnet nichts, das alte Team bleibt unverändert', async () => {
    firebase.teams.memberships.set('uid-1', [trainerA]);
    expect(await switcher.switchTo('B')).toBe(false);
    expect(auth.status()).toBe('ready');
    expect(team.id()).toBe('A');
    expect(session.role()).toBe('trainer');
    expect(auth.error()).toContain('keinen gültigen Zugang');
    // Die Auswahl zeigt das gesperrte Team nicht mehr.
    expect(team.choices().map((choice) => choice.teamId)).toEqual(['A']);
  });

  it('frisch geprüfte Rolle gilt: wurde man im Zielteam inzwischen Trainer, öffnet es als Trainer', async () => {
    firebase.teams.memberships.set('uid-1', [trainerA, { ...parentB, role: 'trainer', playerId: null }]);
    expect(await switcher.switchTo('B')).toBe(true);
    expect(session.role()).toBe('trainer');
    expect(session.playerId()).toBeNull();
  });

  it('wenn die Teamsuche fehlschlägt, bleibt man im alten Team (mit Hinweis)', async () => {
    firebase.teams.membershipsError = Object.assign(new Error('offline'), { code: 'unavailable' });
    firebase.access.memberErrors.set('uid-1', Object.assign(new Error('offline'), { code: 'unavailable' }));
    expect(await switcher.switchTo('B')).toBe(false);
    expect(team.id()).toBe('A');
    expect(session.role()).toBe('trainer');
    expect(auth.status()).toBe('ready');
  });

  it('gleiches Team oder nicht angemeldet: kein Wechsel', async () => {
    expect(await switcher.switchTo('A')).toBe(true);
    expect(session.role()).toBe('trainer');
    await auth.signOut();
    expect(await switcher.switchTo('B')).toBe(false);
    expect(auth.status()).toBe('signedOut');
  });

  it('Abmelden während des Wechsels gewinnt: danach ist niemand angemeldet und kein Team offen', async () => {
    const switched = switcher.switchTo('B');
    await auth.signOut();
    expect(await switched).toBe(false);
    expect(auth.status()).toBe('signedOut');
    expect(session.role()).toBeNull();
  });
});
