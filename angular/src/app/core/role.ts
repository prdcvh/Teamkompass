export type Role = 'trainer' | 'player' | 'parent' | 'medical';

/** Nur der Trainer hat die volle Navigation; Spieler, Eltern und Medizin sehen eine einzelne Ansicht. */
export function showsNavigation(role: Role): boolean {
  return role === 'trainer';
}
