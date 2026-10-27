/**
 * Sicherung einspielen (JSON-Export wieder importieren), Parität zur Live-App (SCRUM-28, Alt-App app.js,
 * Block BACKUP-IMPORT): gleiche strenge Dateiprüfung, gleiches Dateiformat, gleiche Schreibliste. Gleiche Kennungen
 * werden überschrieben, neue ergänzt, alles andere bleibt unangetastet – es wird nie etwas gelöscht.
 * Reine Funktionen ohne Datenbankzugriff. Sicherungen der Live-App und dieser App sind gegenseitig einspielbar.
 */
import { docFromLineup, lineupIsEmpty, normalizeLineup } from '../lineup/lineup';
import { docFromEvent, eventFromDoc } from '../events/event';
import { docFromOpponent, opponentFromDoc } from '../opponents/opponent';
import { docFromPlayer, playerFromDoc } from '../player/player';
import { docFromRating, ratingFromDoc } from '../ratings/rating';
import { absenceFromDoc, docFromAbsence } from '../records/absence';
import { docFromMeasurement, measurementFromDoc } from '../records/measurement';
import { docFromPlan, planFromDoc } from '../records/plan';

type Doc = Record<string, unknown>;

const BACKUP_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const GROUPS = ['developmentPlans', 'absences', 'measurements'] as const;

/** Höchstgröße der Datei (eine Sicherung eines Teams ist weit kleiner); schützt den Browser vor Fehlgriffen. */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

