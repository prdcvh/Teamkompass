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

  it('zeigt dem Trainer bei permission-denied den technischen Hinweis auf die Regeln', () => {
    expect(authErrorMessage('permission-denied', 'trainer')).toContain('firestore.rules');
  });

  it.each(['player', 'parent', 'scout', 'physio', null, undefined] as const)(
    'zeigt bei permission-denied (%s) einen Text ohne Technikbegriffe',
    (role) => {
      const message = authErrorMessage('permission-denied', role);
      expect(message).toBe('Du hast gerade keinen Zugriff auf diese Daten. Bitte melde dich bei deinem Trainer.');
      expect(message).not.toMatch(/firestore|permission-denied|regeln/i);
      expect(authErrorMessage('insufficient-permissions', role)).toBe(message);
    },
  );

  it('liest den Code aus Fehlerobjekten', () => {
    expect(errorCode({ code: 'auth/x' })).toBe('auth/x');
    expect(errorCode(new Error('x'))).toBe('');
    expect(errorCode(null)).toBe('');
  });
});
