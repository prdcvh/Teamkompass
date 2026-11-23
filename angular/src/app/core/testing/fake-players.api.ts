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

  /** Optionen des letzten watchPlayers-Aufrufs (Medizin filtert widerrufene Einwilligungen heraus). */
  lastWatchOptions: { readonly withoutRevokedConsent?: boolean } = {};

  async watchPlayers(
    onData: (docs: RawDoc[], meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
    options: { readonly withoutRevokedConsent?: boolean } = {},
  ): Promise<() => void> {
    this.calls.push('watchPlayers');
    this.lastWatchOptions = options;
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
      [...this.players]
        // Wie die Firestore-Abfrage where('consentStatus', '!=', 'revoked'): ohne Feld oder widerrufen → nicht dabei.
        .filter(([, data]) => !this.lastWatchOptions.withoutRevokedConsent || (typeof data['consentStatus'] === 'string' && data['consentStatus'] !== 'revoked'))
        .map(([id, data]) => ({ id, data })),
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

  // --- Bereinigte Karten (SCRUM-245) ---
  cards = new Map<string, Record<string, unknown>>();
  private cardsListener: ((docs: RawDoc[]) => void) | null = null;
  private cardListeners = new Map<string, (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void>();

  async watchPlayerCard(
    playerId: string,
    onData: (data: Readonly<Record<string, unknown>> | null, meta: SnapshotMeta) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void> {
    this.calls.push(`watchPlayerCard:${playerId}`);
    if (this.readablePlayerCards && !this.readablePlayerCards.has(playerId)) {
      onError({ code: 'permission-denied' });
      return () => undefined;
    }
    this.cardListeners.set(playerId, onData);
    onData(this.cards.get(playerId) ?? null, { fromCache: false, hasPendingWrites: false });
    return () => this.cardListeners.delete(playerId);
  }

  /** Karten, die gelesen werden dürfen; `null` = alle. */
  readablePlayerCards: Set<string> | null = null;

  async watchPlayerCards(onData: (docs: RawDoc[]) => void, onError: (error: unknown) => void): Promise<() => void> {
    void onError;
    this.calls.push('watchPlayerCards');
    this.cardsListener = onData;
    this.emitCards();
    return () => {
      this.cardsListener = null;
    };
  }

  async applyPlayerCards(changes: ReadonlyMap<string, Readonly<Record<string, unknown>> | null>): Promise<void> {
    this.calls.push(`applyPlayerCards:${[...changes.keys()].join(',')}`);
    for (const [id, data] of changes) {
      if (data) this.cards.set(id, { ...data });
      else this.cards.delete(id);
      this.cardListeners.get(id)?.(data, { fromCache: false, hasPendingWrites: false });
    }
    this.emitCards();
  }

  private emitCards(): void {
    this.cardsListener?.([...this.cards].map(([id, data]) => ({ id, data })));
  }
}
