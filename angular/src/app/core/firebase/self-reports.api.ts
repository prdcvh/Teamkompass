import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Angaben eines Spielers nach einem Termin (SCRUM-138): Anstrengung bzw. Befinden, Dokument-ID = Event-ID. */
export type SelfReportKind = 'selfReports' | 'wellness';

/**
 * Lesen und Schreiben der Spielerangaben unter `teams/{teamId}/players/{playerId}/{selfReports|wellness}`.
 * Schreiben dürfen nur der Spieler selbst und seine Eltern (Regeln); lesen Trainer, Medizin und der eigene Spieler.
 */
@Injectable({ providedIn: 'root' })
export class SelfReportsApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Echtzeit-Abo; mit `since` nur Angaben zu Terminen ab diesem Tag (Übersichten des Trainers). */
  async watchSelfReports(
    playerId: string,
    kind: SelfReportKind,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    since?: string,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, query, where } = await import('firebase/firestore');
    const records = collection(db, 'teams', this.team.id(), 'players', playerId, kind);
    return onSnapshot(
      since ? query(records, where('date', '>=', since)) : records,
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Schreibt die Angabe vollständig, mit Server-Zeitpunkt (die Regeln prüfen Frist und Teilnahme). */
  async saveSelfReport(playerId: string, kind: SelfReportKind, eventId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'players', playerId, kind, eventId), { ...data, updatedAt: serverTimestamp() });
  }
}
