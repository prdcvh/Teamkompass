import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/**
 * Wissen (SCRUM-106): die Einträge liegen als Map unter `knowledge.{id}` im Dokument `meta/settings` (nur Trainer).
 * Bewusst kein eigener Pfad: `firestore.rules` kennt keine Sammelregel unter `teams/{teamId}`, ein neuer Pfad wäre
 * gesperrt und bräuchte eine Regeländerung. Geschrieben wird per merge, andere Einstellungen bleiben unberührt.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchKnowledge(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'meta', 'settings'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Legt den Eintrag an oder ersetzt ihn; andere Einträge und Einstellungen bleiben unberührt. */
  async saveEntry(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'meta', 'settings'), { knowledge: { [id]: data } }, { merge: true });
  }

  async deleteEntry(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'meta', 'settings'), { knowledge: { [id]: deleteField() } }, { merge: true });
  }
}
