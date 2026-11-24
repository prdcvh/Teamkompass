/**
 * Vergleichswerte für Feldtests (SCRUM-264): z-Wert, normierter Index und empirischer Perzentilrang eines Ergebnisses
 * gegenüber einer klar definierten Referenzgruppe. Reine Funktionen ohne Angular, deterministisch (gleiche Eingabe →
 * gleiche Ausgabe, kein „heute“, kein Zufall).
 *
 * Referenzgruppe (Regel-Version {@link REFERENCE_RULES_VERSION}):
 * - nur Spieler des EIGENEN Teams (Daten, die der Trainer ohnehin sieht) – keine vereinsübergreifenden Referenzen;
 * - exakt derselbe Test in derselben Protokollversion, dieselbe Einheit und dieselbe Messmethode – verschiedene
 *   Protokolle oder Methoden werden NIE gemischt (z. B. Handstoppung und Lichtschranke);
 * - je Spieler genau ein Wert: das Ergebnis, dessen Datum dem verglichenen am nächsten liegt, höchstens
 *   {@link REFERENCE_WINDOW_DAYS} Tage davor oder danach (bei Gleichstand das spätere); der verglichene Spieler selbst
 *   zählt mit seinem verglichenen Ergebnis mit;
 * - zuerst nur der eigene Jahrgang; reicht das nicht für {@link MIN_N_Z}, wird mit Kennzeichnung auf das ganze Team
 *   (alle Jahrgänge) erweitert; reicht auch das nicht: „keine belastbare Referenz“;
 * - Position, Reifestatus und Leistungsniveau werden nicht gefiltert (offen ausgewiesen, siehe {@link NOT_CONSIDERED}).
 *
 * Kennzahlen:
 * - z = (x − Mittelwert) / Standardabweichung (Stichproben-SD, n − 1). Bei „kleiner ist besser“ (Sprintzeiten) wird
 *   das Vorzeichen umgedreht: positiver z-Wert heißt IMMER „besser als der Durchschnitt“.
 * - Normierter Index = 50 + 10 · z, NICHT gekappt (kann unter 0 oder über 100 liegen) und ausdrücklich KEIN Perzentil.
 * - Perzentilrang (empirisch) = 100 · (Anzahl schlechterer Werte + ½ · Anzahl gleicher Werte, einschließlich des
 *   eigenen) / n – die Mid-Rank-Definition: Gleichstände bekommen denselben mittleren Rang. Er beschreibt nur die
 *   tatsächliche Position in genau dieser Gruppe.
 *
 * Mindestgrößen: z-Wert und Index erst ab n ≥ 5 (darunter verschiebt ein einzelner Spieler Mittelwert und SD so stark,
 * dass jede Zahl Zufall wäre), Perzentilrang erst ab n ≥ 10 (darunter springt der Rang je Platz um mehr als 10
 * Prozentpunkte – eine Prozentzahl täuschte Genauigkeit vor). SD = 0 → kein z, kein Index, kein Perzentil.
 * Ausreißer (Tukey-Zäune, 1,5 × Quartilsabstand) und schiefe Verteilungen (|Schiefe| > 1) erzeugen einen Gütehinweis;
 * es wird nichts still korrigiert oder entfernt.
 */
import { type FieldTestResult, aggregateResult, methodLabel, protocolOf, surfaceLabel } from './field-test';
import type { FieldTestProtocol } from './field-test-protocols';
import { daysBetween, formatDate } from '../shared/dates';

/** Version der Regeln oben; ändert sich die Regel, steigt die Version (wird mit angezeigt). */
export const REFERENCE_RULES_VERSION = '1.0';
/** Mindestgröße der Referenzgruppe für z-Wert und normierten Index. */
export const MIN_N_Z = 5;
/** Mindestgröße der Referenzgruppe für den empirischen Perzentilrang. */
export const MIN_N_PERCENTILE = 10;
/** Erhebungsfenster: Ergebnisse anderer Spieler höchstens so viele Tage vor oder nach dem verglichenen Ergebnis. */
export const REFERENCE_WINDOW_DAYS = 183;
/** Ab diesem Betrag der Schiefe gilt die Verteilung als stark schief. */
const SKEW_LIMIT = 1;

