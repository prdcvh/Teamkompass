import { Injectable, inject } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { PlayerStatsMode } from '../team/player-stats-mode';
import { hasStatsSource, statsUpdate } from '../team/player-stats';
import { FirebaseConnection } from './firebase-connection';
import { LIVE_POINTS_FIELD } from '../points/points';
import { PlayerViewMode } from '../ratings/player-view-mode';
import { gradesChanged, gradesDoc, valuesDoc } from '../ratings/player-view';
import type { RawDoc, SnapshotMeta } from './types';

/**
 * Bewertungen je Event und Spieler sowie die internen Trainer-Notizen (getrennt gespeichert, nur Trainer lesen sie).
 * Spieler und Eltern lesen nur die Kopien `ratingValues`/`ratingGrades` (SCRUM-115, siehe `ratings/player-view.ts`).
 */
@Injectable({ providedIn: 'root' })
export class RatingsApi {
  private readonly connection = inject(FirebaseConnection);
  private readonly team = inject(CurrentTeam);
  private readonly statsMode = inject(PlayerStatsMode);
  private readonly viewMode = inject(PlayerViewMode);

  /** Echtzeit-Abo auf die Bewertungen eines Events (Dokument je Spieler). Nur Trainer. */
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
   * Echtzeit-Abo auf die vollständige Bewertung eines einzelnen Spielers in einem Event (Dokument oder „gibt es nicht“ =
   * null). Nur Trainer (seit SCRUM-115); Spieler und Eltern lesen {@link watchValuesDoc} und {@link watchGradesDoc}.
   */
  async watchRatingDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    return this.watchPlayerDoc('ratings', eventId, playerId, onData, onError);
  }

  /** Werte-Kopie (Anwesenheit, Minuten, Tore, Vorlagen) für die Spieleransicht (SCRUM-115). */
  async watchValuesDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    return this.watchPlayerDoc('ratingValues', eventId, playerId, onData, onError);
  }

  /** Noten-Kopie für die Spieleransicht; die Regeln geben sie nur bei gültiger Freigabe heraus (SCRUM-115). */
  async watchGradesDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    return this.watchPlayerDoc('ratingGrades', eventId, playerId, onData, onError);
  }

  private async watchPlayerDoc(
    name: 'ratings' | 'ratingValues' | 'ratingGrades',
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', this.team.id(), 'events', eventId, name, playerId),
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
   * Schreibt die Bewertung eines Spielers (merge, mit `playerId` für die Regeln) und im selben atomaren Schreibvorgang
   * - den Eintrag dieses Events in der Zusammenfassung des Spielers (SCRUM-201) und
   * - die Kopien für die Spieleransicht (SCRUM-115): die Werte immer, die Noten nur, wenn sie sich gegenüber `previous`
   *   geändert haben (dann mit neuem Server-Zeitpunkt – sie sind für Spieler erst nach der nächsten Veröffentlichung
   *   sichtbar). `previous` ist die bisherige Bewertung (Dokumentfelder), `null` = es gab keine, weggelassen = unbekannt
   *   (dann werden die Noten sicherheitshalber neu geschrieben).
   * So kann keine Kopie von der Bewertung abweichen. `data` muss alle Felder einer Bewertung enthalten (siehe
   * `docFromRating`). Kennen die Regeln Zusammenfassung oder Kopien noch nicht, entfällt der jeweilige Teil, damit das
   * Speichern nicht scheitert.
   */
  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>, previous?: Readonly<Record<string, unknown>> | null): Promise<void> {
    if (!hasStatsSource(data)) throw new Error('saveRating: unvollständige Bewertung, Zusammenfassung kann nicht gebildet werden.');
    const [withSummary, withCopies] = await Promise.all([this.statsMode.writesSummary(), this.viewMode.writesCopies()]);
    const { db } = await this.connection.get();
    const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(db);
    const base = ['teams', this.team.id(), 'events', eventId] as const;
    batch.set(doc(db, ...base, 'ratings', playerId), { ...data, playerId }, { merge: true });
    if (withSummary) batch.set(doc(db, 'teams', this.team.id(), 'playerStats', playerId), statsUpdate(playerId, eventId, data), { merge: true });
    if (withCopies) {
      batch.set(doc(db, ...base, 'ratingValues', playerId), valuesDoc(playerId, data));
      if (gradesChanged(previous, data)) batch.set(doc(db, ...base, 'ratingGrades', playerId), { ...gradesDoc(playerId, data), ratedAt: serverTimestamp() });
    }
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
   * Wie die interne Notiz bewusst im Pfad, den Spieler und Eltern nie lesen. `points` ist der Grundwert; Live-Änderungen
   * (`live`) kommen dazu – wer einen Endwert eintragen will, übergibt deshalb Endwert minus Summe der Live-Änderungen.
   */
  async savePoints(eventId: string, playerId: string, points: number): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId), { playerId, points }, { merge: true });
  }

  /**
   * Live-Modus (SCRUM-213/216): legt eine einzelne Punkte-Änderung unter ihrer Kennung im Trainer-Dokument ab
   * (`live.<changeId> = delta`, merge). Mehrfaches Senden derselben Änderung (Funkloch, Neustart) schreibt denselben
   * Eintrag mit demselben Wert und zählt daher genau einmal; Änderungen anderer Trainer haben eigene Kennungen und werden
   * addiert. Die Punkte ergeben sich aus `points` + Summe aller Einträge (`pointsFromDoc`). Regeln unverändert (Trainer-Pfad).
   */
  async addPoints(eventId: string, playerId: string, changeId: string, delta: number): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(
      doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId),
      { playerId, [LIVE_POINTS_FIELD]: { [changeId]: delta } },
      { merge: true },
    );
  }

  /** Schreibt die interne Notiz (Trainer-Pfad, getrennt von der Bewertung). */
  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', this.team.id(), 'events', eventId, 'privateNotes', playerId), { playerId, note }, { merge: true });
  }
}
