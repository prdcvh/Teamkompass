import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

/** Spieler-Konto mit Einladungscode + E-Mail/Passwort (SCRUM-114): Registrierung, anderes Gerät, Sperre, Ablauf. */
describe('AuthService – Spieler-Konto mit E-Mail (SCRUM-114)', () => {
  let firebase: FakeFirebase;
  let auth: AuthService;
  let session: SessionService;
  const soon = new Date(Date.now() + 86_400_000);

  beforeEach(() => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    auth = TestBed.inject(AuthService);
    session = TestBed.inject(SessionService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const account = { email: ' kind@familie.de ', password: 'Sicher-Passwort-1' };

  beforeEach(() => {
    firebase.access.invites.set('abc', { role: 'player', playerId: 'p1', expiresAt: null, expiresAtRaw: null });
    auth.start(0);
  });

  it('löst den Code ein, verbindet danach E-Mail und Passwort und behält die Benutzer-ID', async () => {
    await auth.signInWithCode('abc', account);
    const claim = firebase.calls.indexOf('claim:abc');
    const link = firebase.calls.indexOf('link:uid-1:kind@familie.de:Sicher-Passwort-1');
    expect(claim).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(claim);
    expect(auth.status()).toBe('ready');
    expect(session.uid()).toBe('uid-1');
    expect(session.email()).toBe('kind@familie.de');
    expect(session.role()).toBe('player');
    expect(session.playerId()).toBe('p1');
    expect(firebase.access.invites.has('abc')).toBe(false);
    expect(auth.notice()).toBe('');
  });

  it('lässt den Zugang bestehen, wenn das Verbinden scheitert, und sagt es deutlich', async () => {
    firebase.auth.linkError = { code: 'auth/email-already-in-use' };
    await auth.signInWithCode('abc', account);
    expect(auth.status()).toBe('ready');
    expect(session.role()).toBe('player');
    expect(session.email()).toBeNull();
    expect(auth.notice()).toContain('Zugang ist angelegt');
    expect(auth.notice()).toContain('bereits verwendet');
    expect(firebase.access.invites.has('abc')).toBe(false);
  });

  it('verbindet nichts, wenn der Code ungültig ist', async () => {
    await auth.signInWithCode('falsch', account);
    expect(auth.error()).toBe('Dieser Code ist ungültig.');
    expect(firebase.calls.some((call) => call.startsWith('link:'))).toBe(false);
  });

  it('verbindet nichts, wenn der Zugang nicht angelegt werden konnte', async () => {
    firebase.access.claimErrors = [{ code: 'unavailable' }];
    await auth.signInWithCode('abc', account);
    expect(auth.status()).not.toBe('ready');
    expect(firebase.calls.some((call) => call.startsWith('link:'))).toBe(false);
  });

  it('öffnet auf einem anderen Gerät per E-Mail-Anmeldung dasselbe Spielerprofil', async () => {
    firebase.access.members.set('uid-1', { role: 'player', playerId: 'p1' });
    await auth.signInTrainer('kind@familie.de', 'Sicher-Passwort-1');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(session.role()).toBe('player');
    expect(session.playerId()).toBe('p1');
    expect(session.displayName()).toBe('Spieler');
  });

  it('lässt einen gesperrten Zugang (members-Dokument gelöscht) per E-Mail nicht mehr hinein', async () => {
    await auth.signInTrainer('kind@familie.de', 'Sicher-Passwort-1');
    await vi.waitFor(() => expect(auth.status()).toBe('signedOut'));
    expect(session.role()).toBeNull();
    expect(firebase.calls).toContain('signOut');
    expect(auth.error()).toContain('gesperrt oder abgelaufen');
  });

  it('lässt einen abgelaufenen befristeten Zugang per E-Mail nicht mehr hinein', async () => {
    firebase.access.members.set('uid-1', { role: 'player', playerId: 'p1', expiresAt: new Date(Date.now() - 1000) });
    await auth.signInTrainer('kind@familie.de', 'Sicher-Passwort-1');
    await vi.waitFor(() => expect(auth.status()).toBe('signedOut'));
    expect(session.role()).toBeNull();
    expect(session.playerId()).toBeNull();
    expect(firebase.calls).toContain('signOut');
  });

  it('lässt einen noch gültigen befristeten Zugang hinein', async () => {
    firebase.access.members.set('uid-1', { role: 'player', playerId: 'p1', expiresAt: soon });
    await auth.signInTrainer('kind@familie.de', 'Sicher-Passwort-1');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(session.playerId()).toBe('p1');
  });

  it('vergisst den Hinweis beim Abmelden', async () => {
    firebase.auth.linkError = { code: 'auth/network-request-failed' };
    await auth.signInWithCode('abc', account);
    expect(auth.notice()).not.toBe('');
    await auth.signOut();
    expect(auth.notice()).toBe('');
  });
});
