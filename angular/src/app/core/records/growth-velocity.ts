/**
 * Wachstumsgeschwindigkeit (cm/Jahr) über mehrere Messintervalle (SCRUM-254). Reine Rechenfunktionen, ohne Angular.
 *
 * Pro Intervall: (Größe neu − Größe alt) / Kalendertage × 365,25. Es wird nichts interpoliert, nichts geglättet und
 * keine Wachstumsspitze (PHV) aus dem Maximum weniger Messpunkte abgeleitet: Die Ansicht zeigt Messungen und die
 * Intervalle dazwischen, mehr nicht.
 *
 * Grenzwerte: Methodenversion 1.0, docs/reife-kompass-methoden.md §6 (SCRUM-251), sofern nicht anders vermerkt.
 */
import { isIsoDate } from '../shared/dates';

/** Tage pro Jahr für die Umrechnung auf cm/Jahr. */
export const DAYS_PER_YEAR = 365.25;

/** Methodenversion 1.0 §6: Mindestabstand für eine Rate. Kürzere Intervalle zeigen nur die Werte, keine Rate, keinen Hinweis. */
export const MIN_INTERVAL_DAYS = 90;

/** Methodenversion 1.0 §6: längster Abstand für einen Hinweis. Längere Intervalle zeigen die Rate, zählen aber nicht für Hinweise. */
export const MAX_HINT_INTERVAL_DAYS = 365;

/** Methodenversion 1.0 §6: Aktualitätsgrenze; die jüngste gültige Größenmessung darf höchstens so alt sein. */
export const FRESH_DAYS = 90;

/** Methodenversion 1.0 §6: ab einem Rückgang von 0,4 cm "Messung prüfen", keine Rate. */
export const NEGATIVE_CHECK_CM = 0.4;

/**
 * EIGENER VORSCHLAGSWERT von SCRUM-254, nicht aus SCRUM-251: Raten über 20 cm/Jahr gelten als ungeprüfter Ausreißer
 * (auch das stärkste Wachstum im Jugendalter liegt deutlich darunter) und gehen nicht in Hinweise ein.
 */
export const OUTLIER_RATE_CM_PER_YEAR = 20;

/** Nur Darstellung, eigener Vorschlagswert: ab so vielen Tagen zwischen zwei Messungen gilt das Intervall als Messlücke. */
export const GAP_DAYS = 240;

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
  /** Rate gültig und zählt für Hinweise. */
  | 'ok'
  /** Gleicher Messtag: keine Rate. */
  | 'same-day'
  /** Kürzer als MIN_INTERVAL_DAYS: keine Rate ("zu kurz für eine Rate"). */
  | 'too-short'
  /** Größe um mindestens 0,4 cm gesunken: Messung prüfen, keine Rate. */
  | 'negative'
  /** Größe um weniger als 0,4 cm gesunken: Messrauschen, keine Rate (nie eine negative Rate). */
  | 'noise'
  /** Rate über OUTLIER_RATE_CM_PER_YEAR: ungeprüfter Ausreißer, Rate sichtbar, zählt nicht. */
  | 'outlier'
  /** Länger als MAX_HINT_INTERVAL_DAYS: Rate sichtbar, zählt nicht für Hinweise. */
  | 'too-long'
  /** Eine der beiden Messungen ist als auffällig markiert: keine Rate. */
  | 'flagged';

export interface GrowthInterval {
  readonly from: GrowthPoint;
  readonly to: GrowthPoint;
  readonly days: number;
  readonly diffCm: number;
  /** cm/Jahr; null, wenn keine Rate gezeigt wird (gleicher Tag, zu kurz, gesunken, markiert). Nie negativ. */
  readonly rate: number | null;
  readonly status: IntervalStatus;
  /** Messlücke (>= GAP_DAYS). */
  readonly gap: boolean;
}

export type GrowthStage = 'none' | 'baseline' | 'single-interval' | 'multiple-intervals';

