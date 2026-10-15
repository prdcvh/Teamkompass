import { describe, expect, it } from 'vitest';
import { areaPath, smoothPath } from './chart-path';

describe('Diagrammpfade', () => {
  it('ist ohne Punkte leer und bei ein bis zwei Punkten gerade', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 0, y: 5 }])).toBe('M 0 5');
    expect(smoothPath([{ x: 0, y: 5 }, { x: 10, y: 15 }])).toBe('M 0 5 L 10 15');
  });

  it('läuft bei drei Punkten als Kurve durch alle Punkte', () => {
    const path = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 10 }]);
    expect(path.startsWith('M 0 0 C')).toBe(true);
    expect(path.endsWith('20 10')).toBe(true);
    expect(path.match(/C /g)).toHaveLength(2);
  });

  it('schwingt an Wendepunkten nicht über (Extremwerte bleiben die Punkte)', () => {
    const points = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 40 }, { x: 30, y: 40 }];
    const numbers = (smoothPath(points).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
  });

  it('schließt die Fläche zur Grundlinie und bleibt bei einem Punkt leer', () => {
    expect(areaPath([{ x: 0, y: 5 }], 100)).toBe('');
    expect(areaPath([{ x: 0, y: 5 }, { x: 10, y: 15 }], 100)).toBe('M 0 5 L 10 15 L 10 100 L 0 100 Z');
  });
});
