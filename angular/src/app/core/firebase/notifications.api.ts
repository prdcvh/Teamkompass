import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { FirebaseConnection } from './firebase-connection';

/**
 * Benachrichtigungs-Einstellungen je Konto (`teams/{teamId}/notifications/{uid}`, SCRUM-100). Lesen und Schreiben darf
 * nur der Trainer für sein eigenes Dokument (siehe firestore.rules). Die E-Mail-Adresse wird bewusst nicht gespeichert;
 * ein späterer Erinnerungsdienst liest sie aus Firebase Auth.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Liest das Dokument des Kontos; null, wenn noch keins existiert. */
  async readNotifications(uid: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', this.team.id(), 'notifications', uid));
    return snapshot.exists() ? snapshot.data() : null;
  }

  async saveNotifications(uid: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'notifications', uid), data, { merge: true });
  }
}
