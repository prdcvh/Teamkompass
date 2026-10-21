/**
 * Rollen eines Teammitglieds (members/{uid}.role). Seit SCRUM-170 sind Scout und Medizin getrennt:
 * - `physio` (UI: „Medizin-Zugang“): Spielerliste, Status, Abwesenheiten/Verletzungen und Messwerte – keine Noten.
 * - `scout` (UI: „Scout-Zugang“): nur die bereinigte Scout-Sicht (Kompetenzprofil, Notenverlauf, Statistik),
 *   keine Gesundheitsdaten und keine Notizen.
 */
export type Role = 'trainer' | 'player' | 'parent' | 'physio' | 'scout';

const ROLES: readonly Role[] = ['trainer', 'player', 'parent', 'physio', 'scout'];

/**
 * Gespeicherte Kennung → Rolle. `medical` ist die alte Kennung des bisherigen „Scout-Zugangs“ (SCRUM-91); nach
 * Entscheidung des PO werden diese Konten Scout-Konten (die Firestore-Regeln behandeln `medical` ebenso).
 * Unbekannte Werte ergeben null (kein Zugang).
 */
export function normalizeRole(value: unknown): Role | null {
  if (value === 'medical') return 'scout';
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
