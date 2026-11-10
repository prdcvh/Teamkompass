/**
 * Wachstumsgeschwindigkeit (cm/Jahr) über mehrere Messintervalle (SCRUM-254). Reine Rechenfunktionen, ohne Angular.
 *
 * Pro Intervall: (Größe neu − Größe alt) / Kalendertage × 365,25. Es wird nichts interpoliert, nichts geglättet und
 * keine Wachstumsspitze (PHV) aus dem Maximum weniger Messpunkte abgeleitet: Die Ansicht zeigt Messungen und die
 * Intervalle dazwischen, mehr nicht.
 */
import { isIsoDate } from '../shared/dates';

/** Tage pro Jahr für die Umrechnung auf cm/Jahr. */
export const DAYS_PER_YEAR = 365.25;

/**
 * VORSCHLAGSWERT, noch mit SCRUM-251 (fachliche Grenzwerte) abzugleichen: Intervalle unter 28 Tagen gehen nicht in
 * automatische Verlaufshinweise ein. Begründung: Bei 1 cm Mess- und Ablesefehler wäre die Rate bei 4 Wochen noch
 * ±13 cm/Jahr unsicher; kürzer wird sie praktisch Rauschen.
 */
export const MIN_INTERVAL_DAYS = 28;

/**
 * VORSCHLAGSWERT, noch mit SCRUM-251 abzugleichen: Raten über 20 cm/Jahr gelten als ungeprüfter Ausreißer (auch das
 * stärkste Wachstum im Jugendalter liegt deutlich darunter) und gehen nicht in Hinweise ein.
 */
export const OUTLIER_RATE_CM_PER_YEAR = 20;

/** Ab so vielen Tagen zwischen zwei Messungen gilt das Intervall als Messlücke (nur Darstellung, keine Bewertung). */
export const GAP_DAYS = 240;

/** Ältere letzte Messung als so viele Tage: kein aktueller Hinweis mehr (der Verlauf bleibt sichtbar). */
export const FRESH_DAYS = 180;

/** Messqualität; Kennzeichen kommen mit SCRUM-253. Bis dahin ist jede vorhandene Messung `undocumented`. */
export type MeasurementQuality = 'undocumented' | 'verified' | 'flagged';

export const QUALITY_LABELS: Readonly<Record<MeasurementQuality, string>> = {
  undocumented: 'Messqualität nicht dokumentiert',
  verified: 'Messung geprüft',
  flagged: 'Messung auffällig markiert',
};

export interface GrowthMeasurement {
  readonly id: string;
  readonly date: string;
  readonly height: number | null;
  /** Optional; fehlt es (heute immer), gilt `undocumented`. */
  readonly quality?: MeasurementQuality;
}

export interface GrowthPoint {
  readonly id: string;
  readonly date: string;
  readonly height: number;
  readonly quality: MeasurementQuality;
}

export type IntervalStatus =
  /** Rate zählt für Hinweise. */
  | 'ok'
  /** Gleicher Messtag: keine Rate. */
  | 'same-day'
  /** Kürzer als MIN_INTERVAL_DAYS: Rate wird gezeigt, zählt aber nicht. */
  | 'too-short'
  /** Größe gesunken: Messung prüfen. */
  | 'negative'
  /** Rate über OUTLIER_RATE_CM_PER_YEAR: ungeprüfter Ausreißer. */
  | 'outlier'
  /** Eine der beiden Messungen ist als auffällig markiert. */
  | 'flagged';

export interface GrowthInterval {
  readonly from: GrowthPoint;
  readonly to: GrowthPoint;
  readonly days: number;
  readonly diffCm: number;
  /** cm/Jahr; null bei gleichem Messtag. */
  readonly rate: number | null;
  readonly status: IntervalStatus;
  /** Messlücke (>= GAP_DAYS). */
  readonly gap: boolean;
  /** Geht in automatische Verlaufshinweise ein. */
  readonly countsForHints: boolean;
}

