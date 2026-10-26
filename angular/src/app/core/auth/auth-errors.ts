/** Verständliche Meldungen zu Firebase-Fehlercodes (Texte wie in der bisherigen App). */
export function authErrorMessage(code: string | undefined): string {
  const value = code ?? '';
  if (value.includes('email-already-in-use') || value.includes('credential-already-in-use')) {
    return 'Diese E-Mail wird bereits verwendet.';
  }
  if (value.includes('provider-already-linked')) return 'Dieser Zugang ist schon mit einer E-Mail-Adresse verbunden.';
  if (value.includes('requires-recent-login')) return 'Bitte melde dich neu an und versuche es dann erneut.';
  // Ob es zur E-Mail ein Konto gibt, wird nicht verraten (SCRUM-114: keine Konto-Erkennung über die Anmeldung).
  if (value.includes('wrong-password') || value.includes('invalid-credential') || value.includes('user-not-found')) {
    return 'E-Mail oder Passwort ist falsch.';
  }
  if (value.includes('invalid-email')) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  if (value.includes('weak-password')) return 'Das Passwort muss mindestens 12 Zeichen haben.';
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
