import { TestBed } from '@angular/core/testing';
import { AccountService } from './account.service';
import { SessionService } from './session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('AccountService', () => {
  let firebase: FakeFirebase;
  let account: AccountService;

  beforeEach(() => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    account = TestBed.inject(AccountService);
  });

  describe('requestReset', () => {
    it('schickt die Mail an die bereinigte Adresse', async () => {
      expect(await account.requestReset(' trainer@verein.de ')).toEqual({ ok: true });
      expect(firebase.calls).toContain('reset:trainer@verein.de');
    });

    it('prüft die Adresse, bevor etwas gesendet wird', async () => {
      expect(await account.requestReset('kein-at')).toEqual({ ok: false, message: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      expect(firebase.calls.some((call) => call.startsWith('reset:'))).toBe(false);
    });

    it('verrät nicht, ob ein Konto existiert', async () => {
      firebase.auth.resetError = { code: 'auth/user-not-found' };
      expect(await account.requestReset('unbekannt@verein.de')).toEqual({ ok: true });
    });

    it('meldet andere Fehler verständlich', async () => {
      firebase.auth.resetError = { code: 'auth/too-many-requests' };
      expect(await account.requestReset('a@b.de')).toEqual({ ok: false, message: 'Zu viele Versuche. Bitte kurz warten und dann erneut versuchen.' });
    });
  });

  describe('changePassword', () => {
    it('ändert das Passwort mit bestätigtem aktuellem Passwort', async () => {
      expect(await account.changePassword('AltesPasswort1', 'NeuesPasswort1', 'NeuesPasswort1')).toEqual({ ok: true });
      expect(firebase.calls).toContain('changePassword:AltesPasswort1:NeuesPasswort1');
    });

    it('lehnt schwache, abweichende und unveränderte Passwörter ab, ohne Firebase zu fragen', async () => {
      expect(await account.changePassword('', 'NeuesPasswort1', 'NeuesPasswort1')).toMatchObject({ ok: false });
      expect(await account.changePassword('Alt', 'kurz1A', 'kurz1A')).toMatchObject({ ok: false, message: expect.stringContaining('mindestens 12') });
      expect(await account.changePassword('Alt', 'NeuesPasswort1', 'NeuesPasswort2')).toMatchObject({ ok: false, message: expect.stringContaining('stimmen nicht überein') });
      expect(await account.changePassword('GleichesPasswort1', 'GleichesPasswort1', 'GleichesPasswort1')).toMatchObject({ ok: false, message: expect.stringContaining('unterscheiden') });
      expect(firebase.calls.some((call) => call.startsWith('changePassword'))).toBe(false);
    });

    it('meldet ein falsches aktuelles Passwort', async () => {
      firebase.auth.changePasswordError = { code: 'auth/invalid-credential' };
      expect(await account.changePassword('Falsch', 'NeuesPasswort1', 'NeuesPasswort1')).toEqual({ ok: false, message: 'Das aktuelle Passwort ist falsch.' });
    });

    it('verlangt bei abgelaufener Anmeldung eine neue Anmeldung', async () => {
      firebase.auth.changePasswordError = { code: 'auth/requires-recent-login' };
      expect(await account.changePassword('Alt', 'NeuesPasswort1', 'NeuesPasswort1')).toEqual({ ok: false, message: 'Bitte melde dich neu an und versuche es dann erneut.' });
    });
  });

  describe('connectEmail (SCRUM-114)', () => {
    let session: SessionService;
    const good = 'Sicher-Passwort-1';

    beforeEach(() => {
      session = TestBed.inject(SessionService);
      session.uid.set('anon-1');
      session.role.set('player');
      session.playerId.set('p1');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('verbindet den Code-Zugang mit E-Mail und Passwort und zeigt danach die E-Mail', async () => {
      expect(await account.connectEmail(' kind@familie.de ', good, good)).toEqual({ ok: true });
      expect(firebase.calls).toContain(`link:anon-1:kind@familie.de:${good}`);
      expect(session.email()).toBe('kind@familie.de');
      expect(session.role()).toBe('player');
      expect(session.playerId()).toBe('p1');
    });

    it('prüft E-Mail, Passwortregel und Wiederholung, bevor etwas verbunden wird', async () => {
      expect(await account.connectEmail('kein-at', good, good)).toMatchObject({ ok: false, message: expect.stringContaining('gültige E-Mail') });
      expect(await account.connectEmail('a@b.de', 'kurz', 'kurz')).toMatchObject({ ok: false, message: expect.stringContaining('12 Zeichen') });
      expect(await account.connectEmail('a@b.de', good, good + 'x')).toMatchObject({ ok: false, message: expect.stringContaining('stimmen nicht') });
      expect(firebase.calls.some((call) => call.startsWith('link:'))).toBe(false);
    });

    it('nur für Spieler-Zugänge ohne E-Mail', async () => {
      session.role.set('trainer');
      expect(await account.connectEmail('a@b.de', good, good)).toMatchObject({ ok: false });
      session.role.set('player');
      session.email.set('schon@da.de');
      expect(await account.connectEmail('a@b.de', good, good)).toMatchObject({ ok: false, message: expect.stringContaining('schon') });
      expect(firebase.calls.some((call) => call.startsWith('link:'))).toBe(false);
    });

    it('meldet eine bereits vergebene E-Mail verständlich und lässt den Zugang unverändert', async () => {
      firebase.auth.linkError = { code: 'auth/email-already-in-use' };
      expect(await account.connectEmail('a@b.de', good, good)).toEqual({ ok: false, message: 'Diese E-Mail wird bereits verwendet.' });
      expect(session.email()).toBeNull();
      expect(session.role()).toBe('player');
    });
  });
});
