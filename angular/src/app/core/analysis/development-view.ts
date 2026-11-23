/**
 * Entwicklungsansicht der Teamanalyse (SCRUM-258): Spieler, Einsatzminuten und Verfügbarkeit je Geburtsquartal und
 * Reifegruppe nebeneinander. Reine Rechenfunktionen ohne Angular; es wird nichts gespeichert und nichts zurückgeschrieben.
 *
 * Grundsätze (Ticket):
 * - Geburtsquartal und Reifegruppe sind zwei getrennte Achsen. Nichts hier leitet aus dem einen das andere ab.
 * - Die Reifegruppe kommt ausschließlich aus {@link assessMaturity} (SCRUM-256) mit den Angaben aus
 *   {@link maturityInputsForCalculation} (SCRUM-252, Widerruf). Nur `classified` ergibt eine Gruppe. Veraltete, unsichere,
 *   nicht berechenbare, widerrufene und nicht geladene Fälle landen in „nicht eingeordnet“ – mit Grund, nie in einer Gruppe.
 * - Historische Zeiträume: Der Reifestand wird nie gespeichert. Rekonstruierbar ist er nur, wenn die Angaben (Geschlecht,
 *   Elterngröße) nachweislich schon zum Ende des Zeitraums vorlagen (`updatedAt` des Dokuments, es kennt nur den
 *   LETZTEN Speicherstand) und keine verwendete Messung danach korrigiert wurde. Sonst heißt es ausdrücklich „keine
 *   historische Einordnung vorhanden“ – die heutige Reife wird nie rückwirkend unterstellt. Nicht erkennbar bleibt, ob
 *   eine Messung mit altem Datum erst später nachgetragen wurde (Messungen tragen keinen Erfassungszeitpunkt).
 * - Keine Korrektur von Noten, keine Punkte, keine Reihenfolge: diese Datei liest nur.
 */
import type { TeamEvent } from '../events/event';
import { type Player, isConsentRevoked } from '../player/player';
import type { Rating } from '../ratings/rating';
import { isIsoDate } from '../shared/dates';
import { type BioBandingData } from '../records/bio-banding';
import { type MaturityBand, hasMaturityData, maturityInputsForCalculation } from '../records/maturity';
import { assessMaturity } from '../records/maturity-assessment';
import type { Quarter } from './analysis';

export type DevelopmentQuarter = Quarter | 'unknown';
export type DevelopmentGroup = MaturityBand | 'unclassified';

export const DEVELOPMENT_QUARTERS: readonly DevelopmentQuarter[] = ['Q1', 'Q2', 'Q3', 'Q4', 'unknown'];
export const DEVELOPMENT_GROUPS: readonly DevelopmentGroup[] = ['late', 'average', 'early', 'unclassified'];

export const QUARTER_LABELS: Readonly<Record<DevelopmentQuarter, string>> = {
  Q1: 'Q1 (Jan–Mär)',
  Q2: 'Q2 (Apr–Jun)',
  Q3: 'Q3 (Jul–Sep)',
  Q4: 'Q4 (Okt–Dez)',
  unknown: 'Geburtsdatum fehlt',
};

export const GROUP_LABELS: Readonly<Record<DevelopmentGroup, string>> = {
  late: 'spät entwickelt',
  average: 'im Schnitt',
  early: 'früh entwickelt',
  unclassified: 'nicht eingeordnet',
};

/**
 * EIGENER VORSCHLAGSWERT (SCRUM-258, nicht aus dem Ticket): Gruppen mit weniger Spielern gelten als „klein“ und werden
 * als solche erläutert; ein Unterschied dort sagt kaum etwas.
 */
export const SMALL_GROUP_BELOW = 5;

export type UnclassifiedReason = 'revoked' | 'load-failed' | 'no-inputs' | 'no-history' | 'not-calculated' | 'stale' | 'uncertain';

export const UNCLASSIFIED_REASON_TEXT: Readonly<Record<UnclassifiedReason, string>> = {
  revoked: 'Einwilligung widerrufen (wird nicht berechnet)',
  'load-failed': 'Angaben konnten nicht geladen werden',
  'no-inputs': 'keine Angaben zum Reife-Kompass erfasst',
  'no-history': 'keine historische Einordnung vorhanden',
  'not-calculated': 'es fehlen Angaben oder eine passende Messung',
  stale: 'letzte Messung veraltet (älter als 90 Tage)',
  uncertain: 'Einordnung unsicher (Widerspruch in den Daten)',
};

/** Daten je Spieler: `null` = konnten nicht geladen werden. Angaben und Messungen wie im Bio-Banding. */
export type DevelopmentPlayerData = BioBandingData | null;

