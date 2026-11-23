/**
 * Feldtests (SCRUM-263): Modell eines Testergebnisses, Umwandlung Dokument ↔ Ergebnis, Prüfung eines Testtermins,
 * Aggregationsregel und Vergleich zweier Ergebnisse. Reine Funktionen ohne Angular. Katalog: field-test-protocols.ts.
 *
 * Gespeichert wird je Spieler, Testtermin und Protokoll EIN Dokument in `players/{id}/measurements` mit
 * `kind: 'fieldTest'` – dort gelten schon die Regeln der Messwerte (nur Trainer schreiben; lesen Trainer, Medizin und
 * der Spieler bzw. seine Eltern nur die eigenen; bei widerrufener Einwilligung nur der Trainer; kein Vereinsadmin).
 * Alle Auswertungen von Größe/Gewicht überspringen diese Dokumente ({@link isFieldTestDoc}).
 *
 * Gespeichert werden nur Rohdaten (jeder Versuch mit Nummer, Wert und gültig/ungültig) und die Umstände (Datum,
 * Protokoll und Version, Einheit, Methode, Tester, Untergrund, Bedingungen). Das Ergebnis wird immer neu nach der
 * Regel des Protokolls gebildet, nie gespeichert. Fehlende Werte bleiben fehlend (kein Versuch wird als 0 gezählt).
 */
import { isIsoDate } from '../shared/dates';
import {
  FIELD_TEST_PROTOCOLS,
  type FieldTestMethod,
  type FieldTestProtocol,
  type FieldTestSurface,
  METHOD_LABELS,
  SURFACE_LABELS,
  aggregationText,
  currentProtocol,
  findProtocol,
} from './field-test-protocols';
import { decimalText, round2 } from './measurement-protocol';

/** Kennzeichen im Dokument, das ein Feldtest-Ergebnis von einer Wachstumsmessung unterscheidet. */
export const FIELD_TEST_KIND = 'fieldTest';
/** Frühestes erlaubtes Testdatum (ältere Angaben sind fast sicher Tippfehler). */
export const MIN_TEST_DATE = '2000-01-01';
export const TESTER_MAX = 60;
export const CONDITIONS_MAX = 120;
/** Obergrenze gespeicherter Versuche je Ergebnis (Schutz vor kaputten Dokumenten). */
const MAX_ATTEMPTS = 10;
/** Anzeige-Reihenfolge der Tests wie im Katalog. */
const FIELD_TEST_ORDER: readonly string[] = [...new Set(FIELD_TEST_PROTOCOLS.map((protocol) => protocol.id))];

export interface FieldTestAttempt {
  /** Versuchsnummer ab 1. */
  readonly n: number;
  /** Rohwert in der Einheit des Protokolls; null = kein Wert (z. B. Fehlstart ohne Zeit). */
  readonly value: number | null;
  readonly valid: boolean;
}

export interface FieldTestResult {
  readonly id: string;
  readonly date: string;
  /** Gemeinsame Kennung aller Ergebnisse eines Testtermins. */
  readonly sessionId: string;
  readonly protocolId: string;
  readonly protocolVersion: string;
  readonly unit: string;
  /** Messmethode (Kennung aus METHOD_LABELS; unbekannte Kennungen bleiben als Text erhalten). */
  readonly method: string;
  readonly tester: string;
  readonly surface: FieldTestSurface | '';
  readonly conditions: string;
  readonly attempts: readonly FieldTestAttempt[];
  /** Zeitpunkt der Erfassung (ISO, UTC). */
  readonly recordedAt: string;
}

