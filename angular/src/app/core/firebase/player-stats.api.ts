import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { PlayerStatsDoc } from '../team/player-stats';
import { FirebaseConnection } from './firebase-connection';
import type { RawDoc, SnapshotMeta } from './types';

/** Kennzeichen „Zusammenfassungen sind eingerichtet“ (`meta/playerStats`): Version und Zeitpunkt der Neuberechnung. */
export interface PlayerStatsMarker {
  readonly version: number;
  readonly builtAt: string;
}

/** Alle Bewertungsdokumente je bestehendem Event (eventId → Dokumente je Spieler). */
export type RatingDocsByEvent = ReadonlyMap<string, readonly RawDoc[]>;

/**
 * Zusammenfassungen je Spieler `teams/{teamId}/playerStats/{playerId}` und ihr Kennzeichen `meta/playerStats`
 * (SCRUM-201). Lesen und schreiben darf nur der Trainer (siehe firestore.rules). Das laufende Mitschreiben beim
 * Speichern einer Bewertung erledigt {@link RatingsApi.saveRating} im selben Schreibvorgang.
 */
@Injectable({ providedIn: 'root' })
export class PlayerStatsApi {
  private readonly connection = inject(FirebaseConnection);

  /** Echtzeit-Abo auf das Kennzeichen (null = gibt es nicht). */
  async watchMarker(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'meta', 'playerStats'),
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Echtzeit-Abo auf alle Zusammenfassungen (ein Dokument je Spieler). */
  async watchPlayerStats(onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'playerStats'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Liest alle Zusammenfassungen einmalig vom Server (für die Prüfung). */
  async readPlayerStats(): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocsFromServer } = await import('firebase/firestore');
    const snapshot = await getDocsFromServer(collection(db, 'teams', environment.teamId, 'playerStats'));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /**
   * Liest alle Bewertungen der genannten Events (ohne Angabe: aller bestehenden Events) einmalig vom Server
   * (Neuberechnung, Prüfung, JSON-Sicherung). Ein Lesevorgang je Bewertung – nur auf ausdrücklichen Knopfdruck.
   */
  async readAllRatings(eventIds: readonly string[] | null = null): Promise<RatingDocsByEvent> {
    const { db } = await this.connection.get();
    const { collection, getDocsFromServer } = await import('firebase/firestore');
    const ids = eventIds ?? (await getDocsFromServer(collection(db, 'teams', environment.teamId, 'events'))).docs.map((entry) => entry.id);
    const result = new Map<string, RawDoc[]>();
    for (let offset = 0; offset < ids.length; offset += 10) {
      await Promise.all(
        ids.slice(offset, offset + 10).map(async (id) => {
          const snapshot = await getDocsFromServer(collection(db, 'teams', environment.teamId, 'events', id, 'ratings'));
          result.set(id, snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })));
        }),
      );
    }
    // Reihenfolge wie die Eventliste (stabil für Tests und die Prüfung).
    return new Map(ids.map((id) => [id, result.get(id) ?? []]));
  }

  /**
   * Neuberechnung: ersetzt die Zusammenfassungen vollständig, löscht verwaiste und setzt zuletzt das Kennzeichen.
   * Blöcke zu höchstens 400 Schreibvorgängen (Limit 500), jeder Block für sich atomar.
   */
  async writeRebuild(set: readonly PlayerStatsDoc[], remove: readonly string[], marker: PlayerStatsMarker): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, writeBatch } = await import('firebase/firestore');
    const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [
      ...set.map((entry) => (batch: ReturnType<typeof writeBatch>) => batch.set(doc(db, 'teams', environment.teamId, 'playerStats', entry.playerId), entry)),
      ...remove.map((id) => (batch: ReturnType<typeof writeBatch>) => batch.delete(doc(db, 'teams', environment.teamId, 'playerStats', id))),
    ];
    for (let offset = 0; offset < ops.length; offset += 400) {
      const batch = writeBatch(db);
      ops.slice(offset, offset + 400).forEach((op) => op(batch));
      await batch.commit();
    }
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'playerStats'), { ...marker });
  }
}
