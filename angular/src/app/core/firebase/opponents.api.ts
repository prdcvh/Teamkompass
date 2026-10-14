import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Gegnerprofile (opponents). Lesen und Schreiben dürfen nur Trainer. */
@Injectable({ providedIn: 'root' })
export class OpponentsApi {
  private readonly connection = inject(FirebaseConnection);

  /** Echtzeit-Abo auf die Gegnerprofile. Lesen und Schreiben dürfen nur Trainer. */
  async watchOpponents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'opponents'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  async saveOpponent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'opponents', id), data, { merge: true });
  }

  async deleteOpponent(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', environment.teamId, 'opponents', id));
  }
}
