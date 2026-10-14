import type { Role } from '../role';

export interface FirebaseUser {
  readonly uid: string;
  readonly isAnonymous: boolean;
  readonly email: string | null;
}

/** members/{uid}: verknüpft die Anmeldung mit Rolle und – für Spieler/Eltern – dem Spielerprofil. */
export interface MemberRecord {
  readonly role: Role;
  readonly playerId: string | null;
}

/** invites/{code}: Einladungscode eines Spielers/Elternteils. */
export interface InviteRecord {
  readonly role: Role;
  readonly playerId: string;
  readonly expiresAt: Date | null;
  /**
   * Originalwert aus Firestore. Beim Einlösen muss `expiresAt` laut Regeln exakt gleich sein;
   * eine Umrechnung über Date könnte Nanosekunden abschneiden und die Regel verletzen.
   */
  readonly expiresAtRaw?: unknown;
}

/** Rohes Dokument aus einer Sammlung (ID + Felder). */
export interface RawDoc {
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Zustand eines Echtzeit-Snapshots: Cache-Stand (offline) und noch nicht bestätigte lokale Änderungen. */
export interface SnapshotMeta {
  readonly fromCache: boolean;
  readonly hasPendingWrites: boolean;
}
