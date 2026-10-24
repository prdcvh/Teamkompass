import { authErrorMessage, errorCode } from './auth-errors';

describe('authErrorMessage', () => {
  it.each([
    ['auth/wrong-password', 'E-Mail oder Passwort ist falsch.'],
    ['auth/invalid-credential', 'E-Mail oder Passwort ist falsch.'],
    ['auth/user-not-found', 'E-Mail oder Passwort ist falsch.'],
    ['auth/provider-already-linked', 'Dieser Zugang ist schon mit einer E-Mail-Adresse verbunden.'],
    ['auth/credential-already-in-use', 'Diese E-Mail wird bereits verwendet.'],
    ['auth/too-many-requests', 'Zu viele Versuche. Bitte kurz warten und dann erneut versuchen.'],
    ['auth/network-request-failed', 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.'],
  ])('übersetzt %s', (code, message) => {
    expect(authErrorMessage(code)).toBe(message);
  });

  it('nennt bei unbekannten Fehlern den Code', () => {
    expect(authErrorMessage('auth/seltsam')).toContain('auth/seltsam');
  });

  it('erklärt permission-denied mit Hinweis auf die Regeln', () => {
    expect(authErrorMessage('permission-denied')).toContain('firestore.rules');
  });

  it('liest den Code aus Fehlerobjekten', () => {
    expect(errorCode({ code: 'auth/x' })).toBe('auth/x');
    expect(errorCode(new Error('x'))).toBe('');
    expect(errorCode(null)).toBe('');
  });
});
