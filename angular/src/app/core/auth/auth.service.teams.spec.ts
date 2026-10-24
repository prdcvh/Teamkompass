import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { CurrentTeam, LAST_TEAM_KEY } from '../team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/** „Meine Teams“ statt festem Team im Build (SCRUM-181). */
describe('AuthService – Teams aus der Datenbank', () => {
  let firebase: FakeFirebase;
  let auth: AuthService;
  let team: CurrentTeam;
  let session: SessionService;

  beforeEach(() => {
    localStorage.removeItem(LAST_TEAM_KEY);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    auth = TestBed.inject(AuthService);
    team = TestBed.inject(CurrentTeam);
    session = TestBed.inject(SessionService);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const trainer = (teamId: string, expiresAt: Date | null = null) => ({ teamId, role: 'trainer', playerId: null, expiresAt });

  it('ohne Teamsuche (vor dem Skript) bleibt alles wie bisher: Team des Builds', async () => {
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(team.id()).toBe(environment.teamId);
    expect(team.name()).toBe(environment.teamName);
  });

  it('auch wenn die Teamsuche fehlschlägt (Regeln noch alt), gilt das Team des Builds', async () => {
    firebase.teams.membershipsError = Object.assign(new Error('denied'), { code: 'permission-denied' });
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(team.id()).toBe(environment.teamId);
  });

  it('genau ein Team aus der Datenbank: direkt hinein, mit Name und Verein aus der Datenbank', async () => {
    firebase.teams.memberships.set('uid-1', [trainer('Team0000000000000001')]);
    firebase.teams.metas.set('Team0000000000000001', { name: 'SV Muster U11', label: 'U11', clubId: 'c1', clubName: 'SV Muster', logoUrl: null });
    auth.start(0);
    await auth.signInTrainer('neu@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(team.id()).toBe('Team0000000000000001');
    await vi.waitFor(() => expect(team.title()).toBe('SV Muster · U11'));
    expect(session.role()).toBe('trainer');
  });

  it('mehrere Teams: erst die Auswahl, dann das gewählte Team mit der Rolle dort', async () => {
    firebase.teams.memberships.set('uid-1', [trainer('A'), { teamId: 'B', role: 'parent', playerId: 'p7', expiresAt: null }]);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('chooseTeam'));
    expect(session.role()).toBeNull();
    expect(team.choices().map((choice) => choice.teamId)).toEqual(['A', 'B']);
    expect(auth.chooseTeam('B')).toBe(true);
    expect(auth.status()).toBe('ready');
    expect(team.id()).toBe('B');
    expect(session.role()).toBe('parent');
    expect(session.playerId()).toBe('p7');
    expect(localStorage.getItem(LAST_TEAM_KEY)).toBe('B');
  });

  it('mehrere Teams mit gemerkter Wahl: direkt ins gemerkte Team', async () => {
    localStorage.setItem(LAST_TEAM_KEY, 'B');
    firebase.teams.memberships.set('uid-1', [trainer('A'), trainer('B')]);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(team.id()).toBe('B');
    expect(team.choices().length).toBe(2);
  });

  it('abgelaufene Zugänge zählen nicht: mit nur noch einem gültigen Team keine Auswahl', async () => {
    firebase.teams.memberships.set('uid-1', [trainer('A'), trainer('B', new Date(Date.now() - 1000))]);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(team.id()).toBe('A');
    expect(team.choices().map((choice) => choice.teamId)).toEqual(['A']);
  });

  it('ohne irgendeinen Zugang: abgemeldet mit Hinweis', async () => {
    auth.start(0);
    await auth.signInTrainer('fremd@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('signedOut'));
    expect(auth.error()).toContain('keinen gültigen Zugang');
  });

  it('beim Abmelden geht es zurück zum Team des Builds', async () => {
    firebase.teams.memberships.set('uid-1', [trainer('A')]);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(team.id()).toBe('A'));
    await auth.signOut();
    expect(team.id()).toBe(environment.teamId);
    expect(team.choices()).toEqual([]);
  });

  it('Teamauswahl ist außerhalb des Auswahl-Zustands nur ein Merken (Wechsel lädt die Seite neu)', async () => {
    firebase.teams.memberships.set('uid-1', [trainer('A')]);
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(auth.chooseTeam('B')).toBe(false);
    expect(team.id()).toBe('A');
    expect(localStorage.getItem(LAST_TEAM_KEY)).toBe('B');
  });
});
