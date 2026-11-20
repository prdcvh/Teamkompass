/**
 * Wachstum, Belastung und Befinden auf einer gemeinsamen Zeitachse (SCRUM-257). Reine Funktionen, ohne Angular.
 *
 * Nur Darstellung bereits vorhandener Daten: Wachstumsgeschwindigkeit (SCRUM-254), Belastungskurve (SCRUM-176) und
 * Befinden (SCRUM-138). Es entsteht KEIN Risikowert, KEIN Hinweis und KEINE Einordnung wie „verletzt“ oder „nicht
 * einsetzen“; fehlende Daten bleiben als „keine Daten“ sichtbar und werden nie als 0 oder „unauffällig“ gelesen.
 */
import { type GrowthAnalysis, type GrowthPoint, type IntervalStatus, FRESH_DAYS, daysBetween, hintRateAt, rateText } from '../records/growth-velocity';
import { addDays, isIsoDate } from '../shared/dates';
import type { LoadCurvePoint } from './load-curve';

/** Rückblick der Ansicht: so weit reicht auch die Belastungskurve (CURVE_HISTORY_DAYS). */
export const OVERVIEW_DAYS = 365;

/** Eine Befindensantwort: Summe der 4 Fragen (4–28, höher = besser) oder `null`, wenn nicht alle beantwortet sind. */
export interface WellnessPoint {
  readonly date: string;
  readonly sum: number | null;
}

export interface LoadSummary {
  /** `none`: im Zeitraum keine Belastung erfasst; `partial`: nur ein Teil der Tage erfasst; `full`: alle Tage. */
  readonly state: 'none' | 'partial' | 'full';
  /** Durchschnittliche Belastung pro Woche (Minuten × Anstrengung) über die erfassten Tage; `null` ohne Daten. */
  readonly perWeek: number | null;
  readonly coveredDays: number;
}

export interface WellnessSummary {
  /** `unreadable`: Befinden nicht freigegeben oder nicht lesbar; `none`: keine Angaben; `some`: mindestens eine vollständige Antwort. */
  readonly state: 'unreadable' | 'none' | 'some';
  readonly count: number;
  /** Mittel der Summen (4–28); `null` ohne vollständige Antwort. */
  readonly mean: number | null;
}

export interface OverviewRow {
  readonly from: GrowthPoint;
  readonly to: GrowthPoint;
  readonly days: number;
  /** cm/Jahr oder `null` (keine Rate in diesem Intervall). */
  readonly rate: number | null;
  readonly rateStatus: IntervalStatus;
  readonly load: LoadSummary;
  readonly wellness: WellnessSummary;
}

/** Belastung im Zeitraum (von, bis]: die Tage nach der ersten bis einschließlich der zweiten Messung. */
export function loadSummary(curve: readonly LoadCurvePoint[], from: string, to: string): LoadSummary {
  const days = curve.filter((point) => point.date > from && point.date <= to);
  const total = daysBetween(from, to);
  if (days.length === 0 || total <= 0) return { state: 'none', perWeek: null, coveredDays: 0 };
  const sum = days.reduce((acc, point) => acc + point.load, 0);
  return { state: days.length >= total ? 'full' : 'partial', perWeek: (sum / days.length) * 7, coveredDays: days.length };
}

/** Befinden im Zeitraum (von, bis]; `wellness === null` heißt: nicht freigegeben oder nicht lesbar. */
export function wellnessSummary(wellness: readonly WellnessPoint[] | null, from: string, to: string): WellnessSummary {
  if (wellness === null) return { state: 'unreadable', count: 0, mean: null };
  const sums = wellness.filter((entry) => entry.date > from && entry.date <= to && entry.sum !== null).map((entry) => entry.sum as number);
  if (sums.length === 0) return { state: 'none', count: 0, mean: null };
  return { state: 'some', count: sums.length, mean: sums.reduce((acc, value) => acc + value, 0) / sums.length };
}

/** Eine Zeile je Messintervall, jüngstes zuerst: Wachstum, Belastung und Befinden desselben Zeitraums. */
export function overviewRows(analysis: GrowthAnalysis, curve: readonly LoadCurvePoint[], wellness: readonly WellnessPoint[] | null): OverviewRow[] {
  return [...analysis.intervals]
    .reverse()
    .map((interval) => ({
      from: interval.from,
      to: interval.to,
      days: interval.days,
      rate: interval.rate,
      rateStatus: interval.status,
      load: loadSummary(curve, interval.from.date, interval.to.date),
      wellness: wellnessSummary(wellness, interval.from.date, interval.to.date),
    }));
}

export interface HintDetail {
  /** Jüngste gültige Größenmessung (Grundlage des Hinweises). */
  readonly newest: GrowthPoint;
  /** Vergleichsmessung (90 bis 365 Tage älter) oder `null`. */
  readonly partner: GrowthPoint | null;
  readonly days: number | null;
  readonly rate: number | null;
  /** Alter der jüngsten gültigen Messung in Tagen. */
  readonly ageDays: number;
  readonly fresh: boolean;
  readonly qualityChecks: readonly string[];
}

