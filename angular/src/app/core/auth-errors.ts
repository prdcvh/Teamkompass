/** Verständliche Meldungen zu Firebase-Fehlercodes (Texte wie in der bisherigen App). */
export function authErrorMessage(code: string | undefined): string {
  const value = code ?? '';
  if (value.includes('email-already-in-use')) return 'Diese E-Mail wird bereits verwendet.';
  if (value.includes('wrong-password') || value.includes('invalid-credential')) {
    return 'E-Mail oder Passwort ist falsch.';
  }
  if (value.includes('user-not-found')) return 'Kein Trainer-Konto mit dieser E-Mail gefunden.';
  if (value.includes('invalid-email')) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  if (value.includes('weak-password')) return 'Das Passwort muss mindestens 6 Zeichen haben.';
  if (value.includes('too-many-requests')) {
    return 'Zu viele Versuche. Bitte kurz warten und dann erneut versuchen.';
  }
  if (value.includes('network-request-failed')) {
    return 'Keine Verbindung. Bitte Internet prüfen und erneut versuchen.';
  }
  if (value.includes('operation-not-allowed')) {
    return 'Diese Anmeldemethode ist in der Firebase-Konsole noch nicht aktiviert.';
  }
  if (value.includes('permission-denied') || value.includes('insufficient-permissions')) {
    return 'Zugriff von den Firestore-Regeln verweigert (permission-denied). Prüfe, ob firestore.rules wirklich veröffentlicht wurde.';
  }
  return `Etwas ist schiefgelaufen${value ? ` (Code: ${value})` : ''}. Bitte erneut versuchen.`;
}

export function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
}
