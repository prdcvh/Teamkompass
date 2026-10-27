/**
 * Funkloch auf dem Platz (SCRUM-216): Postausgang für Live-Punkte auf dem Gerät.
 *
 * Jede Änderung im Live-Modus bekommt eine eigene Kennung und wird – bevor sie an die Datenbank geht – hier im
 * Gerätespeicher abgelegt. Erst wenn der Server sie bestätigt hat, fliegt sie wieder heraus. So
 *  - weiß die App auch nach einem Neustart ohne Netz, wie viele Änderungen noch nicht angekommen sind (Anzeige),
 *  - schickt sie beim nächsten Öffnen alles noch einmal, falls der Offline-Speicher von Firestore nicht verfügbar war
 *    (z. B. privates Fenster) oder geleert wurde.
 * Doppelt zählen kann dabei nichts: Die Datenbank legt jede Änderung unter ihrer Kennung ab (siehe `LIVE_POINTS_FIELD`),
 * ein zweites Senden überschreibt nur denselben Eintrag mit demselben Wert.
 */

export const OUTBOX_STORAGE_KEY = 'teamkompass-live-outbox';

export interface PendingLiveChange {
  /** Kennung der Änderung (Schlüssel in der Datenbank). */
  readonly id: string;
  /** Konto und Team, in dem die Änderung entstand: gesendet wird nur unter genau diesen. */
  readonly uid: string;
  readonly teamId: string;
  readonly eventId: string;
  readonly playerId: string;
  readonly delta: number;
  /** Zeitpunkt der Änderung (ms), nur zur Reihenfolge und Fehlersuche. */
  readonly at: number;
}

/** Neue, eindeutige Kennung (nur Buchstaben/Ziffern, damit sie sicher als Feldname taugt). */
export function newChangeId(random: () => string = defaultRandom, now: number = Date.now()): string {
  return `${now.toString(36)}${random()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
}

function defaultRandom(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // ohne Web Crypto: Rückfall unten
  }
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function isPendingChange(value: unknown): value is PendingLiveChange {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['id'] === 'string' && /^[a-zA-Z0-9]{8,40}$/.test(entry['id']) &&
    typeof entry['uid'] === 'string' && entry['uid'] !== '' &&
    typeof entry['teamId'] === 'string' && entry['teamId'] !== '' &&
    typeof entry['eventId'] === 'string' && entry['eventId'] !== '' &&
    typeof entry['playerId'] === 'string' && entry['playerId'] !== '' &&
    typeof entry['delta'] === 'number' && Number.isInteger(entry['delta']) && entry['delta'] !== 0 &&
    typeof entry['at'] === 'number'
  );
}

/** Gespeicherten Postausgang lesen; Kaputtes wird übersprungen, doppelte Kennungen zählen einmal. */
export function loadOutbox(storage: Pick<Storage, 'getItem'> | null): PendingLiveChange[] {
  try {
    const raw = storage?.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data.filter((entry): entry is PendingLiveChange => {
      if (!isPendingChange(entry) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  } catch {
    return [];
  }
}

/** Speichert den Postausgang. Rückgabe: hat es geklappt? (false z. B. bei gesperrtem Speicher) */
export function saveOutbox(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, entries: readonly PendingLiveChange[]): boolean {
  if (!storage) return false;
  try {
    if (entries.length === 0) storage.removeItem(OUTBOX_STORAGE_KEY);
    else storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** Änderungen, die zum angemeldeten Konto und aktuellen Team gehören (nur diese werden gezählt und gesendet). */
export function outboxFor(entries: readonly PendingLiveChange[], uid: string | null, teamId: string): PendingLiveChange[] {
  if (!uid) return [];
  return entries.filter((entry) => entry.uid === uid && entry.teamId === teamId);
}

export type LiveSaveKind = 'saved' | 'saving' | 'offline' | 'error';

export interface LiveSaveStatus {
  readonly kind: LiveSaveKind;
  readonly text: string;
}

export interface LiveSaveInput {
  /** Änderungen im Postausgang (noch nicht vom Server bestätigt). */
  readonly pending: number;
  /** Meldet der Browser eine Verbindung? (`navigator.onLine`) */
  readonly online: boolean;
  /** Letzter Snapshot der Punkte stammt nur aus dem Gerätespeicher (Firestore erreicht den Server nicht). */
  readonly fromCache: boolean;
  /** Letzter Snapshot enthält lokale, noch nicht bestätigte Änderungen. */
  readonly hasPendingWrites: boolean;
  /** Ein Schreibvorgang wurde abgelehnt (Anzeige über den bestehenden Fehlerhinweis). */
  readonly failed: boolean;
}

function waitingText(pending: number): string {
  return pending === 1 ? '1 Änderung wartet' : `${pending} Änderungen warten`;
}

/**
 * Zustandshinweis oben im Live-Modus (SCRUM-216) aus Postausgang, Browser-Verbindung und Snapshot-Angaben:
 * „Gespeichert“ nur, wenn wirklich nichts mehr aussteht und der Server erreichbar ist.
 */
export function liveSaveStatus(input: LiveSaveInput): LiveSaveStatus {
  const pending = Math.max(0, Math.floor(input.pending));
  if (input.failed) return { kind: 'error', text: pending > 0 ? `Nicht gespeichert – ${waitingText(pending)}` : 'Nicht gespeichert' };
  if (!input.online || input.fromCache) {
    return { kind: 'offline', text: pending > 0 ? `Offline – wird gespeichert, sobald Netz da ist (${waitingText(pending)})` : 'Offline – wird gespeichert, sobald Netz da ist' };
  }
  if (pending > 0 || input.hasPendingWrites) return { kind: 'saving', text: pending > 0 ? `Wird gespeichert … (${waitingText(pending)})` : 'Wird gespeichert …' };
  return { kind: 'saved', text: 'Gespeichert' };
}
