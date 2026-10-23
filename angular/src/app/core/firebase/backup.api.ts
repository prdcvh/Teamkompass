import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';

export interface WriteOperation {
  readonly path: readonly string[];
  readonly data: Readonly<Record<string, unknown>>;
  readonly merge: boolean;
}

/** Schreibt eine Liste von Dokumenten des Teams (`teams/{teamId}/…`) in Blöcken; nur für das Einspielen einer Sicherung. */
@Injectable({ providedIn: 'root' })
export class BackupApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Schreibt in Blöcken (Limit 500 je Schreibvorgang). Bricht ein Block ab, bleiben bereits geschriebene Blöcke bestehen. */
  async writeAll(operations: readonly WriteOperation[]): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    for (let offset = 0; offset < operations.length; offset += 450) {
      const batch = writeBatch(db);
      for (const op of operations.slice(offset, offset + 450)) {
        const ref = doc(db, 'teams', this.team.id(), ...op.path);
        if (op.merge) batch.set(ref, op.data, { merge: true });
        else batch.set(ref, op.data);
      }
      await batch.commit();
    }
  }
}
