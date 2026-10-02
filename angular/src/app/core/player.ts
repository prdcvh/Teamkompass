/**
 * Spielerdaten des Kaders: Modell, Umwandlung von/nach Firestore und die reine Logik für
 * Prüfung, Filter und Sortierung. Das Dokument `teams/{teamId}/players/{id}` ist mit der
 * bisherigen App identisch (siehe outputs/team-manager/app.js, savePlayer/normalizePlayer).
 */

export const STANDARD_POSITIONS = ['TW', 'IV', 'LIB', 'LV', 'RV', 'DM', 'ZM', 'OM', 'LM', 'RM', 'LA', 'RA', 'HS', 'ST'] as const;

export const PLAYER_STATUSES = ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'] as const;
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];

export type ConsentStatus = 'pending' | 'granted' | 'revoked';
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Alter in vollen Jahren; leer/ungültig → null. */
export function ageFromBirthdate(birthdate: string, now: Date = new Date()): number | null {
  if (!isIsoDate(birthdate)) return null;
  const [year, month, day] = birthdate.split('-').map(Number);
  let age = now.getFullYear() - year;
  const hadBirthday = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function formatDate(iso: string): string {
  if (!isIsoDate(iso)) return '–';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
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

/** Entwurf → Spieler. Setzt voraus, dass `validateDraft` keine Fehler gemeldet hat. */
export function playerFromDraft(draft: PlayerDraft, id: string): Player {
  return {
    id,
    name: draft.name.trim(),
    positions: draftPositions(draft),
    number: Number(draft.number),
    birthdate: draft.birthdate,
    status: draft.status,
    injuryUntil: draft.status === 'Verletzt' ? draft.injuryUntil : '',
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
    consentStatus: player.consentStatus,
    consentDate: player.consentDate,
  };
}

export function positionText(player: Player): string {
  return player.positions.join(', ') || '–';
}

export type SortKey = 'number' | 'name' | 'position' | 'age' | 'status';
export const SORT_OPTIONS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: 'number', label: 'Rückennummer' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'position', label: 'Position' },
  { key: 'age', label: 'Alter (jüngste zuerst)' },
  { key: 'status', label: 'Status' },
];

export interface SquadFilter {
  readonly query: string;
  /** 'all' oder eine Position. */
  readonly position: string;
  /** 'all' oder ein Status. */
  readonly status: string;
}

export function filterPlayers(players: readonly Player[], filter: SquadFilter): Player[] {
  const query = filter.query.trim().toLowerCase();
  return players.filter((player) => {
    if (filter.position !== 'all' && !player.positions.includes(filter.position)) return false;
    if (filter.status !== 'all' && player.status !== filter.status) return false;
    if (!query) return true;
    return [player.name, positionText(player), player.status, String(player.number)].join(' ').toLowerCase().includes(query);
  });
}

export function sortPlayers(players: readonly Player[], key: SortKey): Player[] {
  const byNumber = (a: Player, b: Player) => a.number - b.number;
  const collate = (a: string, b: string) => a.localeCompare(b, 'de');
  const sorted = [...players];
  switch (key) {
    case 'name':
      sorted.sort((a, b) => collate(a.name, b.name) || byNumber(a, b));
      break;
    case 'position':
      sorted.sort((a, b) => collate(positionText(a), positionText(b)) || byNumber(a, b));
      break;
    case 'age':
      // Jüngste zuerst = späteste Geburtsdaten zuerst; ohne Datum ans Ende.
      sorted.sort((a, b) => (b.birthdate || '0000').localeCompare(a.birthdate || '0000') || byNumber(a, b));
      break;
    case 'status':
      sorted.sort((a, b) => collate(a.status, b.status) || byNumber(a, b));
      break;
    default:
      sorted.sort(byNumber);
  }
  return sorted;
}

export function statusCounts(players: readonly Player[]): Record<PlayerStatus, number> {
  const counts: Record<PlayerStatus, number> = { Fit: 0, Angeschlagen: 0, Verletzt: 0, Pause: 0 };
  for (const player of players) counts[player.status] += 1;
  return counts;
}

/** Mannschaftsteile für die Gruppen der Handy-Ansicht (Figma: TOR · 2, ABWEHR · 4 …). */
export const POSITION_LINES: readonly { readonly title: string; readonly positions: readonly string[] }[] = [
  { title: 'Tor', positions: ['TW'] },
  { title: 'Abwehr', positions: ['IV', 'LIB', 'LV', 'RV'] },
  { title: 'Mittelfeld', positions: ['DM', 'ZM', 'OM', 'LM', 'RM'] },
  { title: 'Angriff', positions: ['LA', 'RA', 'HS', 'ST'] },
];

export interface PlayerGroup {
  readonly title: string;
  readonly players: readonly Player[];
}

/** Gruppiert nach der ersten Position; eigene Positionen landen in „Weitere“. Reihenfolge der Spieler bleibt erhalten. */
export function groupByLine(players: readonly Player[]): PlayerGroup[] {
  const groups = [...POSITION_LINES.map((line) => ({ title: line.title, players: [] as Player[] })), { title: 'Weitere', players: [] as Player[] }];
  for (const player of players) {
    const index = POSITION_LINES.findIndex((line) => line.positions.includes(player.positions[0] ?? ''));
    groups[index === -1 ? groups.length - 1 : index].players.push(player);
  }
  return groups.filter((group) => group.players.length > 0);
}
