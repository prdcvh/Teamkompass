import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { PlayerStatsMode } from '../team/player-stats-mode';
import { hasStatsSource, statsUpdate } from '../team/player-stats';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Bewertungen je Event und Spieler sowie die internen Trainer-Notizen (getrennt gespeichert, nur Trainer lesen sie). */
@Injectable({ providedIn: 'root' })
export class RatingsApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);
  private readonly statsMode = inject(PlayerStatsMode);

  /** Echtzeit-Abo auf die Bewertungen eines Events (Dokument je Spieler). Lesen dürfen Trainer und der jeweilige Spieler. */
  async watchRatings(
    eventId: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    return this.watchEventSubcollection(eventId, 'ratings', onData, onError);
  }

  /** Echtzeit-Abo auf die internen Trainer-Notizen eines Events. Nur Trainer dürfen den Pfad lesen (SCRUM-14). */
  async watchPrivateNotes(
    eventId: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    return this.watchEventSubcollection(eventId, 'privateNotes', onData, onError);
  }

  private async watchEventSubcollection(
    eventId: string,
    name: 'ratings' | 'privateNotes',
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', this.team.id(), 'events', eventId, name),
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
   * Echtzeit-Abo auf die Bewertung eines einzelnen Spielers in einem Event (Dokument oder „gibt es nicht“ = null).
   * So lesen die Regeln auch Spieler und Eltern für das eigene Profil; für den Trainer ersetzt es die Abfrage über alle Spieler.
   */
  async watchRatingDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'events', eventId, 'ratings', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Einmaliges Lesen der Bewertung eines Spielers in einem Event (null = es gibt keine). */
  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'ratings', playerId));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /**
   * Schreibt die Bewertung eines Spielers (merge, mit `playerId` für die Regeln und Abfragen der Spieleransicht) und im
   * selben atomaren Schreibvorgang den Eintrag dieses Events in der Zusammenfassung des Spielers (SCRUM-201) – so kann
   * die Zusammenfassung nie von der Bewertung abweichen. `data` muss alle Felder einer Bewertung enthalten (siehe
   * `docFromRating`), sonst ließe sich der Eintrag nicht sicher bilden. Kennen die Regeln die Zusammenfassung noch nicht,
   * wird nur die Bewertung geschrieben (wie bisher), damit das Speichern nicht scheitert.
   */
  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    if (!hasStatsSource(data)) throw new Error('saveRating: unvollständige Bewertung, Zusammenfassung kann nicht gebildet werden.');
    const withSummary = await this.statsMode.writesSummary();
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    batch.set(doc(db, 'teams', this.team.id(), 'events', eventId, 'ratings', playerId), { ...data, playerId }, { merge: true });
    if (withSummary) batch.set(doc(db, 'teams', this.team.id(), 'playerStats', playerId), statsUpdate(playerId, eventId, data), { merge: true });
    await batch.commit();
  }

  /** Echtzeit-Abo auf das Trainer-Dokument (Notiz und Punkte) eines Spielers in einem Event; null = es gibt keins. Nur Trainer. */
  async watchPrivateDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /**
   * Schreibt die Trainingspunkte (SCRUM-104) ins Trainer-Dokument des Spielers (merge: die Notiz bleibt erhalten).
   * Wie die interne Notiz bewusst im Pfad, den Spieler und Eltern nie lesen.
   */
  async savePoints(eventId: string, playerId: string, points: number): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId), { playerId, points }, { merge: true });
  }

  /** Schreibt die interne Notiz. Sie liegt bewusst getrennt von der Bewertung, die Spieler und Eltern lesen dürfen. */
  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId), { playerId, note }, { merge: true });
  }
}
