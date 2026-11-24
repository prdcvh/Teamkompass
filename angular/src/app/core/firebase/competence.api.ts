import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/**
 * Entwicklungsraster (SCRUM-266, docs/bewertungsmodell.md): Beobachtungen je Spieler unter
 * `teams/{teamId}/players/{playerId}/competenceObservations/{id}` und die versionierte Team-Konfiguration unter
 * `teams/{teamId}/competenceConfigs/v{n}`. Lesen und schreiben nur Trainer (Regeln). Beobachtungen werden nie geändert,
 * Konfigurationen weder geändert noch gelöscht.
 */
@Injectable({ providedIn: 'root' })
export class CompetenceApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchObservations(playerId: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'players', playerId, 'competenceObservations'),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Mehrere Beobachtungen (eine je Kriterium) in einem Schreibvorgang. */
  async addObservations(playerId: string, entries: readonly { readonly id: string; readonly data: Record<string, unknown> }[]): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    for (const entry of entries) batch.set(doc(db, 'teams', this.team.id(), 'players', playerId, 'competenceObservations', entry.id), entry.data);
    await batch.commit();
  }

  async deleteObservation(playerId: string, id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'players', playerId, 'competenceObservations', id));
  }

  async watchConfigs(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'competenceConfigs'),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Neue Version anlegen; gibt es die Version schon (zwei Trainer gleichzeitig), lehnen die Regeln ab. */
  async addConfig(id: string, data: Record<string, unknown>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'competenceConfigs', id), data);
  }
}
