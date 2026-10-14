export type Role = 'trainer' | 'player' | 'parent' | 'medical';

/** Nur der Trainer hat die volle Navigation; Spieler, Eltern und Medizin sehen eine einzelne Ansicht. */
export function showsNavigation(role: Role | null): boolean {
  return role === 'trainer';
}

/** Startseite nach der Anmeldung: der Trainer geht zur Übersicht, alle anderen zu ihrer einen Ansicht. */
export function homeFor(role: Role | null): string {
  return role === null || role === 'trainer' ? '/' : '/ansicht';
}
