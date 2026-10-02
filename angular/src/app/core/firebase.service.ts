import { Injectable } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import type { Role } from './role';

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

/** Unterkollektionen eines Spielers, die beim Löschen mitgehen (Entwicklungspläne, Abwesenheiten, Messwerte). */
const PLAYER_SUBCOLLECTIONS = ['developmentPlans', 'absences', 'measurements'] as const;

const ROLES: readonly Role[] = ['trainer', 'player', 'parent', 'medical'];

/**
 * Einzige Stelle, die das Firebase-SDK kennt. Alle Pfade liegen unter teams/{teamId}/…
 * (Datenmodell und Zugriffsregeln: firestore.rules). Das SDK wird erst beim ersten Zugriff
 * geladen, damit der Start der App nicht darauf wartet.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private sdk?: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }>;

  private init() {
    this.sdk ??= (async () => {
      const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(environment.firebase);
      return { app, auth: getAuth(app), db: getFirestore(app) };
    })();
    return this.sdk;
  }

  /** Meldet jede Änderung des Anmeldezustands. Gibt die Funktion zum Beenden zurück. */
  async watchAuth(callback: (user: FirebaseUser | null) => void): Promise<() => void> {
    const { auth } = await this.init();
    const { onAuthStateChanged } = await import('firebase/auth');
    return onAuthStateChanged(auth, (user) =>
      callback(user ? { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email } : null),
    );
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const { auth } = await this.init();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
  }

  /**
   * Anonyme Anmeldung für Spieler/Eltern. Erst danach darf der Code gelesen werden (die
   * Regeln erlauben das nur Angemeldeten); der frische Token wird erzwungen, weil es sonst
   * kurz zu permission-denied kommen kann.
   */
  async signInAnonymously(): Promise<string> {
    const { auth } = await this.init();
    const { signInAnonymously } = await import('firebase/auth');
    const credential = await signInAnonymously(auth);
    await credential.user.getIdToken(true);
    return credential.user.uid;
  }

  async signOut(): Promise<void> {
    const { auth } = await this.init();
    const { signOut } = await import('firebase/auth');
    await signOut(auth);
  }

  async readMember(uid: string): Promise<MemberRecord | null> {
    const { db } = await this.init();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', environment.teamId, 'members', uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const role = ROLES.find((value) => value === data['role']);
    if (!role) return null;
    return { role, playerId: typeof data['playerId'] === 'string' ? data['playerId'] : null };
  }

  async readInvite(code: string): Promise<InviteRecord | null> {
    const { db } = await this.init();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', environment.teamId, 'invites', code));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const expires = data['expiresAt'] as { toDate?: () => Date } | null | undefined;
    return {
      role: ROLES.find((value) => value === data['role']) ?? 'player',
      playerId: String(data['playerId'] ?? ''),
      expiresAt: expires?.toDate ? expires.toDate() : null,
      expiresAtRaw: data['expiresAt'] ?? null,
    };
  }

  /**
   * Legt die Mitgliedschaft an und verbraucht den Code in einem Schritt (atomar): ein Code
   * kann dadurch weder wiederverwendet noch nach erfolgreicher Anmeldung weitergegeben werden.
   */
  async claimInvite(uid: string, code: string, invite: InviteRecord): Promise<void> {
    const { db } = await this.init();
    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', environment.teamId, 'members', uid), {
      role: invite.role,
      playerId: invite.playerId,
      claimedInviteCode: code,
      expiresAt: invite.expiresAtRaw ?? null,
      createdAt: serverTimestamp(),
    });
    batch.delete(doc(db, 'teams', environment.teamId, 'invites', code));
    await batch.commit();
  }

  /**
   * Echtzeit-Abo auf alle Spieler des Teams. Die Regeln erlauben Lesen für Trainer und Medizin
   * (Spieler/Eltern nur das eigene Profil); ein Fehler (z. B. permission-denied) kommt über `onError`.
   */
  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.init();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'players'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Legt einen Spieler an oder aktualisiert ihn (merge: unbekannte Felder älterer Versionen bleiben erhalten). */
  async savePlayer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.init();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'players', id), data, { merge: true });
  }

  /** Löscht den Spieler samt Unterdaten, Bewertungen und internen Notizen in allen Events (in Blöcken, Limit 500 je Schreibvorgang). */
  async deletePlayer(id: string): Promise<void> {
    const { db } = await this.init();
    const { collection, doc, getDocs, writeBatch } = await import('firebase/firestore');
    const base = ['teams', environment.teamId] as const;
    const [events, ...children] = await Promise.all([
      getDocs(collection(db, ...base, 'events')),
      ...PLAYER_SUBCOLLECTIONS.map((name) => getDocs(collection(db, ...base, 'players', id, name))),
    ]);
    const refs = [
      ...children.flatMap((snapshot) => snapshot.docs.map((entry) => entry.ref)),
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'ratings', id)),
      // Interne Trainer-Notizen (SCRUM-14) liegen getrennt von der Bewertung.
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'privateNotes', id)),
      doc(db, ...base, 'players', id), // zuletzt: bricht ein Block ab, bleibt der Spieler sichtbar und der Löschversuch wiederholbar
    ];
    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }
}
