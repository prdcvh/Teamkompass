import type { Provider } from '@angular/core';
import { AccessApi } from '../firebase/access.api';
import { AuthApi } from '../firebase/auth.api';
import { EventsApi } from '../firebase/events.api';
import { LineupApi } from '../firebase/lineup.api';
import { OpponentsApi } from '../firebase/opponents.api';
import { PlayersApi } from '../firebase/players.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import { FirebaseService } from '../firebase.service';
import { FakeAccessApi } from './fake-access.api';
import { FakeAuthApi } from './fake-auth.api';
import { FakeEventsApi } from './fake-events.api';
import { FakeLineupApi } from './fake-lineup.api';
import { FakeOpponentsApi } from './fake-opponents.api';
import { FakePlayersApi } from './fake-players.api';

/**
 * Ersatz für {@link FirebaseService} in Tests: speichert Aufrufe und liefert vorgegebene Antworten.
 * Anmeldung, Zugänge, Spieler, Events, Startelf und Gegner haben eigene Attrappen; alle schreiben in dieselbe
 * Aufrufliste `calls`, damit Tests die Reihenfolge über Themen hinweg prüfen können.
 */
export class FakeFirebase implements Pick<FirebaseService, keyof FirebaseService> {
  calls: string[] = [];
  readonly auth = new FakeAuthApi(this.calls);
  readonly access = new FakeAccessApi(this.calls);
  readonly players = new FakePlayersApi(this.calls);
  readonly events = new FakeEventsApi(this.calls);
  readonly lineup = new FakeLineupApi(this.calls);
  readonly opponents = new FakeOpponentsApi(this.calls);