/** Ist dieses Messwert-Dokument ein Feldtest (und keine Größe/Gewicht-Messung)? */
export function isFieldTestDoc(data: Readonly<Record<string, unknown>>): boolean {
  return data['kind'] === FIELD_TEST_KIND;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function attemptsFromDoc(value: unknown): FieldTestAttempt[] {
  if (!Array.isArray(value)) return [];
  const list: FieldTestAttempt[] = [];
  for (const [index, entry] of value.slice(0, MAX_ATTEMPTS).entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    const n = Number.isInteger(data['n']) && (data['n'] as number) > 0 ? (data['n'] as number) : index + 1;
    const raw = data['value'];
    const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    list.push({ n, value: number, valid: data['valid'] !== false });
  }
  return list.sort((a, b) => a.n - b.n);
}

/** Dokument → Ergebnis. Unbekannte Protokolle oder Methoden bleiben lesbar (Kennung als Text). */
export function fieldTestFromDoc(id: string, data: Readonly<Record<string, unknown>>): FieldTestResult {
  const surface = data['surface'];
  return {
    id,
    date: typeof data['date'] === 'string' ? data['date'] : '',
    sessionId: text(data['sessionId'], 80),
    protocolId: text(data['protocolId'], 40),
    protocolVersion: text(data['protocolVersion'], 10),
    unit: text(data['unit'], 20),
    method: text(data['method'], 40),
    tester: text(data['tester'], TESTER_MAX),
    surface: typeof surface === 'string' && surface in SURFACE_LABELS ? (surface as FieldTestSurface) : '',
    conditions: text(data['conditions'], CONDITIONS_MAX),
    attempts: attemptsFromDoc(data['attempts']),
    recordedAt: text(data['recordedAt'], 40),
  };
}

/** Ergebnis → Dokument (ohne `playerId`, das ergänzt die Schreibfunktion). */
export function docFromFieldTest(result: FieldTestResult): Record<string, unknown> {
  return {
    kind: FIELD_TEST_KIND,
    date: result.date,
    sessionId: result.sessionId,
    protocolId: result.protocolId,
    protocolVersion: result.protocolVersion,
    unit: result.unit,
    method: result.method,
    tester: result.tester,
    surface: result.surface,
    conditions: result.conditions,
    attempts: result.attempts.map((attempt) => ({ n: attempt.n, value: attempt.value, valid: attempt.valid })),
    recordedAt: result.recordedAt,
  };
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method as FieldTestMethod] ?? (method || 'Methode nicht angegeben');
}

export function surfaceLabel(surface: FieldTestSurface | ''): string {
  return surface ? SURFACE_LABELS[surface] : '';
}

/** Zahl in der Schreibweise des Protokolls (Komma, passende Nachkommastellen). */
export function valueText(value: number, protocol: Pick<FieldTestProtocol, 'decimals' | 'aggregation'> | null): string {
  if (!protocol) return decimalText(value, 2);
  return decimalText(value, protocol.decimals + (protocol.aggregation === 'mean' ? 1 : 0));
}

// --- Aggregation -------------------------------------------------------------------------------------------

export interface FieldTestOutcome {
  /** Ergebnis nach der Regel; null = kein Ergebnis (zu wenige gültige Versuche, unbekanntes Protokoll …). */
  readonly value: number | null;
  /** Die Regel in Worten. */
  readonly rule: string;
  /** Nummern der Versuche, aus denen das Ergebnis gebildet wurde. */
  readonly used: readonly number[];
  /** Warum es kein Ergebnis gibt (leer = es gibt eines). */
  readonly missing: string;
}

/** Protokoll eines Ergebnisses: genau die gespeicherte Version, sonst null. */
export function protocolOf(result: Pick<FieldTestResult, 'protocolId' | 'protocolVersion'>): FieldTestProtocol | null {
  return findProtocol(result.protocolId, result.protocolVersion);
}

/**
 * Bildet das Ergebnis nach der Regel des Protokolls aus den gültigen Versuchen. Ungültige oder leere Versuche zählen
 * nie mit (auch nicht als 0). Passt die gespeicherte Einheit nicht zum Protokoll oder ist das Protokoll unbekannt, gibt
 * es kein Ergebnis – die Rohwerte bleiben trotzdem sichtbar.
 */
export function aggregateResult(result: FieldTestResult): FieldTestOutcome {
  const protocol = protocolOf(result);
  if (!protocol) return { value: null, rule: 'Unbekanntes Testprotokoll', used: [], missing: 'Testprotokoll in dieser Version unbekannt – nur Rohwerte.' };
  const rule = aggregationText(protocol);
  if (result.unit !== protocol.unit) return { value: null, rule, used: [], missing: `Einheit „${result.unit || '–'}“ passt nicht zum Protokoll (${protocol.unit}) – kein Ergebnis.` };
  const valid = result.attempts.filter((attempt): attempt is FieldTestAttempt & { value: number } => attempt.valid && attempt.value !== null);
  if (valid.length < protocol.minValid || valid.length === 0) {
    return { value: null, rule, used: [], missing: `Zu wenige gültige Versuche (${valid.length} von mindestens ${protocol.minValid}) – kein Ergebnis.` };
  }
  if (protocol.aggregation === 'mean') {
    const mean = valid.reduce((sum, attempt) => sum + attempt.value, 0) / valid.length;
    return { value: round2(mean), rule, used: valid.map((attempt) => attempt.n), missing: '' };
  }
  const best = valid.reduce((winner, attempt) => ((protocol.direction === 'lower' ? attempt.value < winner.value : attempt.value > winner.value) ? attempt : winner));
  return { value: best.value, rule, used: [best.n], missing: '' };
}

