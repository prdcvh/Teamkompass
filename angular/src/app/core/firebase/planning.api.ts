import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/** Planung (`meta/planning`, ein einzelnes Dokument, nur Trainer). Serien liegen als Map unter `series.{id}`. */
@Injectable({ providedIn: 'root' })
export class PlanningApi {
  private readonly connection = inject(FirebaseConnection);

  async watchPlanning(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'meta', 'planning'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Legt die Serie an oder ersetzt sie; andere Serien und spätere Teile des Dokuments bleiben unberührt. */
  async saveSeries(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { series: { [id]: data } }, { merge: true });
  }

  async deleteSeries(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { series: { [id]: deleteField() } }, { merge: true });
  }
}