/**
 * Intervall, Messqualität und Aktualität des aktuellen Wachstumshinweises (Methodenversion 1.0 §6). `null`, wenn es
 * keine gültige Messung gibt. Zeigt nur an; ob es einen Hinweis gibt, bestimmt `analyzeGrowth` (`currentRate`).
 */
export function hintDetail(analysis: GrowthAnalysis, today: string): HintDetail | null {
  const valid = analysis.points.filter((point) => point.quality !== 'flagged');
  const newest = valid[valid.length - 1];
  if (!newest) return null;
  const partner = hintRateAt(valid, newest).interval?.from ?? null;
  const ageDays = Math.max(0, daysBetween(newest.date, today));
  const qualityChecks: string[] = [];
  for (const point of partner ? [partner, newest] : [newest]) {
    if (point.quality === 'undocumented') qualityChecks.push(`Messung vom ${point.date}: Messqualität nicht dokumentiert, bitte prüfen`);
  }
  return {
    newest,
    partner,
    days: partner ? daysBetween(partner.date, newest.date) : null,
    rate: analysis.currentRate,
    ageDays,
    fresh: ageDays <= FRESH_DAYS,
    qualityChecks,
  };
}

export interface OverviewSize {
  readonly width: number;
  /** Höhe je Teildiagramm. */
  readonly panel: number;
  /** Abstand der Monatsbeschriftungen in Monaten. */
  readonly tickMonths: number;
}

export const OVERVIEW_DESKTOP: OverviewSize = { width: 760, panel: 84, tickMonths: 1 };
export const OVERVIEW_MOBILE: OverviewSize = { width: 380, panel: 96, tickMonths: 2 };

export interface OverviewBar {
  readonly x: number;
  readonly width: number;
  readonly y: number;
  readonly height: number;
  readonly hasRate: boolean;
  readonly title: string;
}

export interface OverviewPanel {
  readonly key: 'growth' | 'load' | 'wellness';
  readonly title: string;
  readonly top: number;
  readonly height: number;
  /** Bereiche ohne Daten (x, Breite), werden schraffiert. */
  readonly empty: readonly { readonly x: number; readonly width: number }[];
  /** Hinweistext im Teildiagramm, wenn gar keine Daten vorliegen. */
  readonly emptyText: string;
}

export interface OverviewDot {
  readonly x: number;
  readonly y: number;
  readonly title: string;
}

export interface Overview {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly panels: readonly OverviewPanel[];
  readonly bars: readonly OverviewBar[];
  readonly measureXs: readonly number[];
  readonly fatigue: string;
  readonly fitness: string;
  readonly dots: readonly OverviewDot[];
  readonly ticks: readonly { readonly x: number; readonly text: string }[];
  readonly summary: string;
}

const LEFT = 12;
const RIGHT = 12;
const GAP = 34;
const TOP = 8;
const AXIS = 28;

