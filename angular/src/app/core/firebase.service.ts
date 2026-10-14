import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { FirebaseConnection } from './firebase/firebase-connection';
import type { RawDoc, SnapshotMeta } from './firebase/types';

/** Unterkollektionen eines Spielers, die beim Löschen mitgehen (Entwicklungspläne, Abwesenheiten, Messwerte). */
const PLAYER_SUBCOLLECTIONS = ['developmentPlans', 'absences', 'measurements'] as const;

/** Unterkollektionen eines Spielers, die das Profil verwaltet. */
export type PlayerRecordKind = 'developmentPlans' | 'absences' | 'measurements';

/**
 * Firestore-Zugriff auf die Teamdaten (Übergangszustand der Aufteilung SCRUM-108..110):
 * Anmeldung und Zugänge liegen schon in `firebase/auth.api.ts` und `firebase/access.api.ts`,
 * die übrigen Themen folgen in eigene Zugriffsklassen. Alle Pfade liegen unter teams/{teamId}/…
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly connection = inject(FirebaseConnection);

  /**
   * Echtzeit-Abo auf alle Spieler des Teams. Die Regeln erlauben Lesen für Trainer und Medizin
   * (Spieler/Eltern nur das eigene Profil); ein Fehler (z. B. permission-denied) kommt über `onError`.
   */
  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'players'),
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
   * Echtzeit-Abo auf EIN Spielerdokument (null = es gibt keins). Spieler und Eltern dürfen die Spielerliste nicht
   * abfragen, nur ihr eigenes Dokument lesen (Regeln: `isPlayerFor`); ein fremdes liefert permission-denied.
   */
  async watchPlayerDoc(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'players', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /**
   * Echtzeit-Abo auf die Events des Teams (nur Metadaten: Bewertungen und interne Notizen liegen in
   * Unterkollektionen). Lesen dürfen alle Teammitglieder; ein Fehler kommt über `onError`.
   */
  async watchEvents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'events'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  /** Echtzeit-Abo auf die Startelf (`meta/lineup`, ein einzelnes Dokument; null = noch keine gespeichert). Nur Trainer. */
  async watchLineup(
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { doc, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      doc(db, 'teams', environment.teamId, 'meta', 'lineup'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

  /** Schreibt die Startelf vollständig (wie die bisherige App: das Dokument wird ersetzt). */
  async saveLineup(data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'meta', 'lineup'), data);
  }

  /** Echtzeit-Abo auf die Gegnerprofile. Lesen und Schreiben dürfen nur Trainer. */
  async watchOpponents(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    const { db } = await this.connection.get();
    const { collection, onSnapshot } = await import('firebase/firestore');
    return onSnapshot(
      collection(db, 'teams', environment.teamId, 'opponents'),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(
          snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })),
          { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites },
        ),
      onError,
    );
  }

  async saveOpponent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'opponents', id), data, { merge: true });
  }

  async deleteOpponent(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', environment.teamId, 'opponents', id));
  }

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
      collection(db, 'teams', environment.teamId, 'events', eventId, name),
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
      doc(db, 'teams', environment.teamId, 'events', eventId, 'ratings', playerId),
      { includeMetadataChanges: true },
      (snapshot) =>
        onData(snapshot.exists() ? snapshot.data() : null, { fromCache: snapshot.metadata.fromCache, hasPendingWrites: snapshot.metadata.hasPendingWrites }),
      onError,
    );
  }

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
    const records = collection(db, 'teams', environment.teamId, 'players', playerId, name);
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

  /** Einmaliges Lesen einer Unterkollektion eines Spielers (Förderpläne, Abwesenheiten, Messwerte). */
  async readPlayerRecords(playerId: string, name: PlayerRecordKind): Promise<RawDoc[]> {
    const { db } = await this.connection.get();
    const { collection, getDocs } = await import('firebase/firestore');
    const snapshot = await getDocs(collection(db, 'teams', environment.teamId, 'players', playerId, name));
    return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
  }

  /** Einmaliges Lesen der Bewertung eines Spielers in einem Event (null = es gibt keine). */
  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    const { db } = await this.connection.get();
    const { doc, getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'teams', environment.teamId, 'events', eventId, 'ratings', playerId));
    return snapshot.exists() ? snapshot.data() : null;
  }

  /** Schreibt einen Eintrag vollständig (wie die bisherige App, mit `playerId` für Abfragen und Regeln). */
  async savePlayerRecord(playerId: string, name: PlayerRecordKind, id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'players', playerId, name, id), { ...data, playerId });
  }

  async deletePlayerRecord(playerId: string, name: PlayerRecordKind, id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'teams', environment.teamId, 'players', playerId, name, id));
  }

  /** Selbstreflexion: ändert nur diese beiden Felder des Förderplans (so erlauben es die Regeln dem Spieler). */
  async saveSelfReflection(playerId: string, planId: string, text: string, at: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(
      doc(db, 'teams', environment.teamId, 'players', playerId, 'developmentPlans', planId),
      { selfReflection: text, selfReflectionAt: at },
      { merge: true },
    );
  }

  /** Schreibt die Bewertung eines Spielers (merge, mit `playerId` für die Regeln und Abfragen der Spieleransicht). */
  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'events', eventId, 'ratings', playerId), { ...data, playerId }, { merge: true });
  }

  /** Schreibt die interne Notiz. Sie liegt bewusst getrennt von der Bewertung, die Spieler und Eltern lesen dürfen. */
  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'events', eventId, 'privateNotes', playerId), { playerId, note }, { merge: true });
  }

  /** Legt ein Event an oder aktualisiert es (merge: Felder älterer Versionen bleiben erhalten). Nur Metadaten, nie Bewertungen. */
  async saveEvent(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'events', id), data, { merge: true });
  }

  /** Löscht das Event samt Bewertungen und internen Notizen (in Blöcken, Limit 500 je Schreibvorgang). */
  async deleteEvent(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { collection, doc, getDocs, writeBatch } = await import('firebase/firestore');
    const base = ['teams', environment.teamId, 'events', id] as const;
    const [ratings, privateNotes] = await Promise.all([
      getDocs(collection(db, ...base, 'ratings')),
      getDocs(collection(db, ...base, 'privateNotes')),
    ]);
    const refs = [
      ...ratings.docs.map((entry) => entry.ref),
      ...privateNotes.docs.map((entry) => entry.ref),
      doc(db, ...base), // zuletzt: bricht ein Block ab, bleibt das Event sichtbar und der Löschversuch wiederholbar
    ];
    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  /** Legt einen Spieler an oder aktualisiert ihn (merge: unbekannte Felder älterer Versionen bleiben erhalten). */
  async savePlayer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    const { db } = await this.connection.get();
    const { doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'teams', environment.teamId, 'players', id), data, { merge: true });
  }

  /** Löscht den Spieler samt Unterdaten, Bewertungen und internen Notizen in allen Events (in Blöcken, Limit 500 je Schreibvorgang). */
  async deletePlayer(id: string): Promise<void> {
    const { db } = await this.connection.get();
    const { collection, doc, getDocs, query, where, writeBatch } = await import('firebase/firestore');
    const base = ['teams', environment.teamId] as const;
    const [events, invites, members, ...children] = await Promise.all([
      getDocs(collection(db, ...base, 'events')),
      getDocs(query(collection(db, ...base, 'invites'), where('playerId', '==', id))),
      getDocs(query(collection(db, ...base, 'members'), where('playerId', '==', id))),
      ...PLAYER_SUBCOLLECTIONS.map((name) => getDocs(collection(db, ...base, 'players', id, name))),
    ]);
    const refs = [
      ...children.flatMap((snapshot) => snapshot.docs.map((entry) => entry.ref)),
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'ratings', id)),
      // Interne Trainer-Notizen (SCRUM-14) liegen getrennt von der Bewertung.
      ...events.docs.map((event) => doc(db, ...base, 'events', event.id, 'privateNotes', id)),
      // Einladungscodes und Zugänge des Spielers (SCRUM-53): sonst zeigen sie auf einen gelöschten Spieler.
      ...invites.docs.map((entry) => entry.ref),
      ...members.docs.map((entry) => entry.ref),
      doc(db, ...base, 'players', id), // zuletzt: bricht ein Block ab, bleibt der Spieler sichtbar und der Löschversuch wiederholbar
    ];
    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = writeBatch(db);
      refs.slice(offset, offset + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }
}
