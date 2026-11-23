import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Dokument aus einem Snapshot; `pending` = lokal geschrieben, vom Server noch nicht bestätigt. */
export interface PendingDoc extends RawDoc {
  readonly pending: boolean;
}

/**
 * Situationsrätsel (SCRUM-193) unter `teams/{teamId}/puzzles`, `puzzleSolutions` und `puzzleAnswers`.
 * - Rätsel (ohne Lösung): Trainer, Spieler und Eltern lesen; nur der Trainer schreibt.
 * - Lösungen: der Trainer liest alle; Spieler und Eltern nur gezielt die eines Rätsels, das der Spieler beantwortet hat.
 * - Antworten: der Trainer liest alle; Spieler und Eltern nur die eigenen (Abfrage mit `playerId`-Filter). Anlegen nur
 *   der Spieler selbst, einmal je Rätsel, ändern nie, löschen nur der Trainer.
 */
@Injectable({ providedIn: 'root' })
export class PuzzlesApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  async watchPuzzles(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    return this.watchCollection('puzzles', onData, onError);
  }

  /** Trainer: alle Lösungen (Dokument-ID = Rätsel-ID). */
  async watchSolutions(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    return this.watchCollection('puzzleSolutions', onData, onError);
  }

  /** Trainer: alle Antworten des Teams. */
  async watchAllAnswers(onData: (docs: PendingDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'puzzleAnswers'),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data({ serverTimestamps: 'estimate' }), pending: entry.metadata.hasPendingWrites })), metaOf(snapshot.metadata)),
      onError,
    );
  }

  /** Spieler/Eltern: nur die Antworten des eigenen Spielers (die Regeln erlauben die Liste nur mit diesem Filter). */
  async watchOwnAnswers(playerId: string, onData: (docs: PendingDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, query, where } = await import('firebase/firestore');
    return onSnapshot(
      query(collection(db, 'teams', this.team.id(), 'puzzleAnswers'), where('playerId', '==', playerId)),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data({ serverTimestamps: 'estimate' }), pending: entry.metadata.hasPendingWrites })), metaOf(snapshot.metadata)),
      onError,
    );
  }

  /** Spieler/Eltern: Lösung eines beantworteten Rätsels (null = gibt es nicht). */
  async getSolution(puzzleId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', this.team.id(), 'puzzleSolutions', puzzleId));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /** Trainer: Rätsel und Lösung in einem Schreibvorgang anlegen oder vollständig ersetzen. */
  async savePuzzle(id: string, puzzle: Readonly<Record<string, unknown>>, solution: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', this.team.id(), 'puzzles', id), { ...puzzle, updatedAt: serverTimestamp() });
    batch.set(doc(db, 'teams', this.team.id(), 'puzzleSolutions', id), { ...solution, updatedAt: serverTimestamp() });
    await batch.commit();
  }

  /** Trainer: Rätsel, Lösung und die genannten Antworten löschen (ein Schreibvorgang, höchstens 450 Antworten). */
  async deletePuzzle(id: string, answerIds: readonly string[]): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    for (const answer of answerIds.slice(0, 450)) batch.delete(doc(db, 'teams', this.team.id(), 'puzzleAnswers', answer));
    batch.delete(doc(db, 'teams', this.team.id(), 'puzzleSolutions', id));
    batch.delete(doc(db, 'teams', this.team.id(), 'puzzles', id));
    await batch.commit();
  }

  /** Spieler: Antwort anlegen (Dokument-ID `{puzzleId}_{playerId}`, Zeitpunkt vom Server). */
  async saveAnswer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'puzzleAnswers', id), { ...data, answeredAt: serverTimestamp() });
  }

  private async watchCollection(name: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), name),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), metaOf(snapshot.metadata)),
      onError,
    );
  }
}

function metaOf(metadata: { fromCache: boolean; hasPendingWrites: boolean }): SnapshotMeta {
  return { fromCache: metadata.fromCache, hasPendingWrites: metadata.hasPendingWrites };
}
