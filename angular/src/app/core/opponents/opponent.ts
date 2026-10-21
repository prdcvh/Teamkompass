/**
 * Gegnerprofile: Modell, Umwandlung von/nach Firestore und die reine Logik für Prüfung, Filter und Sortierung.
 * Das Dokument `teams/{teamId}/opponents/{id}` ist mit der bisherigen App identisch
 * (siehe outputs/team-manager/app.js: normalizeOpponent, saveOpponent). Nur Trainer dürfen Gegner lesen und schreiben.
 */
import type { TeamEvent } from '../events/event';
import { formatDate, isIsoDate, todayIso } from '../shared/dates';

export { formatDate };

export const OPPONENT_STYLES = ['Ballbesitz', 'Umschaltspiel', 'Pressing', 'Tief verteidigend', 'Unbekannt'] as const;
export type OpponentStyle = (typeof OPPONENT_STYLES)[number];

export const MAX_NAME_LENGTH = 60;
export const MAX_FORMATION_LENGTH = 30;
export const MAX_DETAIL_LENGTH = 1000;

export interface Opponent {
  readonly id: string;
  readonly name: string;
  readonly formation: string;
  readonly style: OpponentStyle;
  readonly strengths: string;
  readonly weaknesses: string;
  readonly keyPlayers: string;
  readonly setPieces: string;
  readonly gamePlan: string;
  readonly notes: string;
  /** ISO-Datum der letzten Änderung. */
  readonly updatedAt: string;
}

/** Eingaben aus dem Formular; alles als Text. */
export interface OpponentDraft {
  readonly id: string | null;
  readonly name: string;
  readonly formation: string;
  readonly style: OpponentStyle;
  readonly strengths: string;
  readonly weaknesses: string;
  readonly keyPlayers: string;
  readonly setPieces: string;
  readonly gamePlan: string;
  readonly notes: string;
}

export type OpponentErrors = Partial<Record<'name' | 'formation' | 'strengths' | 'weaknesses' | 'keyPlayers' | 'setPieces' | 'gamePlan' | 'notes', string>>;

/** Textfelder mit Beschriftung, in der Reihenfolge der Detailansicht. */
export const DETAIL_FIELDS = [
  { key: 'strengths', label: 'Stärken' },
  { key: 'weaknesses', label: 'Schwächen' },
  { key: 'keyPlayers', label: 'Schlüsselspieler' },
  { key: 'setPieces', label: 'Standards' },
  { key: 'gamePlan', label: 'Matchplan' },
  { key: 'notes', label: 'Notizen' },
] as const satisfies readonly { key: keyof Opponent; label: string }[];

export function emptyDraft(): OpponentDraft {
  return { id: null, name: '', formation: '', style: 'Unbekannt', strengths: '', weaknesses: '', keyPlayers: '', setPieces: '', gamePlan: '', notes: '' };
}

export function draftFromOpponent(opponent: Opponent): OpponentDraft {
  return {
    id: opponent.id,
    name: opponent.name,
    formation: opponent.formation,
    style: opponent.style,
    strengths: opponent.strengths,
    weaknesses: opponent.weaknesses,
    keyPlayers: opponent.keyPlayers,
    setPieces: opponent.setPieces,
    gamePlan: opponent.gamePlan,
    notes: opponent.notes,
  };
}

/** Prüft die Eingaben. Leeres Ergebnis = gültig. */
export function validateDraft(draft: OpponentDraft): OpponentErrors {
  const errors: OpponentErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Bitte den Namen des Gegners eingeben.';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`;
  if (draft.formation.trim().length > MAX_FORMATION_LENGTH) errors.formation = `Die Formation darf höchstens ${MAX_FORMATION_LENGTH} Zeichen lang sein.`;
  for (const { key, label } of DETAIL_FIELDS) {
    if (draft[key].trim().length > MAX_DETAIL_LENGTH) errors[key] = `${label} dürfen höchstens ${MAX_DETAIL_LENGTH} Zeichen lang sein.`;
  }
  return errors;
}

/** Entwurf → Gegner. Setzt voraus, dass `validateDraft` keine Fehler gemeldet hat. */
export function opponentFromDraft(draft: OpponentDraft, id: string, today: string = todayIso()): Opponent {
  return {
    id,
    name: draft.name.trim(),
    formation: draft.formation.trim(),
    style: OPPONENT_STYLES.find((style) => style === draft.style) ?? 'Unbekannt',
    strengths: draft.strengths.trim(),
    weaknesses: draft.weaknesses.trim(),
    keyPlayers: draft.keyPlayers.trim(),
    setPieces: draft.setPieces.trim(),
    gamePlan: draft.gamePlan.trim(),
    notes: draft.notes.trim(),
    updatedAt: today,
  };
}