// --- Vergleich -----------------------------------------------------------------------------------------------

export interface FieldTestComparison {
  readonly previous: FieldTestResult;
  /** Jetzt minus vorher in der Einheit; null = nicht berechenbar (fehlender Wert oder andere Einheit). */
  readonly delta: number | null;
  /** Besser im Sinne der Testrichtung; null = gleich oder nicht berechenbar. */
  readonly improved: boolean | null;
  /** Warum der Vergleich nur eingeschränkt oder gar nicht gilt. */
  readonly warnings: readonly string[];
}

/** Vergleicht ein Ergebnis mit einem früheren desselben Tests und warnt bei abweichendem Protokoll oder Methode. */
export function compareResults(current: FieldTestResult, previous: FieldTestResult): FieldTestComparison {
  const warnings: string[] = [];
  const sameUnit = current.unit === previous.unit;
  if (current.protocolId !== previous.protocolId) warnings.push('Anderer Test – nicht vergleichbar.');
  else if (current.protocolVersion !== previous.protocolVersion) {
    warnings.push(`Anderes Testprotokoll (vorher Version ${previous.protocolVersion || '–'}, jetzt ${current.protocolVersion || '–'}) – nur eingeschränkt vergleichbar.`);
  }
  if (!sameUnit) warnings.push(`Andere Einheit (vorher ${previous.unit || '–'}, jetzt ${current.unit || '–'}) – nicht vergleichbar.`);
  if (current.method !== previous.method) {
    warnings.push(`Andere Messmethode (vorher ${methodLabel(previous.method)}, jetzt ${methodLabel(current.method)}) – nur eingeschränkt vergleichbar.`);
  }
  if (current.surface && previous.surface && current.surface !== previous.surface) {
    warnings.push(`Anderer Untergrund (vorher ${surfaceLabel(previous.surface)}, jetzt ${surfaceLabel(current.surface)}).`);
  }
  const now = aggregateResult(current).value;
  const before = aggregateResult(previous).value;
  const comparable = sameUnit && current.protocolId === previous.protocolId;
  if (!comparable || now === null || before === null) return { previous, delta: null, improved: null, warnings };
  const delta = round2(now - before);
  const direction = (protocolOf(current) ?? currentProtocol(current.protocolId))?.direction ?? null;
  const improved = delta === 0 || direction === null ? null : direction === 'lower' ? delta < 0 : delta > 0;
  return { previous, delta, improved, warnings };
}

export interface FieldTestEntry {
  readonly result: FieldTestResult;
  readonly protocol: FieldTestProtocol | null;
  readonly outcome: FieldTestOutcome;
  /** Vergleich mit dem nächstälteren Ergebnis desselben Tests; null = erstes Ergebnis. */
  readonly comparison: FieldTestComparison | null;
}

export interface FieldTestGroup {
  readonly protocolId: string;
  readonly name: string;
  readonly unit: string;
  readonly direction: FieldTestProtocol['direction'] | null;
  /** Neueste zuerst. */
  readonly entries: readonly FieldTestEntry[];
}

/** Ergebnisse je Test gruppiert (Reihenfolge wie im Katalog, unbekannte zuletzt), neueste zuerst, mit Vergleich. */
export function fieldTestHistory(results: readonly FieldTestResult[]): FieldTestGroup[] {
  const groups = new Map<string, FieldTestResult[]>();
  for (const result of results) groups.set(result.protocolId, [...(groups.get(result.protocolId) ?? []), result]);
  const order = (id: string) => (FIELD_TEST_ORDER.includes(id) ? FIELD_TEST_ORDER.indexOf(id) : Number.MAX_SAFE_INTEGER);
  return [...groups.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([protocolId, list]) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
      const latest = currentProtocol(protocolId);
      return {
        protocolId,
        name: latest?.name ?? `Unbekannter Test „${protocolId || '–'}“`,
        unit: latest?.unit ?? sorted[0]?.unit ?? '',
        direction: latest?.direction ?? null,
        entries: sorted.map((result, index) => ({
          result,
          protocol: protocolOf(result),
          outcome: aggregateResult(result),
          comparison: sorted[index + 1] ? compareResults(result, sorted[index + 1]) : null,
        })),
      };
    });
}

// --- Erfassung eines Testtermins -----------------------------------------------------------------------------

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