export type GrowthStage = 'none' | 'baseline' | 'single-interval' | 'multiple-intervals';

export interface GrowthAnalysis {
  readonly stage: GrowthStage;
  readonly points: readonly GrowthPoint[];
  readonly intervals: readonly GrowthInterval[];
  /** Tage seit der letzten Größenmessung; null ohne Messung. */
  readonly dataAgeDays: number | null;
  readonly lastMeasurementDate: string | null;
  /** Ende des letzten Intervalls, das für Hinweise zählt. */
  readonly lastValidDate: string | null;
  /** Aktuelle Rate für Hinweise: nur wenn das letzte zählende Intervall bis zur jüngsten Messung reicht und frisch ist. */
  readonly currentRate: number | null;
  /** Warum es keinen aktuellen Hinweis gibt (leer, wenn es einen gibt oder keine Messung existiert). */
  readonly noHintReason: string;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Rate in cm/Jahr; null bei null oder negativen Tagen (kein Teilen durch null). */
export function growthRate(heightOld: number, heightNew: number, days: number): number | null {
  if (!(days > 0)) return null;
  return ((heightNew - heightOld) / days) * DAYS_PER_YEAR;
}

/** Zwei Nachkommastellen mit Komma, z. B. 6,70. */
export function rateText(rate: number): string {
  return rate.toFixed(2).replace('.', ',');
}

function classify(rate: number | null, days: number, diffCm: number, from: GrowthPoint, to: GrowthPoint): IntervalStatus {
  if (days === 0) return 'same-day';
  if (from.quality === 'flagged' || to.quality === 'flagged') return 'flagged';
  if (diffCm < 0) return 'negative';
  if (days < MIN_INTERVAL_DAYS) return 'too-short';
  if (rate !== null && rate > OUTLIER_RATE_CM_PER_YEAR) return 'outlier';
  return 'ok';
}

export const STATUS_LABELS: Readonly<Record<IntervalStatus, string>> = {
  ok: 'zählt',
  'same-day': 'gleicher Messtag, keine Rate',
  'too-short': 'zu kurzer Abstand, zählt nicht',
  negative: 'Messung prüfen (Größe gesunken)',
  outlier: 'Ausreißer, ungeprüft',
  flagged: 'Messung auffällig markiert',
};

/** Alle Größenmessungen (beliebige Reihenfolge, auch ungeordnet erfasst) → Punkte, Intervalle und Hinweislage. */
export function analyzeGrowth(measurements: readonly GrowthMeasurement[], today: string): GrowthAnalysis {
  const points: GrowthPoint[] = measurements
    .filter((item): item is GrowthMeasurement & { height: number } => item.height !== null && item.height > 0 && isIsoDate(item.date))
    .map((item) => ({ id: item.id, date: item.date, height: item.height, quality: item.quality ?? 'undocumented' }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const intervals: GrowthInterval[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const days = daysBetween(from.date, to.date);
    const diffCm = to.height - from.height;
    const rate = growthRate(from.height, to.height, days);
    const status = classify(rate, days, diffCm, from, to);
    intervals.push({ from, to, days, diffCm, rate, status, gap: days >= GAP_DAYS, countsForHints: status === 'ok' });
  }

  const stage: GrowthStage =
    points.length === 0 ? 'none' : points.length === 1 ? 'baseline' : points.length === 2 ? 'single-interval' : 'multiple-intervals';
  const last = points[points.length - 1] ?? null;
  const dataAgeDays = last ? Math.max(0, daysBetween(last.date, today)) : null;
  const lastValid = [...intervals].reverse().find((interval) => interval.countsForHints) ?? null;

  let currentRate: number | null = null;
  let noHintReason = '';
  if (last) {
    if (!lastValid) noHintReason = stage === 'baseline' ? 'Erst eine Messung: Ausgangswert, noch keine Rate.' : 'Kein Intervall erfüllt die Bedingungen für einen Hinweis.';
    else if (lastValid.to.id !== last.id) noHintReason = 'Die jüngste Messung geht nicht in einen gültigen Hinweis ein (siehe Tabelle).';
    else if ((dataAgeDays ?? 0) > FRESH_DAYS) noHintReason = `Letzte Messung ${dataAgeDays} Tage alt: kein aktueller Hinweis, der Verlauf bleibt sichtbar.`;
    else currentRate = lastValid.rate;
  }

  return {
    stage,
    points,
    intervals,
    dataAgeDays,
    lastMeasurementDate: last?.date ?? null,
    lastValidDate: lastValid?.to.date ?? null,
    currentRate,
    noHintReason,
  };
}

export interface GrowthBar {
  readonly x: number;
  readonly width: number;
  readonly y: number;
  readonly height: number;
  readonly status: IntervalStatus;
  readonly gap: boolean;
  readonly title: string;
}

export interface GrowthVelocityChart {
  readonly width: number;
  readonly height: number;
  readonly zeroY: number;
  readonly bars: readonly GrowthBar[];
  readonly ticks: readonly { x: number; text: string }[];
  readonly summary: string;
}

const C_WIDTH = 760;
const C_HEIGHT = 240;
const C_LEFT = 24;
const C_RIGHT = 24;
const C_TOP = 28;
const C_BOTTOM = 36;

/**
 * Balken je Intervall auf einer echten Zeitachse: Breite = Zeitraum, Höhe = cm/Jahr. Datenlose Zeiträume bleiben
 * leer (keine Linie über die Lücke); Intervalle ohne Rate (gleicher Tag) werden nicht gezeichnet.
 */
export function growthVelocityChart(analysis: GrowthAnalysis): GrowthVelocityChart {
  const drawn = analysis.intervals.filter((interval) => interval.rate !== null);
  const empty = { width: C_WIDTH, height: C_HEIGHT, zeroY: C_HEIGHT - C_BOTTOM, bars: [], ticks: [], summary: '' };
  if (drawn.length === 0) return empty;
  const start = Date.parse(`${analysis.points[0].date}T00:00:00Z`);
  const end = Date.parse(`${analysis.points[analysis.points.length - 1].date}T00:00:00Z`);
  const span = Math.max(end - start, 1);
  const x = (date: string) => C_LEFT + ((Date.parse(`${date}T00:00:00Z`) - start) / span) * (C_WIDTH - C_LEFT - C_RIGHT);
  const rates = drawn.map((interval) => interval.rate as number);
  const max = Math.max(...rates, 1);
  const min = Math.min(...rates, 0);
  const plotTop = C_TOP;
  const plotBottom = C_HEIGHT - C_BOTTOM;
  const y = (value: number) => plotBottom - ((value - min) / (max - min)) * (plotBottom - plotTop);
  const zeroY = y(0);
  const bars = drawn.map((interval) => {
    const rate = interval.rate as number;
    const top = Math.min(y(rate), zeroY);
    const x1 = x(interval.from.date);
    return {
      x: x1,
      width: Math.max(x(interval.to.date) - x1, 3),
      y: top,
      height: Math.max(Math.abs(y(rate) - zeroY), 1),
      status: interval.status,
      gap: interval.gap,
      title: `${interval.from.date} bis ${interval.to.date}: ${rateText(rate)} cm/Jahr (${interval.days} Tage, ${STATUS_LABELS[interval.status]}${interval.gap ? ', Messlücke' : ''})`,
    };
  });
  // Beschriftungen, die sich überlappen würden, entfallen (die Tabelle nennt alle Tage).
  const ticks: { x: number; text: string }[] = [];
  for (const point of analysis.points) {
    const tick = { x: x(point.date), text: point.date.slice(0, 7) };
    if (ticks.length === 0 || tick.x - ticks[ticks.length - 1].x >= 60) ticks.push(tick);
  }
  return {
    width: C_WIDTH,
    height: C_HEIGHT,
    zeroY,
    bars,
    ticks,
    summary: bars.map((bar) => bar.title).join('; '),
  };
}
