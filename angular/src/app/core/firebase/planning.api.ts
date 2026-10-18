import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/**
 * Planung: Serien liegen als Map unter `series.{id}` im Dokument `meta/planning` (nur Trainer). Pausen (SCRUM-148/150) liegen
 * bewusst getrennt als Map unter `breaks.{id}` im Dokument `meta/breaks`: dieses darf jedes Teammitglied lesen (für den
 * Pausen-Hinweis), die Serien in `meta/planning` bleiben Trainern vorbehalten. Schreiben darf nur der Trainer.
 */
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

  /**
   * Merkt, dass das Serien-Training dieses Tages von Hand gelöscht wurde und nicht neu entstehen soll. Nur, wenn die Serie
   * noch existiert (SCRUM-161): Bleibt nach dem Löschen einer Serie ein Termin übrig, soll sein Löschen keinen Merker
   * ohne Serie im Dokument zurücklassen. Lässt sich die Serie nicht nachsehen (z. B. offline ohne Zwischenspeicher),
   * wird der Merker vorsichtshalber gesetzt.
   */
  async markSkipped(seriesId: string, date: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    const ref = doc(db, 'teams', environment.teamId, 'meta', 'planning');
    const seriesExists = await getDoc(ref).then(
      (snapshot) => (snapshot.get(`series.${seriesId}`) ?? null) !== null,
      () => true,
    );
    if (!seriesExists) return;
    await setDoc(ref, { skipped: { [seriesId]: { [date]: true } } }, { merge: true });
  }

  /** Beobachtet das Pausen-Dokument `meta/breaks` (lesbar für alle Teammitglieder). */
  async watchBreaks(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'meta', 'breaks'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Legt die Pause an oder ersetzt sie (SCRUM-148); andere Pausen bleiben unberührt. */
  async saveBreak(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'breaks'), { breaks: { [id]: data } }, { merge: true });
  }

  async deleteBreak(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'breaks'), { breaks: { [id]: deleteField() } }, { merge: true });
  }
}