/** Kriterien, die bewusst nicht gefiltert werden – werden immer offen angezeigt. */
export const NOT_CONSIDERED: readonly string[] = [
  'Position (im eigenen Team zu wenige Spieler je Position)',
  'Reifestatus (kein validierter Reifestatus erfasst; der Reife-Kompass ist eine Schätzung)',
  'Leistungsniveau (nur das eigene Team, kein Vergleich mit anderen Niveaus)',
];

export interface ReferencePlayer {
  readonly playerId: string;
  /** ISO-Datum oder leer. */
  readonly birthdate: string;
  readonly results: readonly FieldTestResult[];
}

export interface ReferenceValue {
  readonly playerId: string;
  readonly value: number;
  readonly date: string;
  readonly surface: FieldTestResult['surface'];
}

export interface ReferenceGroup {
  /** `birth-year` = eigener Jahrgang; `team` = ganzes Team (alle Jahrgänge). */
  readonly scope: 'birth-year' | 'team';
  /** Wurde vom Jahrgang auf das ganze Team erweitert (oder fehlt das Geburtsdatum)? */
  readonly broadened: boolean;
  readonly n: number;
  /** Erhebungszeitraum der Werte in der Gruppe (frühestes/spätestes Datum). */
  readonly from: string;
  readonly to: string;
  /** Angewandte Filter in Worten. */
  readonly criteria: readonly string[];
  readonly notConsidered: readonly string[];
  readonly rulesVersion: string;
}

export interface ReferenceComparison {
  /** null = es gibt gar keine Gruppe (unbekanntes Protokoll, kein Ergebnis). */
  readonly group: ReferenceGroup | null;
  /** Ergebnis des Spielers nach der Regel des Protokolls. */
  readonly value: number | null;
  readonly mean: number | null;
  readonly sd: number | null;
  /** Richtungsbereinigt: positiv = besser als der Durchschnitt. */
  readonly z: number | null;
  /** 50 + 10 · z, ungekappt. */
  readonly index: number | null;
  /** Empirischer Perzentilrang (Mid-Rank), 0–100. */
  readonly percentile: number | null;
  /** Warum es keinen z-Wert/Index gibt (leer = es gibt einen). */
  readonly zMissing: string;
  /** Warum es keinen Perzentilrang gibt (leer = es gibt einen). */
  readonly percentileMissing: string;
  /** Gütehinweise (kleine Gruppe, Ausreißer, Schiefe, gemischter Untergrund, Handstoppung …). */
  readonly hints: readonly string[];
}

const EMPTY = { mean: null, sd: null, z: null, index: null, percentile: null } as const;

