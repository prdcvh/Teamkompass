import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Events des Teams (nur Metadaten; Bewertungen und Notizen liegen in Unterkollektionen). */
@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly connection = inject(FirebaseConnection);

  /**
   * Echtzeit-Abo auf die Events des Teams (nur Metadaten: Bewertungen und interne Notizen liegen in
   * Unterkollektionen). Lesen dürfen alle Teammitglieder; ein Fehler kommt über `onError`.
   */
  async watchEvents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'events'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Legt ein Event an oder aktualisiert es (merge: Felder älterer Versionen bleiben erhalten). Nur Metadaten, nie Bewertungen. */
  async saveEvent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'events', id), data, { merge: true });
  }

  /** Löscht das Event samt Bewertungen und internen Notizen (in Blöcken, Limit 500 je Schreibvorgang). */
  async deleteEvent(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { collection, doc, getDocs, writeBatch } = await import('firebase/firestore');
    const base = ['teams', environment.teamId, 'events', id] as const;
    const [ratings, privateNotes] = await Promise.all([
      getDocs(collection(db, ...base, 'ratings')),
      getDocs(collection(db, ...base, 'privateNotes')),
    ]);
    const refs = [
      ...ratings.docs.map((entry) => entry.ref),
      ...privateNotes.docs.map((entry) => entry.ref),
      doc(db, ...base), // zuletzt: bricht ein Block ab, bleibt das Event sichtbar und der Löschversuch wiederholbar
    ];
    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }
}
