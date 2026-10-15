import { measurementChart } from './measurement-chart';

describe('measurementChart', () => {
  const m = (id: string, date: string, height: number | null, weight: number | null) => ({ id, date, height, weight });

  it('braucht mindestens zwei Messungen der letzten 12 Monate mit Größe und Gewicht', () => {
    expect(measurementChart([], '2026-10-10').enough).toBe(false);
    expect(measurementChart([m('a', '2026-10-01', 150, 40)], '2026-10-10').enough).toBe(false);
    expect(measurementChart([m('a', '2025-09-01', 150, 40), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(false); // erste älter als 12 Monate
    expect(measurementChart([m('a', '2026-07-01', 150, null), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(false); // ohne Gewicht
    expect(measurementChart([m('a', '2025-10-10', 150, 40), m('b', '2026-10-01', 155, 43)], '2026-10-10').enough).toBe(true); // genau 12 Monate zählt
  });

  it('streckt jede Reihe einzeln: kleinster Wert unten, größter oben; älteste links', () => {
    const chart = measurementChart([m('b', '2026-10-01', 155, 43), m('a', '2026-07-01', 150, 40)], '2026-10-10');
    expect(chart.series.map((series) => series.key)).toEqual(['height', 'weight', 'bmi']);
    for (const series of chart.series) {
      expect(series.points).toHaveLength(2);
      expect(series.points[0].x).toBeLessThan(series.points[1].x);
      expect(series.points[0].y).toBeGreaterThan(series.points[1].y); // der kleinere (frühere) Wert liegt unten
    }
    expect(chart.series[0].label).toBe('Größe 155 cm');
    expect(chart.series[1].label).toBe('Gewicht 43 kg');
    expect(chart.labels.map((label) => label.text)).toEqual(['2026-07', '2026-10']);
    expect(chart.series[0].path.startsWith('M ')).toBe(true);
    expect(chart.summary).toContain('Größe');
  });

  it('gleichbleibende Werte ergeben eine waagerechte Linie ohne Division durch null', () => {
    const chart = measurementChart([m('a', '2026-07-01', 150, 40), m('b', '2026-10-01', 150, 40)], '2026-10-10');
    expect(chart.series[0].points[0].y).toBe(chart.series[0].points[1].y);
    expect(Number.isFinite(chart.series[0].points[0].y)).toBe(true);
  });
});
