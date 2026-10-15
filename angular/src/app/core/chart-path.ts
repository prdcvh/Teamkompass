/** Hilfen für die SVG-Diagramme: weiche, überschwingungsfreie Kurve (monotone kubische Interpolation). */

export interface XY {
  readonly x: number;
  readonly y: number;
}

const r = (value: number) => Math.round(value * 10) / 10;

/** SVG-Pfad durch die Punkte; leer ohne Punkte, bei ein bis zwei Punkten gerade Linien. */
export function smoothPath(points: readonly XY[]): string {
  if (points.length === 0) return '';
  const head = `M ${r(points[0].x)} ${r(points[0].y)}`;
  if (points.length < 3) return [head, ...points.slice(1).map((point) => `L ${r(point.x)} ${r(point.y)}`)].join(' ');
  const count = points.length;
  const widths: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    widths[i] = points[i + 1].x - points[i].x || 1;
    slopes[i] = (points[i + 1].y - points[i].y) / widths[i];
  }
  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < count - 1; i += 1) tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  tangents[count - 1] = slopes[count - 2];
  for (let i = 0; i < count - 1; i += 1) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const sum = a * a + b * b;
    if (sum > 9) {
      const scale = 3 / Math.sqrt(sum);
      tangents[i] = scale * a * slopes[i];
      tangents[i + 1] = scale * b * slopes[i];
    }
  }
  const segments: string[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const w = widths[i] / 3;
    segments.push(
      `C ${r(points[i].x + w)} ${r(points[i].y + tangents[i] * w)} ${r(points[i + 1].x - w)} ${r(points[i + 1].y - tangents[i + 1] * w)} ${r(points[i + 1].x)} ${r(points[i + 1].y)}`,
    );
  }
  return [head, ...segments].join(' ');
}

/** Geschlossene Fläche unter der Kurve bis zur Linie `baseline`; leer bei weniger als zwei Punkten. */
export function areaPath(points: readonly XY[], baseline: number): string {
  if (points.length < 2) return '';
  const last = points[points.length - 1];
  return `${smoothPath(points)} L ${r(last.x)} ${r(baseline)} L ${r(points[0].x)} ${r(baseline)} Z`;
}
