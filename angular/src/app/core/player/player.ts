/**
 * Spielerdaten des Kaders: Modell, Status, Einwilligung, Umwandlung von/nach Firestore und die Prüfung des
 * Formulars. Das Dokument `teams/{teamId}/players/{id}` ist mit der bisherigen App identisch (siehe
 * outputs/team-manager/app.js, savePlayer/normalizePlayer).
 */
import { isIsoDate, todayIso } from '../shared/dates';

export const STANDARD_POSITIONS = ['TW', 'IV', 'LIB', 'LV', 'RV', 'DM', 'ZM', 'OM', 'LM', 'RM', 'LA', 'RA', 'HS', 'ST'] as const;

export const PLAYER_STATUSES = ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export type ConsentStatus = 'pending' | 'granted' | 'revoked';

/**
 * Einwilligung (SCRUM-51): Nur „widerrufen“ löst eine Warnung aus. „Noch offen“ und „dokumentiert“ verhalten sich
 * gleich. Die Warnung blockiert nichts (keine serverseitige Sperre).
 */
export function isConsentRevoked(player: { readonly consentStatus: ConsentStatus } | null | undefined): boolean {
  return player?.consentStatus === 'revoked';
}

export function consentRevokedMessage(name: string): string {
  return `Die Datennutzung für ${name} wurde widerrufen. Bitte Daten prüfen und nur weiter erfassen oder weitergeben, wenn dafür eine andere Rechtsgrundlage besteht.`;
}
export const CONSENT_LABELS: Readonly<Record<ConsentStatus, string>> = {
  pending: 'Einwilligung offen',
  granted: 'Einwilligung dokumentiert',
  revoked: 'Einwilligung widerrufen',
};

export const MAX_NAME_LENGTH = 60;
export const MAX_SHIRT_NUMBER = 99;

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly positions: readonly string[];
  readonly number: number;
  /** ISO-Datum (JJJJ-MM-TT). */
  readonly birthdate: string;
  readonly status: PlayerStatus;
  /** „Ca. verletzt bis“ (ISO-Datum), nur bei Status „Verletzt“; sonst leer. */
  readonly injuryUntil: string;
  /**
   * Seit wann der Status „Verletzt“ gilt (ISO-Datum, beim Setzen des Status automatisch gemerkt); sonst leer.
   * Ohne „ca. verletzt bis“ belegt der Status ab diesem Tag alle Termine mit „Fehlt“ vor (SCRUM-164).
   */
  readonly injuredSince: string;
  readonly consentStatus: ConsentStatus;
  /** „Dokumentiert am“ (ISO-Datum) oder leer. */
  readonly consentDate: string;
}

/** Eingaben aus dem Formular; alles als Text, wie es der Nutzer eingibt. */
export interface PlayerDraft {
  readonly id: string | null;
  readonly name: string;
  readonly positions: readonly string[];
  readonly customPositions: string;
  readonly number: string;
  readonly birthdate: string;
  readonly status: PlayerStatus;
  readonly injuryUntil: string;
  readonly consentStatus: ConsentStatus;
  readonly consentDate: string;
}

export type PlayerErrors = Partial<Record<'name' | 'positions' | 'number' | 'birthdate' | 'injuryUntil' | 'consentDate', string>>;

/** „ZM, OM“ / ['ZM','OM'] → ['ZM','OM'] (ohne Duplikate und Leerstellen). */
export function parsePositions(value: unknown): string[] {
  const source = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const positions = source
    .split(/[,;/|]+/)
    .map((position) => position.trim())
    .filter(Boolean);
  return [...new Set(positions)];
}

/** Kleinste freie Rückennummer (1–99). */
export function nextFreeNumber(players: readonly Player[]): number {
  const used = new Set(players.map((player) => player.number));
  for (let number = 1; number <= MAX_SHIRT_NUMBER; number += 1) if (!used.has(number)) return number;
  return MAX_SHIRT_NUMBER;
}

export function emptyDraft(players: readonly Player[]): PlayerDraft {
  return {
    id: null,
    name: '',
    positions: [],
    customPositions: '',
    number: String(nextFreeNumber(players)),
    birthdate: '',
    status: 'Fit',
    injuryUntil: '',
    consentStatus: 'pending',
    consentDate: '',
  };
}

export function draftFromPlayer(player: Player): PlayerDraft {
  const standard = player.positions.filter((position) => (STANDARD_POSITIONS as readonly string[]).includes(position));
  return {
    id: player.id,
    name: player.name,
    positions: standard,
    customPositions: player.positions.filter((position) => !standard.includes(position)).join(', '),
    number: String(player.number),
    birthdate: player.birthdate,
    status: player.status,
    injuryUntil: player.injuryUntil,
    consentStatus: player.consentStatus,
    consentDate: player.consentDate,
  };
}