const path = (points: readonly { x: number; y: number }[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

/**
 * Drei Teildiagramme untereinander mit derselben x-Achse (Kalendertage): Wachstumsgeschwindigkeit je Intervall,
 * Belastung (Müdigkeit/Fitness pro Woche) und Befinden je Antwort. Daten nur dort, wo es sie gibt: keine Linie über
 * Lücken im Befinden, schraffierte Zeiträume ohne Messung bzw. ohne erfasste Belastung. `null` ohne jede Datenlage.
 */
export function overviewChart(
  analysis: GrowthAnalysis,
  curve: readonly LoadCurvePoint[],
  wellness: readonly WellnessPoint[] | null,
  today: string,
  size: OverviewSize = OVERVIEW_DESKTOP,
): Overview | null {
  const windowStart = addDays(today, -OVERVIEW_DAYS);
  const inWindow = (date: string) => isIsoDate(date) && date >= windowStart && date <= today;
  const wellnessPoints = (wellness ?? []).filter((entry) => entry.sum !== null && inWindow(entry.date));
  const curveInWindow = curve.filter((point) => inWindow(point.date));
  // Ein Intervall, das vor dem Fenster beginnt, wird am Fensteranfang abgeschnitten gezeichnet.
  const firstInWindow = analysis.intervals.find((interval) => interval.to.date >= windowStart);
  const candidates = [
    ...(firstInWindow ? [maxDate(firstInWindow.from.date, windowStart)] : []),
    ...analysis.points.filter((point) => inWindow(point.date)).slice(0, 1).map((point) => point.date),
    ...curveInWindow.slice(0, 1).map((point) => point.date),
    ...wellnessPoints.map((entry) => entry.date),
  ].sort();
  if (candidates.length === 0) return null;
  const start = candidates[0];
  const span = Math.max(daysBetween(start, today), 1);
  const plotWidth = size.width - LEFT - RIGHT;
  const x = (date: string) => LEFT + (Math.max(0, Math.min(daysBetween(start, date), span)) / span) * plotWidth;

  const { panel } = size;
  const tops = [TOP, TOP + panel + GAP, TOP + 2 * (panel + GAP)];
  const height = tops[2] + panel + AXIS;

  // 1) Wachstum
  const drawnIntervals = analysis.intervals.filter((interval) => interval.to.date >= start);
  const rates = drawnIntervals.map((interval) => interval.rate).filter((rate): rate is number => rate !== null);
  const maxRate = Math.max(...rates, 1);
  const bars: OverviewBar[] = drawnIntervals.map((interval) => {
    const x1 = x(interval.from.date);
    const width = Math.max(x(interval.to.date) - x1, 3);
    const label = `${interval.from.date} bis ${interval.to.date}`;
    if (interval.rate === null) {
      return { x: x1, width, y: tops[0], height: panel, hasRate: false, title: `${label}: keine Rate (${interval.days} Tage)` };
    }
    const h = Math.max((interval.rate / maxRate) * (panel - 8), 2);
    return { x: x1, width, y: tops[0] + panel - h, height: h, hasRate: true, title: `${label}: ${rateText(interval.rate)} cm/Jahr (${interval.days} Tage)` };
  });
  const measureXs = analysis.points.filter((point) => point.date >= start && point.date <= today).map((point) => x(point.date));
  const lastGrowth = analysis.points[analysis.points.length - 1]?.date;
  const growthEmpty: { x: number; width: number }[] = [];
  const firstGrowth = analysis.points[0]?.date;
  if (!firstGrowth || firstGrowth > start) growthEmpty.push({ x: x(start), width: x(firstGrowth && firstGrowth <= today ? firstGrowth : today) - x(start) });
  if (lastGrowth && lastGrowth < today) growthEmpty.push({ x: x(lastGrowth), width: x(today) - x(lastGrowth) });

  // 2) Belastung (Müdigkeit und Fitness, pro Woche)
  const loadPoints = curveInWindow.filter((point) => point.date >= start);
  const maxLoad = Math.max(...loadPoints.flatMap((point) => [point.fatigue, point.fitness]), 1);
  const yLoad = (value: number) => tops[1] + panel - 4 - (value / maxLoad) * (panel - 12);
  const fatigue = path(loadPoints.map((point) => ({ x: x(point.date), y: yLoad(point.fatigue) })));
  const fitness = path(loadPoints.map((point) => ({ x: x(point.date), y: yLoad(point.fitness) })));
  const firstLoad = loadPoints[0]?.date;
  const loadEmpty = firstLoad ? (firstLoad > start ? [{ x: x(start), width: x(firstLoad) - x(start) }] : []) : [{ x: x(start), width: x(today) - x(start) }];

  // 3) Befinden (Punkte je vollständiger Antwort, keine Linie über Lücken)
  const yWell = (sum: number) => tops[2] + panel - 4 - ((sum - 4) / 24) * (panel - 12);
  const dots = wellnessPoints
    .filter((entry) => entry.date >= start)
    .map((entry) => ({ x: x(entry.date), y: yWell(entry.sum as number), title: `${entry.date}: Befinden ${entry.sum} von 28` }));

  const ticks: { x: number; text: string }[] = [];
  const monthStart = start.slice(0, 7) + '-01';
  let month = monthStart < start ? addMonth(monthStart) : monthStart;
  let index = 0;
  while (month <= today) {
    if (index % size.tickMonths === 0) ticks.push({ x: x(month), text: month.slice(0, 7) });
    month = addMonth(month);
    index++;
  }

  const panels: OverviewPanel[] = [
    { key: 'growth', title: 'Wachstum (cm/Jahr je Messintervall)', top: tops[0], height: panel, empty: growthEmpty, emptyText: rates.length === 0 && bars.length === 0 ? 'kein Messintervall im Zeitraum' : '' },
    { key: 'load', title: 'Belastung (Müdigkeit und Fitness pro Woche)', top: tops[1], height: panel, empty: loadEmpty, emptyText: loadPoints.length === 0 ? 'keine Belastung erfasst' : '' },
    {
      key: 'wellness',
      title: 'Befinden (Summe 4 bis 28, höher ist besser)',
      top: tops[2],
      height: panel,
      empty: [],
      emptyText: wellness === null ? 'Befinden nicht freigegeben oder nicht lesbar' : dots.length === 0 ? 'keine Angaben' : '',
    },
  ];

  return {
    width: size.width,
    height,
    left: LEFT,
    right: size.width - RIGHT,
    panels,
    bars,
    measureXs,
    fatigue,
    fitness,
    dots,
    ticks,
    summary: [
      `Zeitraum ${start} bis ${today}.`,
      bars.length === 0 ? 'Keine Wachstumsintervalle.' : bars.map((bar) => bar.title).join('; ') + '.',
      loadPoints.length === 0 ? 'Keine Belastung erfasst.' : 'Belastung als Kurve.',
      wellness === null ? 'Befinden nicht freigegeben oder nicht lesbar.' : dots.length === 0 ? 'Befinden: keine Angaben.' : `Befinden: ${dots.length} Angaben.`,
    ].join(' '),
  };
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function addMonth(firstOfMonth: string): string {
  const [year, month] = firstOfMonth.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}
