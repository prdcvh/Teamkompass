import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { CurrentTeam, LAST_TEAM_KEY } from '../team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import type { ClubInvite } from './registration';
import { RegistrationService } from './registration.service';

const CODE = 'ABCDEFGHJKLMNPQR';
const invite = (extra: Partial<ClubInvite> = {}): ClubInvite => ({
  code: CODE,
  kind: 'club',
  clubId: 'Club0000000000000001',
  teamId: 'Team0000000000000001',
  expiresAt: new Date(Date.now() + 86_400_000),
  email: null,
  ...extra,
});
const account = { code: 'abcd-efgh-jklm-npqr', email: 'neu@verein.de', password: 'Sicher12345678', repeat: 'Sicher12345678' };
const team = { clubName: 'SV Muster', ageGroup: 'U11', teamName: 'SV Muster U11' };

describe('RegistrationService', () => {
  let firebase: FakeFirebase;
  let reg: RegistrationService;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.removeItem(LAST_TEAM_KEY);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    auth = TestBed.inject(AuthService);
    reg = TestBed.inject(RegistrationService);
    auth.start(0);
    firebase.auth.emit(null);
    await auth.whenResolved();
    reg.begin('https://app.example');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('legt das Konto an, schickt die Bestätigungsmail mit Rücksprung und meldet das neue Konto NICHT gleich wieder ab', async () => {
    await reg.createAccount(account);
    expect(reg.step()).toBe('verify');
    expect(firebase.registration.calls).toContain(`create:neu@verein.de:https://app.example/registrieren?code=${CODE}&weiter=1`);
    expect(firebase.calls).not.toContain('signOut');
    expect(auth.status()).toBe('signedOut');
  });

  it('lehnt ungültige Eingaben ab, ohne ein Konto anzulegen', async () => {
    await reg.createAccount({ ...account, code: 'falsch', password: 'kurz', repeat: 'kurz' });
    expect(reg.step()).toBe('account');
    expect(reg.accountErrors().code).toBeTruthy();
    expect(reg.accountErrors().password).toBeTruthy();
    expect(firebase.registration.calls).toEqual([]);
  });

  it('geht ohne bestätigte E-Mail nicht weiter', async () => {
    firebase.registration.invites.set(CODE, invite());
    await reg.createAccount(account);
    await reg.checkVerified();
    expect(reg.step()).toBe('verify');
    expect(reg.error()).toContain('noch nicht bestätigt');
    expect(firebase.registration.calls).not.toContain(`invite:${CODE}`);
  });

  it('Vereinscode: nach Bestätigung Verein und Team anlegen, danach direkt im neuen Team als Trainer', async () => {
    firebase.registration.invites.set(CODE, invite());
    firebase.teams.memberships.set('new-coach', [{ teamId: 'Team0000000000000001', role: 'trainer', playerId: null, expiresAt: null }]);
    await reg.createAccount(account);
    firebase.registration.verified = true;
    await reg.checkVerified();
    expect(reg.step()).toBe('team');
    expect(reg.invite()?.kind).toBe('club');
    expect(await reg.createTeam(team)).toBe(true);
    const writes = firebase.registration.committed[0];
    expect(writes[0]).toEqual({ kind: 'delete', path: ['clubInvites', CODE] });
    expect(writes.map((write) => write.path.join('/'))).toContain('clubs/Club0000000000000001/admins/new-coach');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(TestBed.inject(SessionService).role()).toBe('trainer');
    expect(TestBed.inject(CurrentTeam).id()).toBe('Team0000000000000001');
    expect(localStorage.getItem(LAST_TEAM_KEY)).toBe('Team0000000000000001');
  });

  it('Beitrittscode: zeigt den Vereinsnamen und legt nur das Team an', async () => {
    firebase.registration.invites.set(CODE, invite({ kind: 'team', clubId: 'fc-x' }));
    firebase.registration.clubNames.set('fc-x', 'FC X');
    firebase.registration.verified = true;
    await reg.createAccount(account);
    await reg.checkVerified();
    expect(reg.clubName()).toBe('FC X');
    expect(await reg.createTeam({ ...team, clubName: '' })).toBe(true);
    expect(firebase.registration.committed[0].map((write) => write.path[0])).toEqual(['clubInvites', 'teams', 'teams']);
  });

  it('meldet benutzte, abgelaufene oder fremd gebundene Codes verständlich und bleibt im ersten Schritt', async () => {
    firebase.registration.verified = true;
    await reg.createAccount(account);
    await reg.checkVerified();
    expect(reg.step()).toBe('account');
    expect(reg.error()).toContain('gibt es nicht');

    firebase.registration.invites.set(CODE, invite({ email: 'chef@verein.de' }));
    await reg.checkVerified();
    expect(reg.error()).toContain('andere E-Mail');

    firebase.registration.invites.set(CODE, invite({ expiresAt: new Date(Date.now() - 1000) }));
    await reg.checkVerified();
    expect(reg.error()).toContain('abgelaufen');
  });

  it('verweigern die Regeln das Anlegen, gibt es eine klare Meldung und kein Team', async () => {
    firebase.registration.invites.set(CODE, invite());
    firebase.registration.verified = true;
    await reg.createAccount(account);
    await reg.checkVerified();
    firebase.registration.commitError = Object.assign(new Error('denied'), { code: 'permission-denied' });
    expect(await reg.createTeam(team)).toBe(false);
    expect(reg.error()).toContain('Code ist inzwischen benutzt');
    expect(reg.step()).toBe('team');
    expect(auth.status()).toBe('signedOut');
  });

  it('bestehendes Konto: anmelden und mit bestätigter E-Mail direkt zum Team-Schritt', async () => {
    firebase.registration.invites.set(CODE, invite());
    firebase.registration.verified = true;
    await reg.signIn({ code: CODE, email: 'neu@verein.de', password: 'egal' });
    expect(reg.step()).toBe('verify');
    await reg.checkVerified();
    expect(reg.step()).toBe('team');
    // Die Anmeldung allein meldet das teamlose Konto nicht ab.
    expect(firebase.calls.filter((call) => call === 'signOut')).toEqual([]);
  });

  it('Seite verlassen ohne fertige Registrierung meldet das angefangene Konto ab', async () => {
    await reg.createAccount(account);
    await reg.leave();
    expect(firebase.calls).toContain('signOut');
  });
});