/** Erlaubte Dokument-Kennung (wie Live-App): keine Pfadzeichen, kein `.`/`..`, keine reservierten `__x__`-Namen. */
export function isBackupId(id: unknown): id is string {
  return typeof id === 'string' && BACKUP_ID_PATTERN.test(id) && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export type BackupCheck = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Prüft eine eingelesene Datei streng. Eine falsche Datei darf nie etwas verändern und fällt nie auf Beispieldaten zurück. */
export function validateBackup(raw: unknown): BackupCheck {
  const fail = (error: string): BackupCheck => ({ ok: false, error });
  if (!isObject(raw)) return fail('Die Datei ist kein TeamKompass-Export.');
  if (!Array.isArray(raw['players']) || !Array.isArray(raw['events'])) return fail('In der Datei fehlen Spieler oder Events – sie stammt nicht aus „Daten exportieren“.');
  if (!raw['players'].length) return fail('Die Datei enthält keine Spieler.');
  for (const player of raw['players'] as unknown[]) {
    if (!isObject(player) || !isBackupId(player['id']) || typeof player['name'] !== 'string') return fail('Mindestens ein Spieler in der Datei ist unvollständig oder hat eine ungültige ID.');
  }
  for (const event of raw['events'] as unknown[]) {
    if (!isObject(event) || !isBackupId(event['id'])) return fail('Mindestens ein Event in der Datei ist unvollständig oder hat eine ungültige ID.');
    for (const key of ['ratings', 'privateNotes'] as const) {
      const map = event[key];
      if (map === undefined) continue;
      const valid = isObject(map) && Object.keys(map).every(isBackupId) && Object.values(map).every((value) => (key === 'ratings' ? isObject(value) : typeof value === 'string'));
      if (!valid) return fail('Mindestens ein Event enthält ungültige Bewertungen.');
    }
  }
  for (const name of GROUPS) {
    const group = raw[name];
    if (group === undefined) continue;
    const message = 'Die Datei enthält ungültige Förderpläne, Abwesenheiten oder Messungen.';
    if (!isObject(group)) return fail(message);
    for (const [playerId, items] of Object.entries(group)) {
      if (!isBackupId(playerId) || !Array.isArray(items) || items.some((item) => !isObject(item) || (item['id'] !== undefined && !isBackupId(item['id'])))) return fail(message);
    }
  }
  const opponents = raw['opponents'];
  if (opponents !== undefined && (!Array.isArray(opponents) || opponents.some((item) => !isObject(item) || (item['id'] !== undefined && !isBackupId(item['id']))))) {
    return fail('Die Datei enthält ungültige Gegner.');
  }
  return { ok: true };
}

export interface BackupEvent {
  readonly id: string;
  readonly meta: Doc;
  readonly ratings: Readonly<Record<string, Doc>>;
  readonly privateNotes: Readonly<Record<string, string>>;
}

/** Geprüfte und in das Datenbankformat gebrachte Sicherung (jedes Dokument trägt seine `id`). */
export interface Backup {
  readonly players: readonly Doc[];
  readonly events: readonly BackupEvent[];
  readonly developmentPlans: Readonly<Record<string, readonly Doc[]>>;
  readonly absences: Readonly<Record<string, readonly Doc[]>>;
  readonly measurements: Readonly<Record<string, readonly Doc[]>>;
  readonly opponents: readonly Doc[];
  /** Nur gesetzt, wenn die Datei eine nicht leere Startelf enthält (wie Live-App: sonst bleibt die bestehende). */
  readonly lineup: Doc | null;
}

/**
 * Bringt eine (bereits geprüfte) Datei in das Datenbankformat: über dieselben Lese-/Schreibfunktionen wie die übrige App,
 * damit auch ältere Felder der Live-App sauber ankommen. Förderpläne, Abwesenheiten und Messungen von Spielern, die nicht
 * in der Datei stehen, werden wie in der Live-App verworfen. Fehlende Kennungen werden neu vergeben.
 */
export function parseBackup(raw: Record<string, unknown>, today: string, newId: () => string = () => crypto.randomUUID()): Backup {
  const list = (value: unknown): Doc[] => (Array.isArray(value) ? (value as Doc[]) : []);
  const idOf = (doc: Doc, prefix: string) => (typeof doc['id'] === 'string' ? doc['id'] : `${prefix}${newId()}`);
  const players = list(raw['players']).map((doc) => docFromPlayer(playerFromDoc(String(doc['id']), doc)));
  const playerIds = new Set(players.map((player) => String(player['id'])));
  const events: BackupEvent[] = list(raw['events']).map((doc) => {
    const id = String(doc['id']);
    const ratings: Record<string, Doc> = {};
    for (const [playerId, rating] of Object.entries((doc['ratings'] as Record<string, Doc> | undefined) ?? {})) ratings[playerId] = docFromRating(ratingFromDoc(rating));
    return { id, meta: docFromEvent(eventFromDoc(id, doc)), ratings, privateNotes: { ...((doc['privateNotes'] as Record<string, string> | undefined) ?? {}) } };
  });
  const group = (name: (typeof GROUPS)[number], prefix: string, convert: (id: string, data: Doc) => Doc): Record<string, Doc[]> => {
    const result: Record<string, Doc[]> = {};
    for (const [playerId, items] of Object.entries((raw[name] as Record<string, unknown> | undefined) ?? {})) {
      if (playerIds.has(playerId)) result[playerId] = list(items).map((item) => convert(idOf(item, prefix), item));
    }
    return result;
  };
  const lineup = normalizeLineup(raw['lineup'], playerIds);
  return {
    players,
    events,
    developmentPlans: group('developmentPlans', 'dp', (id, data) => docFromPlan(planFromDoc(id, data, today))),
    absences: group('absences', 'ab', (id, data) => docFromAbsence(absenceFromDoc(id, data))),
    measurements: group('measurements', 'me', (id, data) => docFromMeasurement(measurementFromDoc(id, data, today))),
    opponents: list(raw['opponents']).map((doc) => docFromOpponent(opponentFromDoc(idOf(doc, 'o'), doc))),
    lineup: lineupIsEmpty(lineup) ? null : docFromLineup(lineup),
  };
}

/** Was in der Datenbank schon liegt (Kennungen), um „neu“ und „wird überschrieben“ zu unterscheiden. */
export interface CurrentIds {
  readonly players: ReadonlySet<string>;
  readonly events: ReadonlySet<string>;
  readonly opponents: ReadonlySet<string>;
  readonly developmentPlans: ReadonlyMap<string, ReadonlySet<string>>;
  readonly absences: ReadonlyMap<string, ReadonlySet<string>>;
  readonly measurements: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface Split {
  readonly created: number;
  readonly overwritten: number;
}

export interface BackupSummary {
  readonly players: Split;
  readonly events: Split;
  readonly ratings: number;
  readonly opponents: Split;
  readonly plans: Split;
  readonly absences: Split;
  readonly measurements: Split;
  readonly lineup: boolean;
}

function split(existing: ReadonlySet<string>, ids: readonly string[]): Split {
  const overwritten = ids.filter((id) => existing.has(id)).length;
  return { created: ids.length - overwritten, overwritten };
}

function splitGroups(existing: ReadonlyMap<string, ReadonlySet<string>>, groups: Readonly<Record<string, readonly Doc[]>>): Split {
  let created = 0;
  let overwritten = 0;
  for (const [playerId, items] of Object.entries(groups)) {
    const part = split(existing.get(playerId) ?? new Set(), items.map((item) => String(item['id'])));
    created += part.created;
    overwritten += part.overwritten;
  }
  return { created, overwritten };
}

/** Zählt für die Bestätigung, was die Sicherung neu anlegt und was sie überschreibt. */
export function summarizeBackup(current: CurrentIds, backup: Backup): BackupSummary {
  return {
    players: split(current.players, backup.players.map((player) => String(player['id']))),
    events: split(current.events, backup.events.map((event) => event.id)),
    ratings: backup.events.reduce((sum, event) => sum + Object.keys(event.ratings).length, 0),
    opponents: split(current.opponents, backup.opponents.map((opponent) => String(opponent['id']))),
    plans: splitGroups(current.developmentPlans, backup.developmentPlans),
    absences: splitGroups(current.absences, backup.absences),
    measurements: splitGroups(current.measurements, backup.measurements),
    lineup: backup.lineup !== null,
  };
}

export function overwriteCount(summary: BackupSummary): number {
  return [summary.players, summary.events, summary.opponents, summary.plans, summary.absences, summary.measurements].reduce((sum, part) => sum + part.overwritten, 0);
}

/** Zeilen für die Zusammenfassung vor dem Einspielen, z. B. „Spieler: 2 neu, 1 wird aktualisiert“. */
export function summaryLines(summary: BackupSummary): string[] {
  const line = (label: string, part: Split) => (part.created || part.overwritten ? `${label}: ${part.created} neu, ${part.overwritten} werden aktualisiert` : '');
  return [
    line('Spieler', summary.players),
    line('Events', summary.events),
    `Bewertungen in den Events: ${summary.ratings}`,
    line('Gegner', summary.opponents),
    line('Förderpläne', summary.plans),
    line('Abwesenheiten', summary.absences),
    line('Messungen', summary.measurements),
    summary.lineup ? 'Startelf: wird aus der Sicherung übernommen' : '',
  ].filter(Boolean);
}

export interface BackupOperation {
  readonly path: readonly string[];
  readonly data: Doc;
  readonly merge: boolean;
}

/** Schreibliste: dieselben Dokumente und Felder wie die einzelnen Speichern-Funktionen der App (Pfade unterhalb von `teams/{teamId}`). */
export function backupOperations(backup: Backup): BackupOperation[] {
  const ops: BackupOperation[] = [];
  for (const player of backup.players) ops.push({ path: ['players', String(player['id'])], data: player, merge: true });
  for (const event of backup.events) {
    ops.push({ path: ['events', event.id], data: event.meta, merge: true });
    for (const [playerId, rating] of Object.entries(event.ratings)) ops.push({ path: ['events', event.id, 'ratings', playerId], data: { ...rating, playerId }, merge: true });
    for (const [playerId, note] of Object.entries(event.privateNotes)) ops.push({ path: ['events', event.id, 'privateNotes', playerId], data: { playerId, note }, merge: true });
  }
  for (const name of GROUPS) {
    for (const [playerId, items] of Object.entries(backup[name])) {
      for (const item of items) ops.push({ path: ['players', playerId, name, String(item['id'])], data: { ...item, playerId }, merge: false });
    }
  }
  for (const opponent of backup.opponents) ops.push({ path: ['opponents', String(opponent['id'])], data: opponent, merge: false });
  // Zusammenführen (merge): die je Spiel gespeicherten Aufstellungen im selben Dokument dürfen nicht verloren gehen.
  if (backup.lineup) ops.push({ path: ['meta', 'lineup'], data: backup.lineup, merge: true });
  return ops;
}