export interface DevelopmentFilter {
  /** Zeitraum (JJJJ-MM-TT, beide Tage zählen mit). */
  readonly from: string;
  readonly to: string;
  /** Jahrgang (Geburtsjahr) oder 'all'. */
  readonly cohort: string;
}

export interface Classification {
  readonly group: DevelopmentGroup;
  readonly reason: UnclassifiedReason | null;
  /** Genauer Hinweis zum Grund (z. B. Datum), sonst ''. */
  readonly detail: string;
}

export function birthQuarter(birthdate: string): DevelopmentQuarter {
  if (!isIsoDate(birthdate)) return 'unknown';
  return `Q${Math.floor((Number(birthdate.slice(5, 7)) - 1) / 3) + 1}` as Quarter;
}

export function birthYear(birthdate: string): string | null {
  return isIsoDate(birthdate) ? birthdate.slice(0, 4) : null;
}

const unclassified = (reason: UnclassifiedReason, detail = ''): Classification => ({ group: 'unclassified', reason, detail });

/**
 * Reifegruppe eines Spielers zum Stichtag `min(Ende des Zeitraums, heute)`. Liegt das Ende in der Vergangenheit, gilt der
 * damalige Stand (siehe Dateikopf), sonst der heutige.
 */
export function classifyForPeriod(
  player: Pick<Player, 'birthdate' | 'consentStatus'>,
  data: DevelopmentPlayerData,
  periodEnd: string,
  today: string,
): Classification {
  if (isConsentRevoked(player)) return unclassified('revoked');
  if (!data) return unclassified('load-failed');
  const inputs = maturityInputsForCalculation(data.inputs, player);
  if (!hasMaturityData(inputs)) return unclassified('no-inputs');

  const historic = periodEnd < today;
  const reference = historic ? periodEnd : today;
  let measurements = data.measurements;
  if (historic) {
    const savedOn = inputs.updatedAt ? inputs.updatedAt.slice(0, 10) : '';
    if (!isIsoDate(savedOn)) return unclassified('no-history', 'Die Angaben tragen kein Speicherdatum.');
    if (savedOn > reference) return unclassified('no-history', 'Die Angaben wurden zuletzt nach dem Ende des Zeitraums gespeichert; ihr damaliger Stand ist nicht bekannt.');
    measurements = measurements.filter((entry) => entry.date <= reference);
    if (measurements.some((entry) => (entry.changes ?? []).some((change) => change.at.slice(0, 10) > reference))) {
      return unclassified('no-history', 'Eine verwendete Messung wurde nach dem Ende des Zeitraums korrigiert; ihr damaliger Wert ist nicht belegt.');
    }
  }

  const assessment = assessMaturity(measurements, player.birthdate, inputs, reference);
  if (assessment.status === 'classified' && assessment.band) return { group: assessment.band, reason: null, detail: '' };
  if (assessment.status === 'stale') return unclassified('stale');
  if (assessment.status === 'uncertain') return unclassified('uncertain');
  return unclassified('not-calculated', assessment.causes.join('; '));
}

export interface DevelopmentCell {
  readonly players: number;
  /** Summe der eingetragenen Einsatzminuten (nur Spiele im Zeitraum). */
  readonly minutes: number;
  /** Spieler mit mindestens einem Minuten-Eintrag im Zeitraum. */
  readonly playersWithMinutes: number;
  /** Ø Minuten je Spieler mit Eintrag; null ohne Einträge. */
  readonly averageMinutes: number | null;
  /** Als „Fehlt“/„Nicht im Kader“ eingetragene Spiele und alle Spiele-Plätze (Spieler × Spiele im Zeitraum). */
  readonly missedGames: number;
  readonly gameSlots: number;
}

export interface DevelopmentRow {
  readonly quarter: DevelopmentQuarter;
  readonly cells: Readonly<Record<DevelopmentGroup, DevelopmentCell>>;
  readonly total: DevelopmentCell;
}

export interface DevelopmentResult {
  readonly rows: readonly DevelopmentRow[];
  readonly columnTotals: Readonly<Record<DevelopmentGroup, DevelopmentCell>>;
  readonly total: DevelopmentCell;
  /** Spieler im Auswahlbereich (Nenner für alle Anteile). */
  readonly playerCount: number;
  readonly classifiedCount: number;
  readonly games: number;
  readonly historic: boolean;
  /** Anzahl „nicht eingeordnet“ je Grund (nur Gründe mit Spielern). */
  readonly reasons: readonly { readonly reason: UnclassifiedReason; readonly count: number; readonly details: readonly string[] }[];
  /** Geburtsjahre im Kader (für die Auswahl), aufsteigend. */
  readonly cohorts: readonly string[];
}

