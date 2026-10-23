import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc } from './types';

/**
 * Rangliste (SCRUM-105): Der Trainer liest einmalig die Trainer-Dokumente (Punkte) der Events des laufenden Zeitraums und
 * schreibt die fertige Rangliste nach `meta/ranking`. Dieses Dokument dürfen auch Spieler und Eltern lesen, die
 * Punkte der anderen Spieler im Trainer-Pfad bleiben ihnen verschlossen. Alles wird einmalig gelesen, keine
 * Dauer-Abos (spart Lesezugriffe, SCRUM-199).
 */
@Injectable({ providedIn: 'root' })
export class RankingApi {
  private readonly connection = inject(FirebaseConnection);

  /** Trainer-Dokumente (Notiz/Punkte) aller Spieler eines Events, einmalig gelesen. Nur Trainer. */
  async readPrivateNotes(eventId: string): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', environment.teamId, 'events', eventId, 'privateNotes'));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /** Das gespeicherte Ranglisten-Dokument (null = es gibt noch keins). */
  async readRanking(): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', environment.teamId, 'meta', 'ranking'));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /** Ersetzt das Ranglisten-Dokument komplett (kein merge, damit nichts Altes stehen bleibt). Nur Trainer. */
  async saveRanking(data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'ranking'), data);
  }
}
