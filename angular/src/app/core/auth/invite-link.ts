/**
 * Einladungslinks der bisherigen App (archivierte Alt-App, `inviteLinkFor`): `https://<site>/?invite=<code>`. Beim Umstieg eines
 * Live-Teams auf Angular (SCRUM-169) sind solche Links schon verschickt; sie sollen weiter funktionieren: der Code wird
 * auf der Anmeldeseite vorausgefüllt, angemeldet wird erst per Knopfdruck (wie bisher).
 */
export const INVITE_PARAM = 'invite';

/** Gültiger Code aus dem Link (Hex, 32–64 Zeichen, wie die bisherige App prüft) oder leer. */
export function inviteCodeFromParam(value: string | null | undefined): string {
  const code = (value ?? '').trim();
  return /^[0-9a-f]{32,64}$/i.test(code) ? code.toLowerCase() : '';
}
