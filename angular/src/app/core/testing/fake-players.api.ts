import type { PlayersApi } from '../firebase/players.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

/** Ersatz für {@link PlayersApi} in Tests (Echtzeit-Abo wie bei Firestore: lokale Schreibvorgänge melden sofort einen neuen Stand). */
export class FakePlayersApi implements Pick<PlayersApi, keyof PlayersApi> {
  constructor(readonly calls: string[] = []) {}

  players = new Map<string, Record<string, unknown>>();
  playersMeta: SnapshotMeta = { fromCache: false, hasPendingWrites: false };
  watchPlayersError: unknown = null;
  savePlayerError: unknown = null;
  deletePlayerError: unknown = null;
  playerWatchers = 0;
  private playersListener: ((docs: RawDoc[], meta: SnapshotMeta) => void) | null = null;
  private playersErrorListener: ((error: unknown) => void) | null = null;

  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push('watchPlayers');
    if (this.watchPlayersError) throw this.watchPlayersError;
    this.playerWatchers += 1;
    this.playersListener = onData;
    this.playersErrorListener = onError;
    this.emitPlayers();
    return () => {
      this.playerWatchers -= 1;
      this.playersListener = null;
      this.playersErrorListener = null;
    };
  }

  /** Test-Hilfe: sendet den aktuellen Spielerstand an den Abonnenten. */
  emitPlayers(meta: SnapshotMeta = this.playersMeta): void {
    this.playersMeta = meta;
    this.playersListener?.(
      [...this.players].map(([id, data]) => ({ id, data })),
      meta,
    );
  }

  /** Test-Hilfe: Abo-Fehler (z. B. permission-denied). */
  failPlayers(error: unknown): void {
    this.playersErrorListener?.(error);
  }

  async savePlayer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePlayer:${id}`);
    if (this.savePlayerError) throw this.savePlayerError;
    this.players.set(id, { ...this.players.get(id), ...data });
    this.emitPlayers();
  }

  async deletePlayer(id: string): Promise<void> {
    this.calls.push(`deletePlayer:${id}`);
    if (this.deletePlayerError) throw this.deletePlayerError;
    this.players.delete(id);
    this.emitPlayers();
  }

  // --- Einzelnes Spielerdokument (Spieler/Eltern dürfen nur das eigene lesen) ---
  watchPlayerDocError: unknown = null;
  /** Spieler-IDs, deren Dokument gelesen werden darf; `null` = alle (wie ein Trainer). Andere melden permission-denied. */
  readablePlayerDocs: Set<string> | null = null;

  async watchPlayerDoc(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchPlayerDoc:${playerId}`);
    if (this.watchPlayerDocError) throw this.watchPlayerDocError;
    if (this.readablePlayerDocs && !this.readablePlayerDocs.has(playerId)) {
      onError({ code: 'permission-denied' });
      return () => undefined;
    }
    onData(this.players.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => undefined;
  }
}
