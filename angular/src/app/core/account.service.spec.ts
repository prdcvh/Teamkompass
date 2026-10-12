import { TestBed } from '@angular/core/testing';
import { AccountService } from './account.service';
import { FirebaseService } from './firebase.service';
import { FakeFirebase } from './testing';

describe('AccountService', () => {
  let firebase: FakeFirebase;
  let account: AccountService;

  beforeEach(() => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
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
      firebase.resetError = { code: 'auth/user-not-found' };
      expect(await account.requestReset('unbekannt@verein.de')).toEqual({ ok: true });
    });

    it('meldet andere Fehler verständlich', async () => {
      firebase.resetError = { code: 'auth/too-many-requests' };
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
      firebase.changePasswordError = { code: 'auth/invalid-credential' };
      expect(await account.changePassword('Falsch', 'NeuesPasswort1', 'NeuesPasswort1')).toEqual({ ok: false, message: 'Das aktuelle Passwort ist falsch.' });
    });

    it('verlangt bei abgelaufener Anmeldung eine neue Anmeldung', async () => {
      firebase.changePasswordError = { code: 'auth/requires-recent-login' };
      expect(await account.changePassword('Alt', 'NeuesPasswort1', 'NeuesPasswort1')).toEqual({ ok: false, message: 'Bitte melde dich neu an und versuche es dann erneut.' });
    });
  });
});
