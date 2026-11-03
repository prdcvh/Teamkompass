import { addDays } from '../shared/dates';
import { loadCurve } from './load-curve';
import { CURVE_CHART_DAYS, CURVE_CHART_MOBILE, loadCurveChart } from './load-curve-chart';

describe('load-curve-chart (Belastungskurve im Profil)', () => {
  const TODAY = '2026-11-02';

  it('ohne Belastung: keine Linien, Hinweistext', () => {
    const chart = loadCurveChart([]);
    expect(chart.current).toBeNull();
    expect(chart.fatigue).toBe('');
    expect(chart.summary).toBe('Noch keine Belastung eingetragen.');
  });

  it('zeigt höchstens 12 Wochen, heute rechts; Form unter 0 bekommt eine Nulllinie', () => {
    const sessions = Array.from({ length: 30 }, (_, week) => ({ date: addDays(TODAY, -week * 7), load: 900 }));
    const curve = loadCurve(sessions, TODAY);
    expect(curve.length).toBeGreaterThan(CURVE_CHART_DAYS);
    const chart = loadCurveChart(curve);
    const last = curve.at(-1)!;
    expect(chart.current).toEqual({ fatigue: Math.round(last.fatigue), fitness: Math.round(last.fitness), form: Math.round(last.form) });
    expect(chart.current!.form).toBeLessThan(0);
    expect(chart.grid.some((line) => line.zero)).toBe(true);
    expect(Number(chart.grid[0].label)).toBeLessThan(0);
    // Pfad endet am rechten Rand (760 − 24).
    expect(chart.fitness.trim().split(' ').at(-2)).toBe('736');
    expect(chart.ticks.at(-1)).toMatchObject({ label: '02.11.', anchor: 'end' });
    expect(chart.ticks).toHaveLength(6); // alle 14 Tage
    const mobile = loadCurveChart(curve, CURVE_CHART_MOBILE);
    expect(mobile.width).toBe(380);
    expect(mobile.ticks).toHaveLength(3); // alle 28 Tage
    expect(mobile.fitness.trim().split(' ').at(-2)).toBe('356');
    expect(chart.summary).toContain(`Heute: Müdigkeit ${chart.current!.fatigue}, Fitness ${chart.current!.fitness}`);
  });

  it('kurze Kurve beginnt rechtsbündig, nicht über die ganze Breite gestreckt', () => {
    const chart = loadCurveChart(loadCurve([{ date: addDays(TODAY, -2), load: 450 }], TODAY));
    const firstX = Number(chart.fatigue.split(' ')[1]);
    expect(firstX).toBeGreaterThan(700);
    expect(chart.summary).toContain('letzten 3 Tage');
  });
});
