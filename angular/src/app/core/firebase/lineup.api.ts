import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/** Startelf (`meta/lineup`, ein einzelnes Dokument). */
@Injectable({ providedIn: 'root' })
export class LineupApi {
  private readonly connection = inject(FirebaseConnection);

  /** Echtzeit-Abo auf die Startelf (`meta/lineup`, ein einzelnes Dokument; null = noch keine gespeichert). Nur Trainer. */
  async watchLineup(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'meta', 'lineup'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /**
   * Schreibt die Startelf (`assignments`) und führt sie mit dem bestehenden Dokument zusammen (merge, wie die bisherige App):
   * die Aufstellungen je Spiel (`byEvent`) der alten App liegen im selben Dokument und dürfen nicht verloren gehen.
   */
  async saveLineup(data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'lineup'), data, { merge: true });
  }

  /**
   * Schreibt die Aufstellung eines Spiels (`byEvent.<id>`) per merge in dasselbe Dokument – genau wie die Live-App
   * (cloudSaveEventLineup). Die allgemeine Startelf (`assignments`) und die anderen Spiele bleiben unberührt.
   */
  async saveEventLineup(eventId: string, entry: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'lineup'), { byEvent: { [eventId]: entry } }, { merge: true });
  }

  /**
   * Entfernt die Aufstellung eines Spiels (`byEvent.<id>`) – wie die Live-App (cloudDeleteEventLineup). Gibt es das
   * Dokument noch gar nicht, ist nichts zu löschen (kein Fehler).
   */
  async deleteEventLineup(eventId: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, updateDoc, deleteField } = await import('firebase/firestore');
    try {
      await updateDoc(doc(db, 'teams', environment.teamId, 'meta', 'lineup'), { [`byEvent.${eventId}`]: deleteField() });
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== 'not-found') throw error;
    }
  }
}