/** Alle gewählten und eigenen Positionen, Standardpositionen zuerst in der festen Reihenfolge. */
export function draftPositions(draft: PlayerDraft): string[] {
  const chosen = STANDARD_POSITIONS.filter((position) => draft.positions.includes(position));
  return [...new Set([...chosen, ...parsePositions(draft.customPositions)])];
}

/** Prüft die Eingaben (inkl. eindeutiger Rückennummer). Leeres Ergebnis = gültig. */
export function validateDraft(draft: PlayerDraft, others: readonly Player[], now: Date = new Date()): PlayerErrors {
  const errors: PlayerErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Bitte einen Namen eingeben.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`;

  if (draftPositions(draft).length === 0) errors.positions = 'Bitte mindestens eine Position auswählen oder eintragen.';

  const number = Number(draft.number);
  if (draft.number.trim() === '' || !Number.isInteger(number) || number < 1 || number > MAX_SHIRT_NUMBER) {
    errors.number = `Bitte eine Rückennummer von 1 bis ${MAX_SHIRT_NUMBER} eingeben.`;
  } else if (others.some((player) => player.id !== draft.id && player.number === number)) {
    errors.number = `Rückennummer ${number} ist bereits vergeben.`;
  }

  if (!isIsoDate(draft.birthdate)) errors.birthdate = 'Bitte ein gültiges Geburtsdatum eingeben.';
  else if (draft.birthdate > todayIso(now)) errors.birthdate = 'Das Geburtsdatum darf nicht in der Zukunft liegen.';

  if (draft.status === 'Verletzt' && draft.injuryUntil && !isIsoDate(draft.injuryUntil)) {
    errors.injuryUntil = 'Bitte ein gültiges Datum eingeben.';
  }
  if (draft.consentDate && !isIsoDate(draft.consentDate)) errors.consentDate = 'Bitte ein gültiges Datum eingeben.';
  return errors;
}

/**
 * „Verletzt seit“: bleibt der Spieler verletzt, gilt der bisherige Tag weiter; wird er neu auf „Verletzt“ gesetzt
 * (oder fehlt der Tag bei älteren Daten), gilt heute. Bei jedem anderen Status leer.
 */
export function injuredSinceFor(status: PlayerStatus, previous: Pick<Player, 'status' | 'injuredSince'> | null | undefined, today: string): string {
  if (status !== 'Verletzt') return '';
  return previous?.status === 'Verletzt' && previous.injuredSince ? previous.injuredSince : today;
}

/** Entwurf → Spieler. Setzt voraus, dass `validateDraft` keine Fehler gemeldet hat. */
export function playerFromDraft(draft: PlayerDraft, id: string, previous: Player | null = null, now: Date = new Date()): Player {
  return {
    id,
    name: draft.name.trim(),
    positions: draftPositions(draft),
    number: Number(draft.number),
    birthdate: draft.birthdate,
    status: draft.status,
    injuryUntil: draft.status === 'Verletzt' ? draft.injuryUntil : '',
    injuredSince: injuredSinceFor(draft.status, previous, todayIso(now)),
    consentStatus: draft.consentStatus,
    consentDate: draft.consentDate,
  };
}

/** Dokument → Spieler; versteht auch ältere Dokumente (`position` als Text, `age` statt Geburtsdatum). */
export function playerFromDoc(id: string, data: Readonly<Record<string, unknown>>, now: Date = new Date()): Player {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  let birthdate = text(data['birthdate']);
  if (!isIsoDate(birthdate)) {
    const age = Number(data['age']);
    birthdate = Number.isFinite(age) && age > 0 ? `${now.getFullYear() - age}-07-01` : '';
  }
  const status = PLAYER_STATUSES.find((value) => value === data['status']) ?? 'Fit';
  const consent = (['pending', 'granted', 'revoked'] as const).find((value) => value === data['consentStatus']) ?? 'pending';
  const number = Number(data['number']);
  return {
    id,
    name: text(data['name']),
    positions: parsePositions(data['positions'] ?? data['position']),
    number: Number.isFinite(number) ? number : 0,
    birthdate,
    status,
    injuryUntil: text(data['injuryUntil']),
    injuredSince: status === 'Verletzt' && isIsoDate(text(data['injuredSince'])) ? text(data['injuredSince']) : '',
    consentStatus: consent,
    consentDate: text(data['consentDate']),
  };
}

/** Spieler → Dokumentfelder (gleiche Feldnamen wie die bisherige App). */
export function docFromPlayer(player: Player): Record<string, unknown> {
  return {
    id: player.id,
    name: player.name,
    positions: [...player.positions],
    number: player.number,
    birthdate: player.birthdate,
    status: player.status,
    injuryUntil: player.injuryUntil,
    injuredSince: player.injuredSince,
    consentStatus: player.consentStatus,
    consentDate: player.consentDate,
  };
}

export function positionText(player: Player): string {
  return player.positions.join(', ') || '–';
}
