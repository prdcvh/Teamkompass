/**
 * Feldtests (SCRUM-263): Prüfung eines Testtermins (ein Test, ein Datum, eine Methode für alle; je Spieler die
 * Versuche) und Umwandlung in die zu speichernden Ergebnisse. Modell und Regeln: field-test.ts.
 */
import { isIsoDate } from '../shared/dates';
import { CONDITIONS_MAX, type FieldTestAttempt, type FieldTestResult, MIN_TEST_DATE, TESTER_MAX } from './field-test';
import { type FieldTestMethod, type FieldTestProtocol, type FieldTestSurface, currentProtocol } from './field-test-protocols';
import { decimalText } from './measurement-protocol';

export interface FieldTestSessionDraft {
  readonly protocolId: string;
  readonly date: string;
  readonly method: string;
  readonly tester: string;
  readonly surface: FieldTestSurface | '';
  readonly conditions: string;
}

/** Eingaben eines Spielers: je Versuch Text wie eingegeben und „ungültig“. */
export interface FieldTestPlayerDraft {
  readonly playerId: string;
  readonly values: readonly string[];
  readonly invalid: readonly boolean[];
}

export type FieldTestSessionErrors = Partial<Record<'protocol' | 'date' | 'method' | 'tester' | 'conditions' | 'entries', string>>;

export interface FieldTestPlayerErrors {
  /** Fehler je Versuch ('' = in Ordnung). */
  readonly attempts: readonly string[];
  /** Fehler für den ganzen Spieler (z. B. Datum vor dem Geburtsdatum). */
  readonly general: string;
}

export interface FieldTestSessionContext {
  readonly today: string;
  /** Geburtsdatum je Spieler ('' = unbekannt). */
  readonly birthdates: ReadonlyMap<string, string>;
}

export interface FieldTestSessionEvaluation {
  readonly protocol: FieldTestProtocol | null;
  readonly errors: FieldTestSessionErrors;
  /** Nur Spieler mit Fehlern. */
  readonly playerErrors: ReadonlyMap<string, FieldTestPlayerErrors>;
  /** Spieler mit mindestens einem eingetragenen Versuch und ihre Versuche (Spieler ohne Eingabe fehlen: nichts speichern). */
  readonly entries: readonly { readonly playerId: string; readonly attempts: readonly FieldTestAttempt[] }[];
  readonly ok: boolean;
}

/** Text → Zahl; '' → null; keine Zahl → NaN. Komma oder Punkt als Dezimaltrenner. */
function parse(value: string): number | null {
  const textValue = value.trim().replace(',', '.');
  if (textValue === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(textValue)) return Number.NaN;
  return Number(textValue);
}

function decimalsOf(value: string): number {
  const [, fraction = ''] = value.trim().replace(',', '.').split('.');
  return fraction.length;
}

/** Prüft einen einzelnen Wert gegen Einheit, Wertebereich, Nachkommastellen und Schrittweite des Protokolls. */
export function attemptError(raw: string, protocol: FieldTestProtocol): string {
  const value = parse(raw);
  if (value === null) return '';
  const range = `${decimalText(protocol.min)}–${decimalText(protocol.max)} ${protocol.unit}`;
  if (Number.isNaN(value)) return `Bitte eine Zahl in ${protocol.unit} eingeben (${range}).`;
  if (value < protocol.min || value > protocol.max) return `Außerhalb von ${range} – Einheit ${protocol.unit} richtig?`;
  if (decimalsOf(raw) > protocol.decimals) return protocol.decimals === 0 ? 'Bitte eine ganze Zahl eingeben.' : `Höchstens ${protocol.decimals} Nachkommastellen.`;
  if (protocol.step && Math.round(value * 100) % Math.round(protocol.step * 100) !== 0) return `Muss ein Vielfaches von ${protocol.step} ${protocol.unit} sein.`;
  return '';
}

