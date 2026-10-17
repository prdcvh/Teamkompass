import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/** Planung (`meta/planning`, ein einzelnes Dokument, nur Trainer). Serien liegen als Map unter `series.{id}`, Pausen unter `breaks.{id}`. */
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

  /** Löscht die Serie samt den Merkern ihrer von Hand gelöschten Termine. */
  async deleteSeries(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { series: { [id]: deleteField() }, skipped: { [id]: deleteField() } }, { merge: true });
  }

  /** Merkt, dass das Serien-Training dieses Tages von Hand gelöscht wurde und nicht neu entstehen soll. */
  async markSkipped(seriesId: string, date: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { skipped: { [seriesId]: { [date]: true } } }, { merge: true });
  }

  /** Legt die Pause an oder ersetzt sie (SCRUM-148); Serien und andere Pausen bleiben unberührt. */
  async saveBreak(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { breaks: { [id]: data } }, { merge: true });
  }

  async deleteBreak(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'planning'), { breaks: { [id]: deleteField() } }, { merge: true });
  }
}
