import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc } from './types';

/** Filter für die Szenen-Abfrage: alle Szenen eines Termins oder alle Szenen eines Spielers. */
export interface TacticSceneFilter {
  readonly field: 'eventId' | 'playerId';
  readonly value: string;
}

/**
 * Kodierte Spielszenen der Taktikdiagnostik (SCRUM-267) unter `teams/{teamId}/tacticScenes/{sceneId}`. Lesen und
 * schreiben dürfen nur Trainer (auch nicht der Vereinsadmin – die Szene kann einen internen Videolink enthalten).
 */
@Injectable({ providedIn: 'root' })
export class TacticScenesApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchScenes(filter: TacticSceneFilter, onData: (docs: RawDoc[]) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, query, where } = await import('firebase/firestore');
    return onSnapshot(
      query(collection(db, 'teams', this.team.id(), 'tacticScenes'), where(filter.field, '==', filter.value)),
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }))),
      onError,
    );
  }

  async saveScene(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'tacticScenes', id), data);
  }

  async deleteScene(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'tacticScenes', id));
  }
}
