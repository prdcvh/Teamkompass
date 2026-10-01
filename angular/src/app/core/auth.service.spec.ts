import { TestBed } from '@angular/core/testing';
import { AuthService, displayNameFor } from './auth.service';
import { FirebaseService } from './firebase.service';
import { SessionService } from './session.service';
import { TEAM_DATA_PREFIX } from './local-data';
import { FakeFirebase } from './testing';

describe('AuthService', () => {
  let firebase: FakeFirebase;
  let auth: AuthService;
  let session: SessionService;

  function setup(): void {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    auth = TestBed.inject(AuthService);
    session = TestBed.inject(SessionService);
  }

  const soon = new Date(Date.now() + 86_400_000);

  beforeEach(() => {
    setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('zeigt nichts, solange der Anmeldezustand nicht feststeht', () => {
    auth.start(0);
    expect(auth.status()).toBe('loading');
    expect(session.role()).toBeNull();
  });

  it('ist ohne Anmeldung ausgeloggt und leert lokale Teamdaten', async () => {
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    auth.start(0);
    firebase.emit(null);
    await auth.whenResolved();
    expect(auth.status()).toBe('signedOut');
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
  });

  it('bleibt gesperrt, wenn Firebase nicht erreichbar ist', async () => {
    firebase.watchError = new Error('offline');
    auth.start(0);
    await auth.whenResolved();
    expect(auth.status()).toBe('unavailable');
    expect(auth.error()).toContain('keine Teamdaten');
  });

  it('meldet einen Trainer mit seiner Rolle an', async () => {
    firebase.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer(' coach@verein.de ', 'geheim');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(firebase.calls).toContain('email:coach@verein.de');
    expect(session.role()).toBe('trainer');
    expect(session.displayName()).toBe('coach');
  });

  it('zeigt bei falschem Passwort eine verständliche Meldung', async () => {
    firebase.emailError = { code: 'auth/invalid-credential' };
    auth.start(0);
    await auth.signInTrainer('a@b.de', 'x');
    expect(auth.error()).toBe('E-Mail oder Passwort ist falsch.');
    expect(auth.status()).toBe('loading');
    expect(auth.busy()).toBe(false);
  });

  it('weist ein Konto ohne members-Dokument ab und meldet es wieder ab', async () => {
    auth.start(0);
    await auth.signInTrainer('a@b.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('signedOut'));
    expect(auth.error()).toContain('Kein Zugang');
    expect(firebase.calls).toContain('signOut');
    expect(session.role()).toBeNull();
  });

  describe('Einladungscode', () => {
    beforeEach(() => {
      firebase.invites.set('abc', { role: 'player', playerId: 'p1', expiresAt: null, expiresAtRaw: null });
      auth.start(0);
    });

    it('legt den Zugang an, verbraucht den Code und meldet den Spieler an', async () => {
      await auth.signInWithCode(' abc ');
      expect(auth.status()).toBe('ready');
      expect(session.role()).toBe('player');
      expect(session.playerId()).toBe('p1');
      expect(firebase.invites.has('abc')).toBe(false);
    });

    it('lehnt unbekannte Codes ab und räumt das anonyme Konto weg', async () => {
      await auth.signInWithCode('falsch');
      expect(auth.error()).toBe('Dieser Code ist ungültig.');
      expect(firebase.calls).toContain('signOut');
      expect(auth.status()).not.toBe('ready');
    });

    it('lehnt abgelaufene Codes ab', async () => {
      firebase.invites.set('alt', { role: 'parent', playerId: 'p2', expiresAt: new Date(Date.now() - 1000) });
      await auth.signInWithCode('alt');
      expect(auth.error()).toBe('Dieser Code ist abgelaufen.');
      expect(firebase.members.size).toBe(0);
    });

    it('verlangt einen Code', async () => {
      await auth.signInWithCode('   ');
      expect(auth.error()).toBe('Bitte den Einladungscode eingeben.');
      expect(firebase.calls).not.toContain('anonymous');
    });

    it('versucht es nach permission-denied einmal erneut', async () => {
      firebase.claimErrors = [{ code: 'permission-denied' }];
      await auth.signInWithCode('abc');
      expect(firebase.calls.filter((call) => call === 'claim:abc')).toHaveLength(2);
      expect(auth.status()).toBe('ready');
    });

    it('gibt nach zwei permission-denied auf', async () => {
      firebase.claimErrors = [{ code: 'permission-denied' }, { code: 'permission-denied' }];
      await auth.signInWithCode('abc');
      expect(auth.status()).not.toBe('ready');
      expect(auth.error()).toContain('Zugang konnte nicht angelegt werden');
    });

    it('ignoriert einen zweiten, gleichzeitigen Absendevorgang (Doppel-Tap)', async () => {
      await Promise.all([auth.signInWithCode('abc'), auth.signInWithCode('abc')]);
      expect(firebase.calls.filter((call) => call === 'anonymous')).toHaveLength(1);
    });
  });

  it('Abmelden leert Sitzung und lokale Daten', async () => {
    firebase.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    await auth.signOut();
    expect(auth.status()).toBe('signedOut');
    expect(session.role()).toBeNull();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
  });

  it('bildet Anzeigenamen je Rolle', () => {
    expect(displayNameFor('trainer', 'coach@verein.de')).toBe('coach');
    expect(displayNameFor('player', null)).toBe('Spieler');
    expect(displayNameFor('parent', null)).toBe('Eltern');
    expect(displayNameFor('medical', null)).toBe('Medizin');
    expect(soon.getTime()).toBeGreaterThan(Date.now());
  });
});
