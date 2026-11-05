import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { SnapshotMeta } from './types';

/** Dokument-ID der Angaben für den Reife-Kompass unter `players/{id}/maturity`. */
export const MATURITY_DOC_ID = 'parents';

/**
 * Angaben für den Reife-Kompass (SCRUM-190): `teams/{team}/players/{id}/maturity/parents` mit Geschlecht für die
 * Berechnung, Einverständnis der Eltern und Größe von Mutter und Vater. Lesen: nur Trainer und Medizin (Medizin nicht
 * bei widerrufener Einwilligung); Spieler, Eltern und Scouts nicht. Schreiben: nur Trainer (firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class MaturityApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchMaturity(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'players', playerId, 'maturity', MATURITY_DOC_ID),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Einmaliges Lesen der Angaben eines Spielers (Bio-Banding, SCRUM-191); null = noch nichts erfasst. */
  async readMaturity(playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', this.team.id(), 'players', playerId, 'maturity', MATURITY_DOC_ID));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /** Schreibt das Dokument vollständig (die Regeln erlauben genau diese Felder). */
  async saveMaturity(playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'players', playerId, 'maturity', MATURITY_DOC_ID), data);
  }
}