export interface DevelopmentInput {
  readonly players: readonly Pick<Player, 'id' | 'birthdate' | 'consentStatus'>[];
  readonly data: ReadonlyMap<string, DevelopmentPlayerData>;
  readonly events: readonly TeamEvent[];
  readonly ratings: ReadonlyMap<string, ReadonlyMap<string, Rating>>;
  readonly filter: DevelopmentFilter;
  readonly today: string;
}

interface Accumulator {
  players: number;
  minutes: number;
  playersWithMinutes: number;
  missedGames: number;
  gameSlots: number;
}

const empty = (): Accumulator => ({ players: 0, minutes: 0, playersWithMinutes: 0, missedGames: 0, gameSlots: 0 });

function finish(acc: Accumulator): DevelopmentCell {
  return { ...acc, averageMinutes: acc.playersWithMinutes ? Math.round(acc.minutes / acc.playersWithMinutes) : null };
}

/** Spielerkader nach Jahrgang filtern; Spieler ohne gültiges Geburtsdatum zählen nur bei „alle Jahrgänge“. */
export function inCohort(player: Pick<Player, 'birthdate'>, cohort: string): boolean {
  return cohort === 'all' || birthYear(player.birthdate) === cohort;
}

export function developmentView(input: DevelopmentInput): DevelopmentResult {
  const { filter, today } = input;
  const games = input.events.filter((event) => event.type === 'Spiel' && !!event.date && event.date >= filter.from && event.date <= filter.to && event.date <= today);
  const players = input.players.filter((player) => inCohort(player, filter.cohort));

  const cells = new Map<string, Accumulator>();
  const cell = (quarter: DevelopmentQuarter, group: DevelopmentGroup) => {
    const key = `${quarter}|${group}`;
    let acc = cells.get(key);
    if (!acc) cells.set(key, (acc = empty()));
    return acc;
  };
  const reasons = new Map<UnclassifiedReason, { count: number; details: Set<string> }>();
  let classifiedCount = 0;

  for (const player of players) {
    const classification = classifyForPeriod(player, input.data.get(player.id) ?? null, filter.to, today);
    let minutes = 0;
    let hasMinutes = false;
    let missed = 0;
    for (const event of games) {
      const rating = input.ratings.get(event.id)?.get(player.id);
      if (!rating) continue;
      if (rating.minutes !== null) {
        minutes += rating.minutes;
        hasMinutes = true;
      }
      if (rating.attendance === 'absent' || rating.attendance === 'excluded') missed += 1;
    }
    const acc = cell(birthQuarter(player.birthdate), classification.group);
    acc.players += 1;
    acc.minutes += minutes;
    if (hasMinutes) acc.playersWithMinutes += 1;
    acc.missedGames += missed;
    acc.gameSlots += games.length;
    if (classification.group === 'unclassified') {
      const entry = reasons.get(classification.reason!) ?? { count: 0, details: new Set<string>() };
      entry.count += 1;
      if (classification.reason === 'no-history' && classification.detail) entry.details.add(classification.detail);
      reasons.set(classification.reason!, entry);
    } else {
      classifiedCount += 1;
    }
  }

  const sum = (accs: Accumulator[]): DevelopmentCell => {
    const total = empty();
    for (const acc of accs) {
      total.players += acc.players;
      total.minutes += acc.minutes;
      total.playersWithMinutes += acc.playersWithMinutes;
      total.missedGames += acc.missedGames;
      total.gameSlots += acc.gameSlots;
    }
    return finish(total);
  };
  const get = (quarter: DevelopmentQuarter, group: DevelopmentGroup) => cells.get(`${quarter}|${group}`) ?? empty();

  const rows = DEVELOPMENT_QUARTERS.map((quarter): DevelopmentRow => ({
    quarter,
    cells: Object.fromEntries(DEVELOPMENT_GROUPS.map((group) => [group, finish(get(quarter, group))])) as Record<DevelopmentGroup, DevelopmentCell>,
    total: sum(DEVELOPMENT_GROUPS.map((group) => get(quarter, group))),
  }));
  const columnTotals = Object.fromEntries(DEVELOPMENT_GROUPS.map((group) => [group, sum(DEVELOPMENT_QUARTERS.map((quarter) => get(quarter, group)))])) as Record<DevelopmentGroup, DevelopmentCell>;
  const cohorts = [...new Set(input.players.map((player) => birthYear(player.birthdate)).filter((year): year is string => year !== null))].sort();

  return {
    rows,
    columnTotals,
    total: sum([...cells.values()]),
    playerCount: players.length,
    classifiedCount,
    games: games.length,
    historic: filter.to < today,
    reasons: [...reasons].map(([reason, entry]) => ({ reason, count: entry.count, details: [...entry.details] })),
    cohorts,
  };
}