  // --- Bewertungen und interne Notizen je Event ---
  ratings = new Map<string, Map<string, Record<string, unknown>>>();
  privateNotes = new Map<string, Map<string, Record<string, unknown>>>();
  watchRatingsError: unknown = null;
  saveRatingError: unknown = null;
  savePrivateNoteError: unknown = null;
  ratingWatchers = 0;
  private subListeners = new Map<string, { onData: (docs: RawDoc[], meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  private subStore(name: 'ratings' | 'privateNotes') {
    return name === 'ratings' ? this.ratings : this.privateNotes;
  }

  private async watchSub(
    name: 'ratings' | 'privateNotes',
    eventId: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watch${name === 'ratings' ? 'Ratings' : 'PrivateNotes'}:${eventId}`);
    if (this.watchRatingsError) throw this.watchRatingsError;
    this.ratingWatchers += 1;
    const key = `${name}:${eventId}`;
    this.subListeners.set(key, { onData, onError });
    this.emitSub(name, eventId);
    return () => {
      this.ratingWatchers -= 1;
      this.subListeners.delete(key);
    };
  }

  watchRatings(eventId: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) {
    return this.watchSub('ratings', eventId, onData, onError);
  }

  watchPrivateNotes(eventId: string, onData: (docs: RawDoc[], meta: SnapshotMeta) => void, onError: (error: unknown) => void) {
    return this.watchSub('privateNotes', eventId, onData, onError);
  }

  private emitSub(name: 'ratings' | 'privateNotes', eventId: string): void {
    const docs = [...(this.subStore(name).get(eventId) ?? new Map())].map(([id, data]) => ({ id, data }));
    this.subListeners.get(`${name}:${eventId}`)?.onData(docs, { fromCache: false, hasPendingWrites: false });
  }

  /** Test-Hilfe: Abo-Fehler eines Unterpfads (z. B. permission-denied). */
  failSub(name: 'ratings' | 'privateNotes', eventId: string, error: unknown): void {
    this.subListeners.get(`${name}:${eventId}`)?.onError(error);
  }

  async saveRating(eventId: string, playerId: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`saveRating:${eventId}:${playerId}`);
    if (this.saveRatingError) throw this.saveRatingError;
    const store = this.ratings.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { ...store.get(playerId), ...data, playerId });
    this.ratings.set(eventId, store);
    this.emitSub('ratings', eventId);
    this.pushRatingDoc(eventId, playerId, store.get(playerId) ?? null);
  }

  async savePrivateNote(eventId: string, playerId: string, note: string): Promise<void> {
    this.calls.push(`savePrivateNote:${eventId}:${playerId}`);
    if (this.savePrivateNoteError) throw this.savePrivateNoteError;
    const store = this.privateNotes.get(eventId) ?? new Map<string, Record<string, unknown>>();
    store.set(playerId, { playerId, note });
    this.privateNotes.set(eventId, store);
    this.emitSub('privateNotes', eventId);
  }

  // --- Bewertung eines einzelnen Spielers je Event (Profil) ---
  ratingDocWatchers = 0;
  watchRatingDocError: unknown = null;
  private ratingDocListeners = new Map<string, { onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  async watchRatingDoc(
    eventId: string,
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchRatingDoc:${eventId}:${playerId}`);
    if (this.watchRatingDocError) throw this.watchRatingDocError;
    this.ratingDocWatchers += 1;
    const key = `${eventId}:${playerId}`;
    this.ratingDocListeners.set(key, { onData, onError });
    onData(this.ratings.get(eventId)?.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => {
      this.ratingDocWatchers -= 1;
      this.ratingDocListeners.delete(key);
    };
  }

  /** Test-Hilfe: meldet einer laufenden Profil-Abfrage neue Daten (oder einen Fehler). */
  pushRatingDoc(eventId: string, playerId: string, data: Readonly<Record<string, unknown>> | null): void {
    this.ratingDocListeners.get(`${eventId}:${playerId}`)?.onData(data, { fromCache: false, hasPendingWrites: false });
  }

  failRatingDoc(eventId: string, playerId: string, error: unknown): void {
    this.ratingDocListeners.get(`${eventId}:${playerId}`)?.onError(error);
  }

  // --- Unterkollektionen eines Spielers: Förderpläne, Abwesenheiten, Messwerte ---
  /** Schlüssel: `${playerId}/${kind}`, dann Dokument-ID → Daten. */
  playerRecords = new Map<string, Map<string, Record<string, unknown>>>();
  watchPlayerRecordsError: unknown = null;
  savePlayerRecordError: unknown = null;
  deletePlayerRecordError: unknown = null;
  saveSelfReflectionError: unknown = null;
  recordWatchers = 0;
  private recordListeners = new Map<string, { onData: (docs: RawDoc[], meta: SnapshotMeta) => void; onError: (error: unknown) => void }>();

  private emitRecords(key: string): void {
    const docs = [...(this.playerRecords.get(key) ?? new Map())].map(([id, data]) => ({ id, data }));
    this.recordListeners.get(key)?.onData(docs, { fromCache: false, hasPendingWrites: false });
  }

  async watchPlayerRecords(
    playerId: string,
    name: string,
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    options: { readonly ownOnly?: boolean } = {},
  ): Promise<() => void> {
    this.calls.push(`watchPlayerRecords:${playerId}:${name}`);
    if (options.ownOnly) this.calls.push(`ownOnly:${playerId}:${name}`);
    if (this.watchPlayerRecordsError) throw this.watchPlayerRecordsError;
    this.recordWatchers += 1;
    const key = `${playerId}/${name}`;
    this.recordListeners.set(key, { onData, onError });
    this.emitRecords(key);
    return () => {
      this.recordWatchers -= 1;
      this.recordListeners.delete(key);
    };
  }

  readPlayerRecordsError: unknown = null;

  async readPlayerRecords(playerId: string, name: string): Promise<RawDoc[]> {
    this.calls.push(`readPlayerRecords:${playerId}:${name}`);
    if (this.readPlayerRecordsError) throw this.readPlayerRecordsError;
    return [...(this.playerRecords.get(`${playerId}/${name}`) ?? new Map())].map(([id, data]) => ({ id, data }));
  }

  async readRatingDoc(eventId: string, playerId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`readRatingDoc:${eventId}:${playerId}`);
    return this.ratings.get(eventId)?.get(playerId) ?? null;
  }

  failPlayerRecords(playerId: string, name: string, error: unknown): void {
    this.recordListeners.get(`${playerId}/${name}`)?.onError(error);
  }

  async savePlayerRecord(playerId: string, name: string, id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePlayerRecord:${playerId}:${name}:${id}`);
    if (this.savePlayerRecordError) throw this.savePlayerRecordError;
    const key = `${playerId}/${name}`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(id, { ...data, playerId });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }

  async deletePlayerRecord(playerId: string, name: string, id: string): Promise<void> {
    this.calls.push(`deletePlayerRecord:${playerId}:${name}:${id}`);
    if (this.deletePlayerRecordError) throw this.deletePlayerRecordError;
    const key = `${playerId}/${name}`;
    this.playerRecords.get(key)?.delete(id);
    this.emitRecords(key);
  }

  async saveSelfReflection(playerId: string, planId: string, text: string, at: string): Promise<void> {
    this.calls.push(`saveSelfReflection:${playerId}:${planId}`);
    if (this.saveSelfReflectionError) throw this.saveSelfReflectionError;
    const key = `${playerId}/developmentPlans`;
    const store = this.playerRecords.get(key) ?? new Map<string, Record<string, unknown>>();
    store.set(planId, { ...store.get(planId), selfReflection: text, selfReflectionAt: at });
    this.playerRecords.set(key, store);
    this.emitRecords(key);
  }
}

/** Stellt die Attrappe für alle Firebase-Zugriffsklassen bereit. */
export function provideFakeFirebase(fake: FakeFirebase): Provider[] {
  return [
    { provide: FirebaseService, useValue: fake },
    { provide: AuthApi, useValue: fake.auth },
    { provide: AccessApi, useValue: fake.access },
    { provide: PlayersApi, useValue: fake.players },
    { provide: EventsApi, useValue: fake.events },
    { provide: LineupApi, useValue: fake.lineup },
    { provide: OpponentsApi, useValue: fake.opponents },
  ];
}
