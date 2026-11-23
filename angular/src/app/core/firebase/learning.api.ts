import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/**
 * Lernpfade (SCRUM-192): Inhalte unter `teams/{teamId}/learningPaths/{pathId}`, bestätigte Stufen je Spieler unter
 * `teams/{teamId}/learningProgress/{playerId}`. Schreiben darf nur der Trainer (Regeln). Pfade lesen Trainer, Spieler und
 * Eltern; den Fortschritt liest der Trainer für alle, Spieler und Eltern nur den eigenen (gezielter Abruf, nie als Liste).
 */
@Injectable({ providedIn: 'root' })
export class LearningApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchPaths(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'learningPaths'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Trainer: Fortschritt aller Spieler (Dokument-ID = Spieler-ID). */
  async watchAllProgress(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'learningProgress'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Spieler/Eltern: nur der eigene Fortschritt (null = noch nichts bestätigt). */
  async watchProgress(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'learningProgress', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Legt den Pfad an oder ersetzt ihn vollständig (mit Server-Zeitpunkt). */
  async savePath(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'learningPaths', id), { ...data, updatedAt: serverTimestamp() });
  }

  /** Löscht den Pfad und entfernt seine Bestätigungen aus dem Fortschritt der genannten Spieler (ein Schreibvorgang). */
  async deletePath(id: string, playerIds: readonly string[]): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteField, doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    for (const playerId of playerIds.slice(0, 400)) {
      batch.set(
        doc(db, 'teams', this.team.id(), 'learningProgress', playerId),
        { playerId, paths: { [id]: deleteField() }, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
    batch.delete(doc(db, 'teams', this.team.id(), 'learningPaths', id));
    await batch.commit();
  }

  /** Bestätigt eine Stufe (Datum JJJJ-MM-TT) oder nimmt die Bestätigung zurück (date = null). */
  async setLevel(playerId: string, pathId: string, levelId: string, date: string | null): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteField, doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(
      doc(db, 'teams', this.team.id(), 'learningProgress', playerId),
      { playerId, paths: { [pathId]: { [levelId]: date ?? deleteField() } }, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
}
