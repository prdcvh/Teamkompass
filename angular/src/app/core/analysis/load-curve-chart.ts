/**
 * Diagramm der Belastungskurve im Spielerprofil (SCRUM-176): Müdigkeit, Fitness und Form der letzten Wochen als
 * SVG-Pfade. Reine Funktion, die Werte kommen aus load-curve.ts.
 */
import { type XY, smoothPath } from '../chart-path';
import { formatDate } from '../shared/dates';
import type { LoadCurvePoint } from './load-curve';

export const CURVE_CHART_DAYS = 84;
const LEFT = 54;
const RIGHT = 24;
const TOP = 20;
const BOTTOM = 34;

export interface LoadCurveChart {
  readonly width: number;
  readonly height: number;
  readonly grid: readonly { readonly y: number; readonly label: string; readonly zero: boolean }[];
  readonly ticks: readonly { readonly x: number; readonly label: string; readonly anchor: 'middle' | 'end' }[];
  readonly fatigue: string;
  readonly fitness: string;
  readonly form: string;
  /** Werte des letzten Tags (heute), gerundet. */
  readonly current: { readonly fatigue: number; readonly fitness: number; readonly form: number } | null;
  /** Text für Screenreader. */
  readonly summary: string;
}

/** Schöne Schrittweite für die Hilfslinien (1, 2 oder 5 × Zehnerpotenz), etwa 4 Linien. */
function niceStep(range: number): number {
  const raw = range / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= raw) ?? 10 * power;
}

export interface LoadCurveChartSize {
  readonly width: number;
  readonly height: number;
  /** Abstand der Datumsbeschriftungen in Tagen. */
  readonly tickDays: number;
}

/** Desktop breit und flach; am Handy schmaler, damit die Beschriftung lesbar bleibt. */
export const CURVE_CHART_DESKTOP: LoadCurveChartSize = { width: 760, height: 260, tickDays: 14 };
export const CURVE_CHART_MOBILE: LoadCurveChartSize = { width: 380, height: 240, tickDays: 28 };

export function loadCurveChart(curve: readonly LoadCurvePoint[], size: LoadCurveChartSize = CURVE_CHART_DESKTOP, days = CURVE_CHART_DAYS): LoadCurveChart {
  const { width: WIDTH, height: HEIGHT } = size;
  const points = curve.slice(-days);
  const last = points.at(-1);
  const values = points.flatMap((point) => [point.fatigue, point.fitness, point.form]);
  const step = niceStep(Math.max(Math.max(0, ...values) - Math.min(0, ...values), 100));
  const max = Math.ceil(Math.max(0, ...values) / step) * step || step;
  const min = Math.floor(Math.min(0, ...values) / step) * step;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const y = (value: number) => TOP + ((max - value) / (max - min)) * plotHeight;
  const x = (index: number) => LEFT + (index * plotWidth) / Math.max(days - 1, 1);
  // Rechtsbündig: heute steht immer rechts, auch wenn die Kurve erst vor wenigen Tagen beginnt.
  const offset = days - points.length;
  const line = (pick: (point: LoadCurvePoint) => number) => smoothPath(points.map((point, index): XY => ({ x: x(offset + index), y: y(pick(point)) })));
  const grid = [];
  for (let value = min; value <= max + step / 2; value += step) grid.push({ y: y(value), label: String(value), zero: value === 0 });
  const ticks = points
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => (points.length - 1 - index) % size.tickDays === 0)
    .map(({ point, index }) => ({ x: x(offset + index), label: formatDate(point.date).slice(0, 6), anchor: index === points.length - 1 ? ('end' as const) : ('middle' as const) }));
  const current = last ? { fatigue: Math.round(last.fatigue), fitness: Math.round(last.fitness), form: Math.round(last.form) || 0 } : null;
  return {
    width: WIDTH,
    height: HEIGHT,
    grid,
    ticks,
    fatigue: line((point) => point.fatigue),
    fitness: line((point) => point.fitness),
    form: line((point) => point.form),
    current,
    summary: current
      ? `Belastungskurve der letzten ${points.length} Tage. Heute: Müdigkeit ${current.fatigue}, Fitness ${current.fitness}, Form ${current.form}.`
      : 'Noch keine Belastung eingetragen.',
  };
}
