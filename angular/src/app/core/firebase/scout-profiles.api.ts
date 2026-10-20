import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/**
 * Bereinigte Scout-Ansicht `teams/{teamId}/scoutProfiles/{playerId}` (SCRUM-170): je Spieler nur Name, Nummer,
 * Positionen, Geburtsdatum und Teilnoten/Einsatzdaten je Event – keine Gesundheitsdaten. Lesen dürfen Trainer und
 * Scouts, schreiben nur Trainer (firestore.rules). Gleiches Format wie die Live-Apps (outputs/*: scoutProfileFor).
 */
@Injectable({ providedIn: 'root' })
export class ScoutProfilesApi {
  private readonly connection = inject(FirebaseConnection);

  async watchScoutProfiles(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'scoutProfiles'),
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Schreibt geänderte und löscht verwaiste Profile (in Paketen zu je höchstens 450 Schreibvorgängen). */
  async applyScoutProfiles(set: readonly (readonly [string, Readonly<Record<string, unknown>>])[], remove: readonly string[]): Promise<void> {
    if (set.length === 0 && remove.length === 0) return;
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const ref = (id: string) => doc(db, 'teams', environment.teamId, 'scoutProfiles', id);
    const writes = [
      ...set.map(([id, data]) => (batch: ReturnType<typeof writeBatch>) => batch.set(ref(id), data)),
      ...remove.map((id) => (batch: ReturnType<typeof writeBatch>) => batch.delete(ref(id))),
    ];
    for (let offset = 0; offset < writes.length; offset += 450) {
      const batch = writeBatch(db);
      writes.slice(offset, offset + 450).forEach((write) => write(batch));
      await batch.commit();
    }
  }
}
