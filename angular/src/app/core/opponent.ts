/**
 * Gegnerprofile: Modell, Umwandlung von/nach Firestore und die reine Logik für Prüfung, Filter und Sortierung.
 * Das Dokument `teams/{teamId}/opponents/{id}` ist mit der bisherigen App identisch
 * (siehe outputs/team-manager/app.js: normalizeOpponent, saveOpponent). Nur Trainer dürfen Gegner lesen und schreiben.
 */
import { formatDate, isIsoDate, todayIso } from './player';

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
