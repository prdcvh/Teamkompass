/** Präfix aller Browser-Speicher-Schlüssel mit Teamdaten (Gesundheitsdaten!). Einstellungen wie das Design gehören nicht dazu. */
export const TEAM_DATA_PREFIX = 'teamkompass-team-';

/**
 * Entfernt gespeicherte Teamdaten aus dem Browser. Läuft beim Abmelden und immer dann, wenn
 * niemand angemeldet ist – ohne Anmeldung darf kein Teamstand im Browser liegen bleiben.
 */
export function clearLocalTeamData(): void {
  for (const storage of [safe(() => localStorage), safe(() => sessionStorage)]) {
    if (!storage) continue;
    try {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(TEAM_DATA_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // Speicher gesperrt: es kann dann auch nichts darin liegen.
    }
  }
}

function safe<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}
