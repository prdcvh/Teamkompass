import { TestBed } from '@angular/core/testing';
import { AuthService, displayNameFor } from './auth.service';
import { SessionService } from './session.service';
import { TEAM_DATA_PREFIX } from '../device/local-data';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('AuthService', () => {
  let firebase: FakeFirebase;
  let auth: AuthService;
  let session: SessionService;

  function setup(): void {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
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
    firebase.auth.emit(null);
    await auth.whenResolved();
    expect(auth.status()).toBe('signedOut');
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
  });

  it('bleibt gesperrt, wenn Firebase nicht erreichbar ist', async () => {
    firebase.auth.watchError = new Error('offline');
    auth.start(0);
    await auth.whenResolved();
    expect(auth.status()).toBe('unavailable');
    expect(auth.error()).toContain('keine Teamdaten');
  });

  it('meldet einen Trainer mit seiner Rolle an', async () => {
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer(' coach@verein.de ', 'geheim');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    expect(firebase.calls).toContain('email:coach@verein.de');
    expect(session.role()).toBe('trainer');
    expect(session.displayName()).toBe('coach');
  });

  it('zeigt bei falschem Passwort eine verständliche Meldung', async () => {
    firebase.auth.emailError = { code: 'auth/invalid-credential' };
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
    expect(auth.error()).toContain('kein Zugang hinterlegt');
    expect(auth.error()).not.toMatch(/uid-|teams\/|members/);
    expect(firebase.calls).toContain('signOut');
    expect(session.role()).toBeNull();
  });

  describe('Einladungscode', () => {
    beforeEach(() => {
      firebase.access.invites.set('abc', { role: 'player', playerId: 'p1', expiresAt: null, expiresAtRaw: null });
      auth.start(0);
    });

    it('legt den Zugang an, verbraucht den Code und meldet den Spieler an', async () => {
      await auth.signInWithCode(' abc ');
      expect(auth.status()).toBe('ready');
      expect(session.role()).toBe('player');
      expect(session.playerId()).toBe('p1');
      expect(firebase.access.invites.has('abc')).toBe(false);
    });

    it('lehnt unbekannte Codes ab und räumt das anonyme Konto weg', async () => {
      await auth.signInWithCode('falsch');
      expect(auth.error()).toBe('Dieser Code ist ungültig.');
      expect(firebase.calls).toContain('signOut');
      expect(auth.status()).not.toBe('ready');
    });

    it('lehnt abgelaufene Codes ab', async () => {
      firebase.access.invites.set('alt', { role: 'parent', playerId: 'p2', expiresAt: new Date(Date.now() - 1000) });
      await auth.signInWithCode('alt');
      expect(auth.error()).toBe('Dieser Code ist abgelaufen.');
      expect(firebase.access.members.size).toBe(0);
    });

    it('verlangt einen Code', async () => {
      await auth.signInWithCode('   ');
      expect(auth.error()).toBe('Bitte den Einladungscode eingeben.');
      expect(firebase.calls).not.toContain('anonymous');
    });

    it('versucht es nach permission-denied einmal erneut', async () => {
      firebase.access.claimErrors = [{ code: 'permission-denied' }];
      await auth.signInWithCode('abc');
      expect(firebase.calls.filter((call) => call === 'claim:abc')).toHaveLength(2);
      expect(auth.status()).toBe('ready');
    });

    it('gibt nach zwei permission-denied auf', async () => {
      firebase.access.claimErrors = [{ code: 'permission-denied' }, { code: 'permission-denied' }];
      await auth.signInWithCode('abc');
      expect(auth.status()).not.toBe('ready');
      expect(auth.error()).toContain('Zugang konnte nicht angelegt werden');
    });

    it('ignoriert einen zweiten, gleichzeitigen Absendevorgang (Doppel-Tap)', async () => {
      await Promise.all([auth.signInWithCode('abc'), auth.signInWithCode('abc')]);
      expect(firebase.calls.filter((call) => call === 'anonymous')).toHaveLength(1);
    });
  });

  describe('Anmeldung und Prüfung des Zugangs', () => {
    /** Ein Gate, das der Test selbst öffnet: die Antwort von readMember kommt erst dann. */
    const gate = () => {
      let open!: () => void;
      const promise = new Promise<void>((resolve) => (open = resolve));
      return { promise, open };
    };
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    it('SCRUM-87: ein einziger Anmelde-Aufruf liefert den fertigen Zustand (kein zweiter Klick nötig)', async () => {
      firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
      auth.start(0);
      await auth.signInTrainer('coach@verein.de', 'geheim');
      expect(auth.status()).toBe('ready');
      expect(session.role()).toBe('trainer');
    });

    it('SCRUM-87: bleibt im Ladezustand, solange der Zugang geprüft wird', async () => {
      const held = gate();
      firebase.access.memberGates.set('uid-1', held.promise);
      firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
      auth.start(0);
      const done = auth.signInTrainer('coach@verein.de', 'geheim');
      await tick();
      expect(auth.busy()).toBe(true);
      expect(auth.status()).not.toBe('ready');
      held.open();
      await done;
      expect(auth.busy()).toBe(false);
      expect(auth.status()).toBe('ready');
    });

    it('SCRUM-87: meldet fehlenden Zugang nach dem ersten Versuch mit Fehlermeldung', async () => {
      auth.start(0);
      await auth.signInTrainer('a@b.de', 'x');
      expect(auth.status()).toBe('signedOut');
      expect(auth.error()).toContain('kein Zugang hinterlegt');
      expect(auth.error()).not.toMatch(/uid-|teams\/|members/);
    });

    it('SCRUM-88: eine verspätete Rollenprüfung stellt nach dem Abmelden nichts wieder her', async () => {
      const held = gate();
      firebase.access.memberGates.set('uid-1', held.promise);
      firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
      auth.start(0);
      firebase.auth.emit({ uid: 'uid-1', isAnonymous: false, email: 'coach@verein.de' });
      await tick();
      await auth.signOut();
      held.open();
      await tick();
      await tick();
      expect(auth.status()).toBe('signedOut');
      expect(session.role()).toBeNull();
      expect(session.displayName()).not.toBe('coach');
    });

    it('SCRUM-88: bei Identitätswechsel überschreibt die ältere Antwort die neue Rolle nicht', async () => {
      const held = gate();
      firebase.access.memberGates.set('uid-a', held.promise);
      firebase.access.members.set('uid-a', { role: 'trainer', playerId: null });
      firebase.access.members.set('uid-b', { role: 'player', playerId: 'p1' });
      auth.start(0);
      firebase.auth.emit({ uid: 'uid-a', isAnonymous: false, email: 'a@verein.de' });
      firebase.auth.emit({ uid: 'uid-b', isAnonymous: false, email: null });
      await tick();
      await tick();
      expect(session.role()).toBe('player');
      held.open();
      await tick();
      await tick();
      expect(session.role()).toBe('player');
      expect(session.playerId()).toBe('p1');
      expect(auth.status()).toBe('ready');
    });

    it('SCRUM-88: auch ein verspäteter Fehler einer früheren Prüfung beeinflusst die aktuelle Sitzung nicht', async () => {
      const held = gate();
      firebase.access.memberGates.set('uid-a', held.promise);
      firebase.access.memberErrors.set('uid-a', { code: 'permission-denied' });
      firebase.access.members.set('uid-b', { role: 'trainer', playerId: null });
      auth.start(0);
      firebase.auth.emit({ uid: 'uid-a', isAnonymous: false, email: 'a@verein.de' });
      firebase.auth.emit({ uid: 'uid-b', isAnonymous: false, email: 'b@verein.de' });
      await tick();
      await tick();
      expect(auth.status()).toBe('ready');
      held.open();
      await tick();
      await tick();
      expect(auth.status()).toBe('ready');
      expect(auth.error()).toBe('');
      expect(session.role()).toBe('trainer');
    });

    it('SCRUM-88: nach Abmelden und erneuter Anmeldung desselben Kontos wird der Zugang neu geprüft', async () => {
      firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
      auth.start(0);
      await auth.signInTrainer('coach@verein.de', 'x');
      await auth.signOut();
      expect(auth.status()).toBe('signedOut');
      firebase.access.members.set('uid-1', { role: 'physio', playerId: null });
      await auth.signInTrainer('coach@verein.de', 'x');
      expect(session.role()).toBe('physio');
    });

    it('SCRUM-170: bisherige Scout-Konten („medical“) werden zu Scouts, nicht zu Medizin', async () => {
      firebase.access.members.set('uid-1', { role: 'scout', playerId: null });
      auth.start(0);
      await auth.signInTrainer('scout@verein.de', 'x');
      expect(session.role()).toBe('scout');
      expect(session.displayName()).toBe('scout');
    });
  });

  it('Abmelden leert Sitzung und lokale Daten', async () => {
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    localStorage.setItem(`${TEAM_DATA_PREFIX}players`, '[]');
    await auth.signOut();
    expect(auth.status()).toBe('signedOut');
    expect(session.role()).toBeNull();
    expect(localStorage.getItem(`${TEAM_DATA_PREFIX}players`)).toBeNull();
  });

  it('SCRUM-199: Abmelden leert den lokalen Firestore-Speicher, bevor es weitergeht', async () => {
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    const before = firebase.auth.cacheClears;
    await auth.signOut();
    expect(firebase.auth.cacheClears).toBeGreaterThan(before);
    expect(firebase.calls.lastIndexOf('clearLocalCache')).toBeGreaterThan(firebase.calls.lastIndexOf('signOut'));
  });

  it('SCRUM-199: ohne Anmeldung (z. B. Abmeldung in anderem Tab) wird der Speicher ebenfalls geleert', async () => {
    auth.start(0);
    firebase.auth.emit(null);
    await auth.whenResolved();
    await vi.waitFor(() => expect(firebase.auth.cacheClears).toBe(1));
  });

  it('SCRUM-199: ein Fehler beim Leeren hält das Abmelden nicht auf', async () => {
    firebase.access.members.set('uid-1', { role: 'trainer', playerId: null });
    firebase.auth.clearLocalCache = async () => {
      throw new Error('indexeddb gesperrt');
    };
    auth.start(0);
    await auth.signInTrainer('coach@verein.de', 'x');
    await vi.waitFor(() => expect(auth.status()).toBe('ready'));
    await auth.signOut();
    expect(auth.status()).toBe('signedOut');
    expect(session.role()).toBeNull();
  });

  it('bildet Anzeigenamen je Rolle', () => {
    expect(displayNameFor('trainer', 'coach@verein.de')).toBe('coach');
    expect(displayNameFor('player', null)).toBe('Spieler');
    expect(displayNameFor('parent', null)).toBe('Eltern');
    expect(displayNameFor('physio', null)).toBe('Medizin');
    expect(displayNameFor('scout', null)).toBe('Scout');
    expect(soon.getTime()).toBeGreaterThan(Date.now());
  });
});
