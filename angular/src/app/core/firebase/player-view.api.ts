import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { gradesDoc, valuesDoc } from '../ratings/player-view';
import { FirebaseConnection } from './firebase-connection';
import type { RatingDocsByEvent } from './player-stats.api';
import type { SnapshotMeta } from './types';

/** Kennzeichen „Kopien für die Spieleransicht sind angelegt“ (`meta/playerView`, SCRUM-115). */
export interface PlayerViewMarker {
  readonly version: number;
  readonly builtAt: string;
}

/**
 * Einmalige Übernahme bestehender Bewertungen ins neue Format (SCRUM-115): legt zu jeder Bewertung die Werte- und die
 * Noten-Kopie an (`ratingValues`, `ratingGrades`) und setzt danach das Kennzeichen. Die Bewertungen selbst werden nicht
 * verändert – es geht nichts verloren. Nur Trainer (firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class PlayerViewApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);

  /** Echtzeit-Abo auf das Kennzeichen (null = gibt es nicht). */
  async watchMarker(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'meta', 'playerView'),
      (snapshot) => onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /**
   * Schreibt die Kopien aller übergebenen Bewertungen (Blöcke zu höchstens 400 Schreibvorgängen, jeder für sich atomar)
   * und zuletzt das Kennzeichen. Rückgabe: Anzahl der Bewertungen. Bricht ein Block ab, fehlt das Kennzeichen und die
   * Übernahme läuft beim nächsten Öffnen erneut (sie ist wiederholbar).
   */
  async writeCopies(ratings: RatingDocsByEvent, marker: PlayerViewMarker): Promise<number> {
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, setDoc, writeBatch } = await import('firebase/firestore');
    const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
    for (const [eventId, docs] of ratings) {
      const base = ['teams', this.team.id(), 'events', eventId] as const;
      for (const entry of docs) {
        ops.push((batch) => batch.set(doc(db, ...base, 'ratingValues', entry.id), valuesDoc(entry.id, entry.data)));
        ops.push((batch) => batch.set(doc(db, ...base, 'ratingGrades', entry.id), { ...gradesDoc(entry.id, entry.data), ratedAt: serverTimestamp() }));
      }
    }
    for (let offset = 0; offset < ops.length; offset += 400) {
      const batch = writeBatch(db);
      ops.slice(offset, offset + 400).forEach((op) => op(batch));
      await batch.commit();
    }
    await setDoc(doc(db, 'teams', this.team.id(), 'meta', 'playerView'), { ...marker });
    return ops.length / 2;
  }
}
