import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc } from './types';

/**
 * Zu- und Absagen (SCRUM-205, Datenablage wie SCRUM-175): `teams/{teamId}/events/{eventId}/responses/{playerId}`.
 * Der Trainer liest je Event die ganze Unterkollektion, Spieler und Eltern nur das eigene Dokument (gezielter Get –
 * eine Liste lassen die Regeln für sie nicht zu). Schreiben dürfen nur Spieler/Eltern für den eigenen Spieler.
 */
@Injectable({ providedIn: 'root' })
export class RsvpApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Echtzeit-Abo auf alle Rückmeldungen eines Events (nur Trainer). */
  async watchResponses(eventId: string, onData: (docs: RawDoc[]) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'events', eventId, 'responses'),
      (snapshot) => onData(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }))),
      onError,
    );
  }

  /** Echtzeit-Abo auf die eigene Rückmeldung zu einem Event (Spieler/Eltern); null = noch keine. */
  async watchOwnResponse(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'events', eventId, 'responses', playerId),
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
      onError,
    );
  }

  /** Speichert die eigene Rückmeldung (ganzes Dokument, Zeitstempel vom Server – so verlangen es die Regeln). */
  async saveResponse(eventId: string, playerId: string, data: { readonly playerId: string; readonly status: string; readonly reason: string; readonly by: string }): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'responses', playerId), { ...data, updatedAt: serverTimestamp() });
  }
}
