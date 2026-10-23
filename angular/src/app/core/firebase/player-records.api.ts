import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Unterkollektionen eines Spielers, die das Profil verwaltet. */
export type PlayerRecordKind = 'developmentPlans' | 'absences' | 'measurements';

/** Unterdaten eines Spielers: Förderpläne (mit Selbstreflexion), Abwesenheiten und Messwerte. */
@Injectable({ providedIn: 'root' })
export class PlayerRecordsApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /**
   * Echtzeit-Abo auf eine Unterkollektion eines Spielers (Förderpläne, Abwesenheiten, Messwerte). Lesen dürfen
   * Trainer, der Spieler selbst (und seine Eltern); Abwesenheiten und Messwerte zusätzlich die medizinische Rolle.
   */
  async watchPlayerRecords(
    playerId: string,
    name: PlayerRecordKind,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    options: { readonly ownOnly?: boolean } = {},
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, query, where } = await import('firebase/firestore');
    const records = collection(db, 'teams', this.team.id(), 'players', playerId, name);
    // Spieler und Eltern: die Regeln prüfen das Feld `playerId` der Dokumente, deshalb muss die Abfrage exakt danach filtern.
    return onSnapshot(
      options.ownOnly ? query(records, where('playerId', '==', playerId)) : records,
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /**
   * Echtzeit-Abo auf die Abwesenheiten eines Spielers, die für Übersichten (Kader, Aufstellung, Start) zählen: alles,
   * was am Stichtag `since` oder später endet, plus Einträge ohne Ende (`to` leer). Ältere Einträge ändern weder den
   * heutigen Status noch die Belastungsampel (SCRUM-200); die volle Historie lädt erst das Profil. Nur Trainer
   * (Abfrage ohne `playerId`-Filter wie in {@link watchPlayerRecords}).
   */
  async watchRecentAbsences(
    playerId: string,
    since: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, or, query, where } = await import('firebase/firestore');
    const records = collection(db, 'teams', this.team.id(), 'players', playerId, 'absences');
    return onSnapshot(
      query(records, or(where('to', '>=', since), where('to', '==', ''))),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Echtzeit-Abo auf die Messwerte ab dem Stichtag `since` (die Belastungsampel braucht nur die letzten ca. 90 Tage). */
  async watchRecentMeasurements(
    playerId: string,
    since: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot, query, where } = await import('firebase/firestore');
    const records = collection(db, 'teams', this.team.id(), 'players', playerId, 'measurements');
    return onSnapshot(
      query(records, where('date', '>=', since)),
      { includeMetadataChanges: true },
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Einmaliges Lesen einer Unterkollektion eines Spielers (Förderpläne, Abwesenheiten, Messwerte). */
  async readPlayerRecords(playerId: string, name: PlayerRecordKind): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', this.team.id(), 'players', playerId, name));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /** Schreibt einen Eintrag vollständig (wie die bisherige App, mit `playerId` für Abfragen und Regeln). */
  async savePlayerRecord(playerId: string, name: PlayerRecordKind, id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'players', playerId, name, id), { ...data, playerId });
  }

  async deletePlayerRecord(playerId: string, name: PlayerRecordKind, id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', this.team.id(), 'players', playerId, name, id));
  }

  /** Selbstreflexion: ändert nur diese beiden Felder des Förderplans (so erlauben es die Regeln dem Spieler). */
  async saveSelfReflection(playerId: string, planId: string, text: string, at: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(
      doc(db, 'teams', this.team.id(), 'players', playerId, 'developmentPlans', planId),
      { selfReflection: text, selfReflectionAt: at },
      { merge: true },
    );
  }
}
