export type Role = 'trainer' | 'player' | 'parent' | 'medical' | 'scout';

/** Nur der Trainer hat die volle Navigation; Spieler, Eltern, Medizin und Scout sehen eine einzelne Ansicht. */
export function showsNavigation(role: Role | null): boolean {
  return role === 'trainer';
}

/** Startseite nach der Anmeldung: der Trainer geht zur Übersicht, alle anderen zu ihrer einen Ansicht. */
export function homeFor(role: Role | null): string {
  return role === null || role === 'trainer' ? '/' : '/ansicht';
}

const ROLES: readonly Role[] = ['trainer', 'player', 'parent', 'medical', 'scout'];

/**
 * Rolle aus einem members-Dokument, genau wie firestore.rules sie auswertet (SCRUM-170):
 * - `medical` ist nur mit `healthAccess === true` ein Medizin-Zugang (Status, Abwesenheiten, Verletzungen, Messwerte).
 * - `medical` ohne `healthAccess` (alle vor SCRUM-170 angelegten „Scout-Zugänge“) ist ein Scout.
 * - `scout` sieht nur die bereinigte Leistungsansicht (scoutProfiles), keine Gesundheitsdaten.
 * Unbekannte Rollen ergeben null (kein Zugang).
 */
export function memberRole(data: Readonly<Record<string, unknown>>): Role | null {
  const role = ROLES.find((value) => value === data['role']) ?? null;
  if (role === 'medical' && data['healthAccess'] !== true) return 'scout';
  return role;
}