/**
 * Prüft einen Testtermin vollständig. Fehler blockieren das Speichern des ganzen Termins (damit nicht nur ein Teil
 * gespeichert wird). Ein Spieler ohne jede Eingabe wird übersprungen (es entsteht kein Dokument, kein Nullwert). Ein
 * als ungültig markierter Versuch ohne Wert wird als Rohdatum mitgespeichert (z. B. Fehlstart).
 */
export function evaluateSession(draft: FieldTestSessionDraft, players: readonly FieldTestPlayerDraft[], context: FieldTestSessionContext): FieldTestSessionEvaluation {
  const errors: FieldTestSessionErrors = {};
  const protocol = currentProtocol(draft.protocolId);
  if (!protocol) errors.protocol = 'Bitte einen Test auswählen.';
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  else if (draft.date > context.today) errors.date = 'Das Testdatum liegt in der Zukunft.';
  else if (draft.date < MIN_TEST_DATE) errors.date = 'Das Testdatum liegt vor 2000 – bitte prüfen.';
  if (protocol && !protocol.methods.includes(draft.method as FieldTestMethod)) errors.method = 'Bitte die Messmethode auswählen.';
  const tester = draft.tester.trim();
  if (!tester) errors.tester = 'Bitte angeben, wer gemessen hat.';
  else if (tester.length > TESTER_MAX) errors.tester = `Höchstens ${TESTER_MAX} Zeichen.`;
  if (draft.conditions.trim().length > CONDITIONS_MAX) errors.conditions = `Höchstens ${CONDITIONS_MAX} Zeichen.`;

  const playerErrors = new Map<string, FieldTestPlayerErrors>();
  const entries: { playerId: string; attempts: FieldTestAttempt[] }[] = [];
  if (protocol) {
    for (const player of players) {
      const attempts: FieldTestAttempt[] = [];
      const attemptErrors: string[] = [];
      for (let index = 0; index < protocol.attempts; index += 1) {
        const raw = player.values[index] ?? '';
        const invalid = !!player.invalid[index];
        const message = attemptError(raw, protocol);
        attemptErrors.push(message);
        const value = parse(raw);
        if (message || (value === null && !invalid)) continue;
        attempts.push({ n: index + 1, value: value === null ? null : value, valid: !invalid });
      }
      const hasError = attemptErrors.some(Boolean);
      if (attempts.length === 0 && !hasError) continue;
      const birthdate = context.birthdates.get(player.playerId) ?? '';
      const general = !errors.date && isIsoDate(birthdate) && draft.date < birthdate ? 'Das Testdatum liegt vor dem Geburtsdatum.' : '';
      if (hasError || general) playerErrors.set(player.playerId, { attempts: attemptErrors, general });
      else entries.push({ playerId: player.playerId, attempts });
    }
  }
  if (protocol && entries.length === 0 && playerErrors.size === 0) errors.entries = 'Noch keine Werte eingetragen.';
  return { protocol, errors, playerErrors, entries, ok: Object.keys(errors).length === 0 && playerErrors.size === 0 };
}

/** Baut die zu speichernden Ergebnisse eines geprüften Termins (eines je Spieler mit Eingaben). */
export function resultsFromSession(
  draft: FieldTestSessionDraft,
  evaluation: FieldTestSessionEvaluation,
  ids: { readonly sessionId: string; readonly newId: () => string; readonly recordedAt: string },
): { readonly playerId: string; readonly result: FieldTestResult }[] {
  const protocol = evaluation.protocol;
  if (!evaluation.ok || !protocol) return [];
  return evaluation.entries.map((entry) => ({
    playerId: entry.playerId,
    result: {
      id: ids.newId(),
      date: draft.date,
      sessionId: ids.sessionId,
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      unit: protocol.unit,
      method: draft.method,
      tester: draft.tester.trim(),
      surface: draft.surface,
      conditions: draft.conditions.trim(),
      attempts: entry.attempts,
      recordedAt: ids.recordedAt,
    },
  }));
}
