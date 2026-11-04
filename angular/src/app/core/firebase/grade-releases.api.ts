import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/**
 * Freigabe der Noten je Spieler `teams/{teamId}/gradeReleases/{playerId}` (SCRUM-115). Schreiben nur Trainer; lesen
 * Trainer sowie der eigene Spieler bzw. die eigenen Eltern (gezielter Abruf). Format und Rechte: firestore.rules.
 */
@Injectable({ providedIn: 'root' })
export class GradeReleasesApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Echtzeit-Abo auf die Freigabe eines Spielers (null = keine). */
  async watchRelease(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'gradeReleases', playerId),
      // Noch nicht bestätigte Server-Zeit als Schätzung, damit die eben gesetzte Freigabe sofort angezeigt wird.
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data({ serverTimestamps: 'estimate' }) : null, {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        }),
      onError,
    );
  }

  /** Veröffentlicht die Noten bis jetzt (Server-Zeit) – ersetzt eine laufende Freigabe. */
  async publish(playerId: string, expiresAt: Date | null): Promise<void> {
    const { db, auth } = await this.connection.get();
    const { Timestamp, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Nicht angemeldet.');
    await setDoc(doc(db, 'teams', this.team.id(), 'gradeReleases', playerId), {
      playerId,
      publishedUntil: serverTimestamp(),
      expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
      createdBy: uid,
    });
  }

  /** Nimmt die Freigabe zurück: Spieler und Eltern sehen sofort keine Noten mehr. */
  async revoke(playerId: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'gradeReleases', playerId));
  }
}
