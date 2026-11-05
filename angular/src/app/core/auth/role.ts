/**
 * Rollen eines Teammitglieds (members/{uid}.role). Seit SCRUM-170 sind Scout und Medizin getrennt:
 * - `physio` (UI: „Medizin-Zugang“): Spielerliste, Status, Abwesenheiten/Verletzungen und Messwerte – keine Noten.
 * - `scout` (UI: „Scout-Zugang“): nur die bereinigte Scout-Sicht (Kompetenzprofil, Notenverlauf, Statistik),
 *   keine Gesundheitsdaten und keine Notizen.
 */
export type Role = 'trainer' | 'player' | 'parent' | 'physio' | 'scout';

const ROLES: readonly Role[] = ['trainer', 'player', 'parent', 'physio', 'scout'];

/**
 * Gespeicherte Kennung → Rolle. Unbekannte Werte ergeben null (kein Zugang) – auch die alte Kennung `medical`
 * des früheren „Scout-Zugangs“ (SCRUM-91), die seit SCRUM-202 nicht mehr als Scout gilt (die Firestore-Regeln
 * behandeln sie ebenso).
 */
export function normalizeRole(value: unknown): Role | null {
  return ROLES.find((role) => role === value) ?? null;
}

/** Nur der Trainer hat die volle Navigation; Spieler, Eltern, Medizin und Scouts sehen eine einzelne Ansicht. */
export function showsNavigation(role: Role | null): boolean {
  return role === 'trainer';
}

/** Startseite nach der Anmeldung: der Trainer geht zur Übersicht, alle anderen zu ihrer einen Ansicht. */
export function homeFor(role: Role | null): string {
  return role === null || role === 'trainer' ? '/' : '/ansicht';
}
