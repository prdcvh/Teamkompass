/** Verlaufsdiagramm der Messwerte (Größe, Gewicht, BMI). */
import { type Measurement, calculateBmi, sortedMeasurements } from './measurement';

export interface MeasurementSeries {
  readonly key: 'height' | 'weight' | 'bmi';
  readonly label: string;
  readonly points: readonly { x: number; y: number; title: string }[];
  readonly path: string;
}

export interface MeasurementChart {
  readonly width: number;
  readonly height: number;
  readonly series: readonly MeasurementSeries[];
  readonly labels: readonly { x: number; text: string }[];
  /** Mindestens zwei Messungen der letzten 12 Monate mit Größe UND Gewicht sind nötig. */
  readonly enough: boolean;
}

const M_WIDTH = 760;
const M_HEIGHT = 260;
const M_LEFT = 24;
const M_RIGHT = 24;
const M_TOP = 56;
const M_BOTTOM = 36;

/**
 * Verlauf der letzten 12 Monate: jede Reihe (Größe, Gewicht, BMI) wird für sich auf die Diagrammhöhe gestreckt
 * (kleinster Wert unten, größter oben), wie in der bisherigen App; es geht um den Verlauf, nicht um den Abstand der Werte.
 */
export function measurementChart(measurements: readonly Measurement[], today: string): MeasurementChart {
  const limit = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const entries = sortedMeasurements(measurements).filter(
    (item): item is Measurement & { height: number; weight: number } => item.height !== null && item.weight !== null && item.date >= limit,
  );
  const span = Math.max(entries.length - 1, 1);
  const x = (index: number) => M_LEFT + (index * (M_WIDTH - M_LEFT - M_RIGHT)) / span;
  const round = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  const build = (key: MeasurementSeries['key'], label: string, values: number[], unit: string): MeasurementSeries => {
    const min = Math.min(...values);
    const range = Math.max(...values) - min || 1;
    const points = values.map((value, index) => ({
      x: x(index),
      y: M_HEIGHT - M_BOTTOM - ((value - min) / range) * (M_HEIGHT - M_BOTTOM - M_TOP),
      title: `${entries[index].date}: ${round(value)}${unit}`,
    }));
    return { key, label, points, path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') };
  };
  if (entries.length < 2) return { width: M_WIDTH, height: M_HEIGHT, series: [], labels: [], enough: false };
  const last = entries[entries.length - 1];
  const bmi = entries.map((item) => calculateBmi(item.height, item.weight) ?? 0);
  return {
    width: M_WIDTH,
    height: M_HEIGHT,
    enough: true,
    series: [
      build('height', `Größe ${round(last.height)} cm`, entries.map((item) => item.height), ' cm'),
      build('weight', `Gewicht ${round(last.weight)} kg`, entries.map((item) => item.weight), ' kg'),
      build('bmi', `BMI ${round(bmi[bmi.length - 1])}`, bmi, ''),
    ],
    labels: entries.map((item, index) => ({ x: x(index), text: item.date.slice(0, 7) })),
  };
}
