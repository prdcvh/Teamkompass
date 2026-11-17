import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/**
 * Messplan (SCRUM-255): die Entscheidungen des Trainers (Rhythmus, Termin, Pause) liegen als Map unter
 * `measurementPlan.{playerId}` im Dokument `meta/settings` (nur Trainer, wie das Wissen). Bewusst kein eigener Pfad und
 * keine Regeländerung. Es stehen nur Termine und Entscheidungen darin, nie Messwerte. Geschrieben wird per merge.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementPlanApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchPlan(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'meta', 'settings'),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Setzt den Eintrag eines Spielers; `null` entfernt ihn (zurück zum Vorschlag). Andere Einstellungen bleiben unberührt. */
  async savePlayerPlan(playerId: string, data: Readonly<Record<string, unknown>> | null): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'meta', 'settings'), { measurementPlan: { [playerId]: data ?? deleteField() } }, { merge: true });
  }
}
