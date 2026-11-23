import { Injectable, inject } from '@angular/core';
import type { ClubComparisonData } from '../club/club-comparison';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc } from './types';

/**
 * Vereinsvergleich (SCRUM-197). Pfade:
 * - `clubs/{clubId}.comparisonEnabled` (bool, Standard aus): schaltet der Vereinsadmin;
 * - `clubs/{clubId}/comparisonReaders/{uid}` (`teamId`): „ich bin Trainer dieses Teams im Verein“ – ein Verweis, den die
 *   Regeln bei jedem Lesen gegen die echte Mitgliedschaft prüfen (Regeln können nicht suchen, in welchem Team jemand ist);
 * - `clubs/{clubId}/comparison/{teamId}`: Kurzfassung je Team, schreibt nur der Trainer dieses Teams.
 */
@Injectable({ providedIn: 'root' })
export class ClubComparisonApi {
  private readonly connection = inject(FirebaseConnection);

  /** Hat der Vereinsadmin den Vergleich eingeschaltet? (Das Vereinsdokument darf jeder Angemeldete einzeln lesen.) */
  async readEnabled(clubId: string): Promise<boolean> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const club = await getDoc(doc(db, 'clubs', clubId));
    return club.exists() && club.data()['comparisonEnabled'] === true;
  }

  /** Vereinsadmin: Vergleich ein- oder ausschalten. */
  async setEnabled(clubId: string, enabled: boolean): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'clubs', clubId), { comparisonEnabled: enabled });
  }

  /** Trainer: Verweis auf das eigene Team setzen (nötig zum Lesen der Kurzfassungen). */
  async registerReader(clubId: string, uid: string, teamId: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'clubs', clubId, 'comparisonReaders', uid), { teamId });
  }

  async readReader(clubId: string, uid: string): Promise<string | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'clubs', clubId, 'comparisonReaders', uid));
    const teamId = snapshot.exists() ? snapshot.data()['teamId'] : null;
    return typeof teamId === 'string' ? teamId : null;
  }

  /** Trainer-Client: Kurzfassung des eigenen Teams schreiben (Zeitpunkt vom Server, wie es die Regel verlangt). */
  async writeComparison(clubId: string, teamId: string, data: ClubComparisonData): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'clubs', clubId, 'comparison', teamId), {
      version: data.version,
      teamName: data.teamName,
      team: { ...data.team, focus: { ...data.team.focus } },
      players: data.players.map((player) => ({ ...player })),
      updatedAt: serverTimestamp(),
    });
  }

  /** Alle Kurzfassungen des Vereins (Trainer der Teams des Vereins und der Vereinsadmin). */
  async readComparisons(clubId: string): Promise<RawDoc[]> {
    return this.readCollection(clubId, 'comparison');
  }

  /**
   * Vereinsadmin schaltet aus: Kurzfassungen und Verweise löschen (Datensparsamkeit) – höchstens 500 je Schreibvorgang.
   */
  async deleteAll(clubId: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const paths = [
      ...(await this.readCollection(clubId, 'comparison')).map((entry) => ['comparison', entry.id]),
      ...(await this.readCollection(clubId, 'comparisonReaders')).map((entry) => ['comparisonReaders', entry.id]),
    ];
    for (let start = 0; start < paths.length; start += 500) {
      const batch = writeBatch(db);
      for (const [name, id] of paths.slice(start, start + 500)) batch.delete(doc(db, 'clubs', clubId, name, id));
      await batch.commit();
    }
  }

  private async readCollection(clubId: string, name: string): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'clubs', clubId, name));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }
}
