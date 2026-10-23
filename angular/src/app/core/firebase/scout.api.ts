import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import type { ScoutChange } from '../scout/scout-profile';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/**
 * Scout-Sicht `teams/{teamId}/scoutProfiles` (SCRUM-170). Lesen dürfen Trainer und Scouts, schreiben nur Trainer
 * (und nur die erlaubten Felder, siehe firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class ScoutApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchScoutProfiles(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'scoutProfiles'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Schreibt und löscht Dokumente der Scout-Sicht in Blöcken (je Block atomar). */
  async applyScoutChanges(changes: readonly ScoutChange[]): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    for (let offset = 0; offset < changes.length; offset += 400) {
      const batch = writeBatch(db);
      for (const change of changes.slice(offset, offset + 400)) {
        const ref = doc(db, 'teams', this.team.id(), 'scoutProfiles', change.id);
        if (change.type === 'set') batch.set(ref, change.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }
  }
}
