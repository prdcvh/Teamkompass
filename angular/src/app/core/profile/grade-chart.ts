/**
 * Notendiagramm für Spielerprofil, Spieleransicht und Teamform: Note 1 oben, Note 6 unten; mit Datum eine echte
 * Zeitachse (SCRUM-265).
 */
import { areaPath, smoothPath } from '../chart-path';
import { LEVEL_OPTIONS, type RatingScale, scoreLabel, scoreShortLabel } from '../ratings/rating-scale';
import { daysBetween, isIsoDate } from '../shared/dates';
import { GAP_DAYS, entryScale } from './development';
import type { GradedEvent } from './profile';

export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 260;
const CHART_LEFT = 54;
const CHART_RIGHT = 24;
const CHART_TOP = 46;
const CHART_BOTTOM = 38;

/** Rasterlinie mit Achsenbeschriftung (Schulnote „1“ … „6“ oder Stufe „lernt“/„kann“/„sicher“, SCRUM-188). */
export interface GridLine {
  readonly y: number;
  readonly grade: number;
  readonly label: string;
  /** Linker Rand der Beschriftung. */
  readonly x: number;
}

/** Beschriftung der Zeitachse (SCRUM-265): bei Datumsachse Monate bzw. Tage, sonst das Datum am Punkt. */
export interface AxisTick {
  readonly x: number;
  readonly label: string;
}

/** Senkrechte Markierung, z. B. „Skala gewechselt“ zwischen zwei Punkten. */
export interface ChartMarker {
  readonly x: number;
  readonly label: string;
}