export interface GrowthAnalysis {
  readonly stage: GrowthStage;
  readonly points: readonly GrowthPoint[];
  readonly intervals: readonly GrowthInterval[];
  /** Tage seit der jüngsten Größenmessung; null ohne Messung. */
  readonly dataAgeDays: number | null;
  readonly lastMeasurementDate: string | null;
  /** Jüngste gültige (nicht als auffällig markierte) Größenmessung. */
  readonly lastValidDate: string | null;
  /** Aktuelle Rate für Hinweise (jüngste gültige Messung gegen die jüngste ältere mit 90 bis 365 Tagen Abstand). */
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

function buildInterval(from: GrowthPoint, to: GrowthPoint): GrowthInterval {
  const days = daysBetween(from.date, to.date);
  const diffCm = to.height - from.height;
  // In Millimetern vergleichen (Gleitkomma): -0,4 cm gilt schon als "prüfen".
  const diffMm = Math.round(diffCm * 10);
  const raw = growthRate(from.height, to.height, days);
  let status: IntervalStatus;
  if (days === 0) status = 'same-day';
  else if (from.quality === 'flagged' || to.quality === 'flagged') status = 'flagged';
  else if (diffMm <= -NEGATIVE_CHECK_CM * 10) status = 'negative';
  else if (diffMm < 0) status = 'noise';
  else if (days < MIN_INTERVAL_DAYS) status = 'too-short';
  else if (raw !== null && raw > OUTLIER_RATE_CM_PER_YEAR) status = 'outlier';
  else if (days > MAX_HINT_INTERVAL_DAYS) status = 'too-long';
  else status = 'ok';
  const showsRate = status === 'ok' || status === 'outlier' || status === 'too-long';
  return { from, to, days, diffCm, rate: showsRate ? raw : null, status, gap: days >= GAP_DAYS };
}

export const STATUS_LABELS: Readonly<Record<IntervalStatus, string>> = {
  ok: 'Rate gültig',
  'same-day': 'gleicher Messtag, keine Rate',
  'too-short': 'zu kurz für eine Rate',
  negative: 'Messung prüfen (Größe gesunken), keine Rate',
  noise: 'kleiner Rückgang, Messrauschen, keine Rate',
  outlier: 'Ausreißer, ungeprüft, zählt nicht für Hinweise',
  'too-long': 'Abstand über 365 Tage, zählt nicht für Hinweise',
  flagged: 'Messung auffällig markiert, keine Rate',
};

/** Alle Größenmessungen (beliebige Reihenfolge, auch ungeordnet erfasst) → Punkte, Intervalle und Hinweislage. */
export function analyzeGrowth(measurements: readonly GrowthMeasurement[], today: string): GrowthAnalysis {
  const points: GrowthPoint[] = measurements
    .filter((item): item is GrowthMeasurement & { height: number } => item.height !== null && item.height > 0 && isIsoDate(item.date))
    .map((item) => ({ id: item.id, date: item.date, height: item.height, quality: item.quality ?? 'undocumented' }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const intervals: GrowthInterval[] = [];
  for (let index = 1; index < points.length; index++) intervals.push(buildInterval(points[index - 1], points[index]));

  const stage: GrowthStage =
    points.length === 0 ? 'none' : points.length === 1 ? 'baseline' : points.length === 2 ? 'single-interval' : 'multiple-intervals';
  const last = points[points.length - 1] ?? null;
  const dataAgeDays = last ? Math.max(0, daysBetween(last.date, today)) : null;
  const validPoints = points.filter((point) => point.quality !== 'flagged');
  const newest = validPoints[validPoints.length - 1] ?? null;
  const newestAge = newest ? Math.max(0, daysBetween(newest.date, today)) : null;

  let currentRate: number | null = null;
  let noHintReason = '';
  if (last) {
    if (!newest) noHintReason = 'Alle Messungen sind als auffällig markiert: kein Hinweis.';
    else if (validPoints.length < 2) noHintReason = 'Erst eine Messung: Ausgangswert, noch keine Rate.';
    else if ((newestAge ?? 0) > FRESH_DAYS) noHintReason = `Letzte gültige Messung ${newestAge} Tage alt (mehr als ${FRESH_DAYS}): kein aktueller Hinweis, der Verlauf bleibt sichtbar.`;
    else {
      // Vergleichsmessung: die jüngste ältere Messung mit 90 bis 365 Tagen Abstand (nicht unbedingt die direkt davor).
      const partner = [...validPoints].reverse().find((point) => {
        const days = daysBetween(point.date, newest.date);
        return days >= MIN_INTERVAL_DAYS && days <= MAX_HINT_INTERVAL_DAYS;
      });
      if (!partner) noHintReason = `Keine ältere Messung mit ${MIN_INTERVAL_DAYS} bis ${MAX_HINT_INTERVAL_DAYS} Tagen Abstand: zu kurz oder zu lang für eine Rate.`;
      else {
        const pair = buildInterval(partner, newest);
        if (pair.status === 'ok') currentRate = pair.rate;
        else noHintReason = `Die Messungen vom ${partner.date} und ${newest.date} ergeben keine gültige Rate: ${STATUS_LABELS[pair.status]}.`;
      }
    }
  }

  return {
    stage,
    points,
    intervals,
    dataAgeDays,
    lastMeasurementDate: last?.date ?? null,
    lastValidDate: newest?.date ?? null,
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
