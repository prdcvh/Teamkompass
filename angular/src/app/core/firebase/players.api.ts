import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { PlayerStatsMode } from '../team/player-stats-mode';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Unterkollektionen eines Spielers, die beim Löschen mitgehen (Entwicklungspläne, Abwesenheiten, Messwerte). */
const PLAYER_SUBCOLLECTIONS = ['developmentPlans', 'absences', 'measurements'] as const;

/** Spieler des Teams (players): Echtzeit-Abo, Speichern und Löschen samt aller Unterdaten. */
@Injectable({ providedIn: 'root' })
export class PlayersApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);
  private readonly statsMode = inject(PlayerStatsMode);

  /**
   * Echtzeit-Abo auf alle Spieler des Teams. Die Regeln erlauben Lesen für Trainer und Medizin
   * (Spieler/Eltern nur das eigene Profil); ein Fehler (z. B. permission-denied) kommt über `onError`.
   */
  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'players'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /**
   * Echtzeit-Abo auf EIN Spielerdokument (null = es gibt keins). Spieler und Eltern dürfen die Spielerliste nicht
   * abfragen, nur ihr eigenes Dokument lesen (Regeln: `isPlayerFor`); ein fremdes liefert permission-denied.
   */
  async watchPlayerDoc(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'players', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Legt einen Spieler an oder aktualisiert ihn (merge: unbekannte Felder älterer Versionen bleiben erhalten). */
  async savePlayer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'players', id), data, { merge: true });
  }

  /** Löscht den Spieler samt Unterdaten, Bewertungen, internen Notizen und Zu-/Absagen in allen Events und Zusammenfassung (in Blöcken, Limit 500 je Schreibvorgang). */
  async deletePlayer(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { collection, doc, getDocs, query, where, writeBatch } = await import('firebase/firestore');
    const base = ['teams', this.team.id()] as const;
    const [events, invites, members, ...children] = await Promise.all([
      getDocs(collection(db, ...base, 'events')),
      getDocs(query(collection(db, ...base, 'invites'), where('playerId', '==', id))),
      getDocs(query(collection(db, ...base, 'members'), where('playerId', '==', id))),
      ...PLAYER_SUBCOLLECTIONS.map((name) => getDocs(collection(db, ...base, 'players', id, name))),
    ]);
    const refs = [
      ...children.flatMap((snapshot) => snapshot.docs.map((entry) => entry.ref)),
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'ratings', id)),
      // Interne Trainer-Notizen (SCRUM-14) liegen getrennt von der Bewertung.
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'privateNotes', id)),
      // Zu-/Absagen des Spielers (SCRUM-205), wie in der bisherigen App.
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'responses', id)),
      // Einladungscodes und Zugänge des Spielers (SCRUM-53): sonst zeigen sie auf einen gelöschten Spieler.
      ...invites.docs.map((entry) => entry.ref),
      ...members.docs.map((entry) => entry.ref),
      // Zusammenfassung des Spielers (SCRUM-201) – nur, wenn die Regeln die Sammlung kennen.
      ...((await this.statsMode.writesSummary()) ? [doc(db, ...base, 'playerStats', id)] : []),
      doc(db, ...base, 'players', id), // zuletzt: bricht ein Block ab, bleibt der Spieler sichtbar und der Löschversuch wiederholbar
    ];
    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }
}