/** Gestrichelte Verbindung über eine Lücke ohne Bewertung (mehr als 6 Wochen). */
export interface ChartGap {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Ein Punkt eines Notendiagramms. */
export interface PlotPoint {
  readonly grade: number;
  readonly label: string;
  readonly title: string;
  /** Wird unverändert am Punkt weitergereicht (z. B. Spiel/Training). */
  readonly kind?: string;
  /** Datum JJJJ-MM-TT; haben alle Punkte eins, ist die X-Achse eine echte Zeitachse (SCRUM-265). */
  readonly date?: string;
  /** Abschnitt (z. B. Bewertungsskala): wechselt er, wird die Linie unterbrochen und markiert. */
  readonly group?: string;
}

export interface PlottedPoint extends PlotPoint {
  readonly x: number;
  readonly y: number;
  readonly valueLabel: string;
}

export interface PlotChart {
  readonly width: number;
  readonly height: number;
  readonly grid: readonly GridLine[];
  readonly points: readonly PlottedPoint[];
  readonly path: string;
  /** Fläche unter der Kurve (leer bei weniger als zwei Punkten). */
  readonly area: string;
  /** Textalternative: alle Werte in einem Satz. */
  readonly summary: string;
  /** Index des besten Wertes (kleinste Note), -1 ohne Punkte. */
  readonly best: number;
  readonly ticks: readonly AxisTick[];
  readonly markers: readonly ChartMarker[];
  readonly gaps: readonly ChartGap[];
  /** true: X-Abstand proportional zur Kalenderzeit von `from` bis `to`. */
  readonly timeScaled: boolean;
  readonly from: string;
  readonly to: string;
}

export type TrendChart = PlotChart;
export type ChartPoint = PlottedPoint;

export interface PlotOptions {
  /** Beginn und Ende der Zeitachse (Beobachtungszeitraum); ohne Angabe erstes bzw. letztes Datum. */
  readonly from?: string;
  readonly to?: string;
  /** Beschriftung der Markierung bei einem Wechsel von `group`. */
  readonly groupChangeLabel?: string;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Achsenbeschriftung für eine Datumsachse: bis gut 3 Monate alle 14 Tage, darüber Monatsanfänge (höchstens 8). */
function timeTicks(from: string, to: string, xOf: (date: string) => number): AxisTick[] {
  const span = daysBetween(from, to);
  if (span <= 0) return [{ x: xOf(from), label: `${from.slice(8, 10)}.${from.slice(5, 7)}.` }];
  if (span <= 100) {
    const ticks: AxisTick[] = [];
    for (let day = 0; day <= span; day += 14) {
      const date = new Date(`${from}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + day);
      const iso = date.toISOString().slice(0, 10);
      ticks.push({ x: xOf(iso), label: `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` });
    }
    return ticks;
  }
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  if (from.slice(8, 10) !== '01') month += 1;
  for (;;) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const iso = `${year}-${String(month).padStart(2, '0')}-01`;
    if (iso > to) break;
    months.push(iso);
    month += 1;
  }
  const step = Math.ceil(months.length / 8) || 1;
  return months
    .filter((_, index) => index % step === 0)
    .map((iso) => {
      const m = Number(iso.slice(5, 7));
      return { x: xOf(iso), label: m === 1 || iso === months[0] ? `${MONTH_SHORT[m - 1]} ${iso.slice(2, 4)}` : MONTH_SHORT[m - 1] };
    });
}

/**
 * Notendiagramm: Note 1 oben, Note 6 unten. Haben alle Punkte ein Datum, ist die X-Achse eine Zeitachse (SCRUM-265):
 * gleiche Kalenderabstände ergeben gleiche X-Abstände, die Achse reicht über den Beobachtungszeitraum (`from`–`to`),
 * Lücken über 6 Wochen werden gestrichelt und ein Wechsel von `group` (Skala) unterbricht die Linie mit Markierung.
 * Ohne Datum stehen die Punkte wie bisher gleichmäßig nebeneinander. Bei Kompetenzstufen (SCRUM-188) bleibt die
 * Zahlenachse gleich, nur Raster und Beschriftung zeigen die drei Stufen.
 */
export function plotChart(input: readonly PlotPoint[], scale: RatingScale = 'grades', options: PlotOptions = {}): PlotChart {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const y = (grade: number) => CHART_TOP + ((grade - 1) / 5) * plotHeight;
  const dates = input.map((entry) => entry.date ?? '');
  const timeScaled = input.length > 0 && dates.every((date) => isIsoDate(date));
  const sorted = [...dates].sort();
  const from = timeScaled ? (options.from && isIsoDate(options.from) && options.from < sorted[0] ? options.from : sorted[0]) : '';
  const to = timeScaled ? (options.to && isIsoDate(options.to) && options.to > sorted[sorted.length - 1] ? options.to : sorted[sorted.length - 1]) : '';
  const span = timeScaled ? daysBetween(from, to) : 0;
  const xOfDate = (date: string) => CHART_LEFT + (span > 0 ? (daysBetween(from, date) / span) * plotWidth : 0);
  const points = input.map((entry, index) => ({
    ...entry,
    x: timeScaled ? xOfDate(entry.date!) : CHART_LEFT + (index * plotWidth) / Math.max(input.length - 1, 1),
    y: y(entry.grade),
    valueLabel: scoreLabel(entry.grade, scale),
  }));
  const grid: GridLine[] =
    scale === 'levels'
      ? LEVEL_OPTIONS.map((option) => ({ y: y(option.value), grade: option.value, label: scoreShortLabel(option.value, scale), x: 4 }))
      : [1, 2, 3, 4, 5, 6].map((grade) => ({ y: y(grade), grade, label: String(grade), x: 24 }));
  const best = points.length ? points.reduce((index, point, at) => (point.grade < points[index].grade ? at : index), 0) : -1;
  // Abschnitte: neuer Abschnitt bei Wechsel der Gruppe (Markierung) oder bei einer Lücke über 6 Wochen (gestrichelt).
  const segments: (typeof points)[] = [];
  const markers: ChartMarker[] = [];
  const gaps: ChartGap[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    if (!before) {
      segments.push([point]);
      return;
    }
    if ((before.group ?? '') !== (point.group ?? '')) {
      markers.push({ x: (before.x + point.x) / 2, label: options.groupChangeLabel ?? 'Wechsel' });
      segments.push([point]);
    } else if (timeScaled && daysBetween(before.date!, point.date!) > GAP_DAYS) {
      gaps.push({ x1: before.x, y1: before.y, x2: point.x, y2: point.y });
      segments.push([point]);
    } else {
      segments[segments.length - 1].push(point);
    }
  });
  const ticks = timeScaled ? timeTicks(from, to, xOfDate) : points.map((point) => ({ x: point.x, label: point.label }));
  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    grid,
    points,
    path: segments.map((segment) => smoothPath(segment)).join(' '),
    area: segments
      .map((segment) => areaPath(segment, CHART_HEIGHT - CHART_BOTTOM))
      .filter(Boolean)
      .join(' '),
    summary: points.map((point) => `${point.label}${point.kind ? ` ${point.kind}` : ''} ${noteWord(scale)} ${scoreLabel(point.grade, scale)}`).join(', '),
    best,
    ticks,
    markers,
    gaps,
    timeScaled,
    from,
    to,
  };
}

/** „Note 2,3“ bei Schulnoten, „Stufe kann es“ bei Kompetenzstufen. */
export function noteWord(scale: RatingScale): string {
  return scale === 'levels' ? 'Stufe' : 'Note';
}

/**
 * Verlaufsdiagramm: Note 1 oben, Note 6 unten, ein Punkt je benotetem Event am echten Datum (SCRUM-265). Mit `period`
 * zeigt es nur Bewertungen im Beobachtungszeitraum und die Achse reicht über den ganzen Zeitraum. Ein Wechsel der
 * Bewertungsskala unterbricht die Linie („Skala gewechselt“).
 */
export function trendChart(graded: readonly GradedEvent[], scale: RatingScale = 'grades', period?: { readonly from: string; readonly to: string }): TrendChart {
  const shown = period ? graded.filter((entry) => entry.event.date >= period.from && entry.event.date <= period.to) : graded;
  return plotChart(
    shown.map((entry) => ({
      grade: entry.grade,
      label: entry.event.date.slice(5),
      title: `${entry.event.title} (${entry.event.date.slice(8, 10)}.${entry.event.date.slice(5, 7)}.${entry.event.date.slice(0, 4)}): ${noteWord(scale)} ${scoreLabel(entry.grade, scale)}`,
      date: entry.event.date,
      group: entryScale(entry),
    })),
    scale,
    { from: period?.from, to: period?.to, groupChangeLabel: 'Skala gewechselt' },
  );
}