/** Dokument → Gegner; versteht auch ältere Dokumente (fehlende Felder, unbekannte Spielweise). */
export function opponentFromDoc(id: string, data: Readonly<Record<string, unknown>>): Opponent {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const updatedAt = text(data['updatedAt']);
  return {
    id,
    name: text(data['name']),
    formation: text(data['formation']),
    style: OPPONENT_STYLES.find((style) => style === data['style']) ?? 'Unbekannt',
    strengths: text(data['strengths']),
    weaknesses: text(data['weaknesses']),
    keyPlayers: text(data['keyPlayers']),
    setPieces: text(data['setPieces']),
    gamePlan: text(data['gamePlan']),
    notes: text(data['notes']),
    updatedAt: isIsoDate(updatedAt) ? updatedAt : '',
  };
}

/** Gegner → Dokumentfelder (gleiche Feldnamen wie die bisherige App). */
export function docFromOpponent(opponent: Opponent): Record<string, unknown> {
  return {
    id: opponent.id,
    name: opponent.name,
    formation: opponent.formation,
    style: opponent.style,
    strengths: opponent.strengths,
    weaknesses: opponent.weaknesses,
    keyPlayers: opponent.keyPlayers,
    setPieces: opponent.setPieces,
    gamePlan: opponent.gamePlan,
    notes: opponent.notes,
    updatedAt: opponent.updatedAt,
  };
}

/** Suche in Name, Formation und Spielweise; sortiert nach Name. */
export function filterOpponents(opponents: readonly Opponent[], query: string): Opponent[] {
  const needle = query.trim().toLowerCase();
  return opponents
    .filter((opponent) => !needle || [opponent.name, opponent.formation, opponent.style].filter(Boolean).join(' ').toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Gefüllte Detailfelder mit Beschriftung (leere fehlen). */
export function detailsOf(opponent: Opponent): { label: string; value: string }[] {
  return DETAIL_FIELDS.map(({ key, label }) => ({ label, value: opponent[key] })).filter((entry) => entry.value !== '');
}

/** Name für den Abgleich: ohne Groß-/Kleinschreibung und doppelte Leerzeichen. */
export function opponentNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Gegnerprofil eines Spiels (SCRUM-34): zuerst über `opponentId`; bei Altdaten ohne (oder mit verwaister) `opponentId`
 * nur zur Anzeige über den Namen. Es wird nichts gespeichert oder migriert.
 */
export function opponentForEvent(event: TeamEvent, opponents: readonly Opponent[]): Opponent | null {
  if (event.type !== 'Spiel') return null;
  if (event.opponentId) {
    const linked = opponents.find((opponent) => opponent.id === event.opponentId);
    if (linked) return linked;
  }
  const key = opponentNameKey(event.opponent);
  if (!key) return null;
  return opponents.find((opponent) => opponentNameKey(opponent.name) === key) ?? null;
}

export interface OpponentGame {
  readonly eventId: string;
  readonly date: string;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly outcome: 'Sieg' | 'Unentschieden' | 'Niederlage';
}

export interface OpponentRecord {
  readonly games: readonly OpponentGame[];
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

/** Bilanz gegen einen Gegner: nur Spiele mit Ergebnis, die nicht in der Zukunft liegen; neueste zuerst. */
export function opponentRecord(opponent: Opponent, events: readonly TeamEvent[], opponents: readonly Opponent[], today: string = todayIso()): OpponentRecord {
  const games: OpponentGame[] = [];
  for (const event of events) {
    if (event.goalsFor === null || event.goalsAgainst === null || (event.date && event.date > today)) continue;
    if (opponentForEvent(event, opponents)?.id !== opponent.id) continue;
    const outcome = event.goalsFor > event.goalsAgainst ? 'Sieg' : event.goalsFor < event.goalsAgainst ? 'Niederlage' : 'Unentschieden';
    games.push({ eventId: event.id, date: event.date, goalsFor: event.goalsFor, goalsAgainst: event.goalsAgainst, outcome });
  }
  games.sort((a, b) => b.date.localeCompare(a.date));
  return {
    games,
    wins: games.filter((game) => game.outcome === 'Sieg').length,
    draws: games.filter((game) => game.outcome === 'Unentschieden').length,
    losses: games.filter((game) => game.outcome === 'Niederlage').length,
    goalsFor: games.reduce((sum, game) => sum + game.goalsFor, 0),
    goalsAgainst: games.reduce((sum, game) => sum + game.goalsAgainst, 0),
  };
}

export function recordText(record: OpponentRecord): string {
  if (record.games.length === 0) return 'Bisher keine Spiele mit Ergebnis gegen diesen Gegner';
  return `Bilanz ${record.wins} S · ${record.draws} U · ${record.losses} N · Tore ${record.goalsFor}:${record.goalsAgainst}`;
}