/** Gleichheit nach Rundung auf 4 Nachkommastellen (Ergebnisse sind höchstens auf 2–3 Stellen gerundet). */
function key(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function birthYear(birthdate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? birthdate.slice(0, 4) : '';
}

/** Ist dieses Ergebnis mit dem verglichenen messgleich (Test, Protokollversion, Einheit, Methode)? */
export function sameMeasurement(result: FieldTestResult, target: FieldTestResult, protocol: FieldTestProtocol): boolean {
  return (
    result.protocolId === target.protocolId &&
    result.protocolVersion === target.protocolVersion &&
    result.unit === protocol.unit &&
    result.method === target.method
  );
}

/**
 * Der eine Wert eines anderen Spielers für die Referenz: messgleiches Ergebnis mit gültigem Wert im Fenster, dem
 * verglichenen Datum am nächsten (bei Gleichstand das spätere, dann die spätere Erfassung). Kein passendes → null.
 */
export function referenceValueOf(player: ReferencePlayer, target: FieldTestResult, protocol: FieldTestProtocol): ReferenceValue | null {
  let best: { result: FieldTestResult; value: number; distance: number } | null = null;
  for (const result of player.results) {
    if (!sameMeasurement(result, target, protocol)) continue;
    const value = aggregateResult(result).value;
    if (value === null || !result.date) continue;
    const distance = Math.abs(daysBetween(target.date, result.date));
    if (!Number.isFinite(distance) || distance > REFERENCE_WINDOW_DAYS) continue;
    const better =
      !best ||
      distance < best.distance ||
      (distance === best.distance && (result.date > best.result.date || (result.date === best.result.date && result.recordedAt > best.result.recordedAt)));
    if (better) best = { result, value, distance };
  }
  return best ? { playerId: player.playerId, value: best.value, date: best.result.date, surface: best.result.surface } : null;
}

export interface DistributionStats {
  readonly n: number;
  readonly mean: number;
  /** Stichproben-SD (n − 1); bei n = 1 → 0. */
  readonly sd: number;
  /** Bereinigte Schiefe (Fisher-Pearson G1); null bei n < 3 oder SD = 0. */
  readonly skewness: number | null;
  /** Werte außerhalb der Tukey-Zäune (Q1 − 1,5·IQR, Q3 + 1,5·IQR); leer bei n < 4. */
  readonly outliers: readonly number[];
}

/** Quantil mit linearer Interpolation (wie Excel QUANTIL.INKL / R Typ 7) auf sortierten Werten. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function distributionStats(values: readonly number[]): DistributionStats {
  const n = values.length;
  const mean = n ? values.reduce((sum, value) => sum + value, 0) / n : Number.NaN;
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const rawSd = n > 1 ? Math.sqrt(squares / (n - 1)) : 0;
  // Gleiche Werte können durch Gleitkomma eine winzige SD ungleich 0 ergeben – die zählt als 0.
  const sd = rawSd < 1e-9 ? 0 : rawSd;
  let skewness: number | null = null;
  if (n >= 3 && sd > 0) {
    const m2 = squares / n;
    const m3 = values.reduce((sum, value) => sum + (value - mean) ** 3, 0) / n;
    const g1 = m3 / m2 ** 1.5;
    skewness = (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
  }
  let outliers: number[] = [];
  if (n >= 4) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const fence = 1.5 * (q3 - q1);
    outliers = sorted.filter((value) => value < q1 - fence - 1e-9 || value > q3 + fence + 1e-9);
  }
  return { n, mean, sd, skewness, outliers };
}

/**
 * Richtungsbereinigter z-Wert: positiv = besser. Bei „kleiner ist besser“ wird umgepolt, damit eine langsamere
 * Sprintzeit nie als besser erscheint. SD = 0 → null.
 */
export function directedZ(value: number, mean: number, sd: number, direction: FieldTestProtocol['direction']): number | null {
  if (!(sd > 0)) return null;
  const z = (value - mean) / sd;
  const directed = direction === 'lower' ? -z : z;
  return directed === 0 ? 0 : directed;
}

/**
 * Empirischer Perzentilrang nach Mid-Rank: Anteil schlechterer Werte plus die Hälfte der gleichen Werte (einschließlich
 * des eigenen), in Prozent. „Schlechter“ folgt der Testrichtung.
 */
export function midRankPercentile(value: number, group: readonly number[], direction: FieldTestProtocol['direction']): number {
  const own = key(value);
  let worse = 0;
  let equal = 0;
  for (const entry of group) {
    const other = key(entry);
    if (other === own) equal += 1;
    else if (direction === 'lower' ? other > own : other < own) worse += 1;
  }
  return (100 * (worse + 0.5 * equal)) / group.length;
}

function noGroup(value: number | null, reason: string): ReferenceComparison {
  return { group: null, value, ...EMPTY, zMissing: reason, percentileMissing: reason, hints: [] };
}

/**
 * Vergleich eines Ergebnisses mit der Referenzgruppe im eigenen Team. `players` sind die übrigen Spieler des Teams
 * (der verglichene Spieler darf darin vorkommen; seine Einträge werden ignoriert und durch `target` ersetzt).
 */
export function compareWithReference(
  target: { readonly playerId: string; readonly birthdate: string; readonly result: FieldTestResult },
  players: readonly ReferencePlayer[],
): ReferenceComparison {
  const protocol = protocolOf(target.result);
  if (!protocol) return noGroup(null, 'Testprotokoll in dieser Version unbekannt – kein Vergleich.');
  const outcome = aggregateResult(target.result);
  if (outcome.value === null) return noGroup(null, 'Kein Ergebnis – kein Vergleich.');
  const value = outcome.value;
  if (!target.result.date) return noGroup(value, 'Testdatum fehlt – kein Vergleich.');

  const own: ReferenceValue = { playerId: target.playerId, value, date: target.result.date, surface: target.result.surface };
  const others = players
    .filter((player) => player.playerId !== target.playerId)
    .map((player) => ({ player, entry: referenceValueOf(player, target.result, protocol) }))
    .filter((item): item is { player: ReferencePlayer; entry: ReferenceValue } => item.entry !== null);

  const year = birthYear(target.birthdate);
  const cohort = year ? [own, ...others.filter((item) => birthYear(item.player.birthdate) === year).map((item) => item.entry)] : [];
  const team = [own, ...others.map((item) => item.entry)];
  const useCohort = year !== '' && cohort.length >= MIN_N_Z;
  const values = useCohort ? cohort : team;
  const broadened = !useCohort;

  const criteria = [
    'nur eigenes Team',
    `${protocol.name}, Protokoll ${protocol.version}`,
    `Einheit ${protocol.unit}`,
    `Messmethode ${methodLabel(target.result.method)}`,
    `Ergebnisse höchstens ${REFERENCE_WINDOW_DAYS} Tage vor oder nach dem ${formatDate(target.result.date)}, je Spieler eines`,
    useCohort ? `Jahrgang ${year}` : year ? `alle Jahrgänge (Jahrgang ${year} allein hat nur ${cohort.length})` : 'alle Jahrgänge (Geburtsdatum fehlt)',
  ];
  const dates = values.map((entry) => entry.date).sort();
  const group: ReferenceGroup = {
    scope: useCohort ? 'birth-year' : 'team',
    broadened,
    n: values.length,
    from: dates[0],
    to: dates[dates.length - 1],
    criteria,
    notConsidered: NOT_CONSIDERED,
    rulesVersion: REFERENCE_RULES_VERSION,
  };

  const numbers = values.map((entry) => entry.value);
  const stats = distributionStats(numbers);
  const hints: string[] = [];
  if (broadened && values.length >= MIN_N_Z) hints.push(year ? `Breiterer Vergleich: im Jahrgang ${year} zu wenige Werte, deshalb alle Jahrgänge des Teams.` : 'Breiterer Vergleich: Geburtsdatum fehlt, deshalb alle Jahrgänge des Teams.');

  if (values.length < MIN_N_Z) {
    const reason =
      values.length === 1
        ? `Keine belastbare Referenz: Einzelfall – kein anderer Spieler hat diesen Test mit gleichem Protokoll und gleicher Messmethode (mindestens ${MIN_N_Z} nötig).`
        : `Keine belastbare Referenz: nur ${values.length} Spieler mit gleichem Test, Protokoll und Messmethode (mindestens ${MIN_N_Z} nötig).`;
    return { group, value, ...EMPTY, zMissing: reason, percentileMissing: reason, hints };
  }

  const mean = stats.mean;
  const sd = stats.sd;
  if (sd === 0) {
    const reason = `Alle ${values.length} Werte sind gleich (Standardabweichung 0) – kein z-Wert, kein Index, kein Rang.`;
    return { group, value, mean, sd, z: null, index: null, percentile: null, zMissing: reason, percentileMissing: reason, hints };
  }

  const z = directedZ(value, mean, sd, protocol.direction);
  const index = z === null ? null : 50 + 10 * z;
  const percentile = values.length >= MIN_N_PERCENTILE ? midRankPercentile(value, numbers, protocol.direction) : null;
  const percentileMissing = percentile === null ? `Perzentilrang erst ab ${MIN_N_PERCENTILE} Spielern (jetzt ${values.length}).` : '';

  if (values.length < MIN_N_PERCENTILE) hints.push(`Kleine Gruppe (n = ${values.length}): z-Wert und Index sind nur grobe Richtwerte.`);
  if (stats.outliers.length > 0) {
    const ownIsOutlier = stats.outliers.some((entry) => key(entry) === key(value));
    hints.push(
      `${stats.outliers.length === 1 ? '1 Ausreißer' : `${stats.outliers.length} Ausreißer`} in der Gruppe${ownIsOutlier ? ' (auch dieser Wert)' : ''} – Mittelwert und SD sind dadurch verzerrt; nichts wurde entfernt.`,
    );
  }
  if (stats.skewness !== null && Math.abs(stats.skewness) > SKEW_LIMIT) {
    hints.push(`Stark schiefe Verteilung (Schiefe ${stats.skewness.toFixed(1).replace('.', ',')}) – z-Wert und Index nur eingeschränkt aussagekräftig${percentile !== null ? ', der Perzentilrang ist robuster' : ''}.`);
  }
  const surfaces = new Set(values.map((entry) => entry.surface).filter(Boolean));
  if (surfaces.size > 1) hints.push(`Verschiedene Untergründe in der Gruppe (${[...surfaces].map((surface) => surfaceLabel(surface)).join(', ')}).`);
  if (target.result.method === 'stopwatch') hints.push('Handstoppung ist ungenau – kleine Unterschiede sind oft Messfehler.');

  return { group, value, mean, sd, z, index, percentile, zMissing: '', percentileMissing, hints };
}
