import { addDays } from '../shared/dates';
import { CHRONIC_DAYS, dailyLoads, ewma, ewmaLambda, loadCurve, workloadRatio } from './load-curve';

/** Abklingende Mittel (SCRUM-176): feste Beispielwerte, von Hand nachgerechnet. */
describe('load-curve (Müdigkeit, Fitness, Form)', () => {
  const TODAY = '2026-11-02';
  const ago = (days: number) => addDays(TODAY, -days);

  it('λ = 2 / (N + 1): 0,25 für 7 Tage, 2/29 für 28 Tage', () => {
    expect(ewmaLambda(7)).toBe(0.25);
    expect(ewmaLambda(CHRONIC_DAYS)).toBeCloseTo(0.0689655, 6);
  });

  it('L_t = λ · x_t + (1 − λ) · L_(t−1), Start bei 0', () => {
    expect(ewma([100, 0, 0], 7)).toEqual([25, 18.75, 14.0625]);
    expect(ewma([100, 100], 7, 100)).toEqual([100, 100]);
    const chronic = ewma([290], 28);
    expect(chronic[0]).toBeCloseTo(20, 10);
    // Gleichbleibende Tagesbelastung: das Mittel nähert sich ihr an (nach 200 Tagen auf weniger als 0,01 %).
    expect(ewma(Array(200).fill(100), 28).at(-1)).toBeCloseTo(100, 2);
  });

  it('Tagesbelastung: Lücken zählen 0, mehrere Termine am selben Tag werden addiert, Zukunft und sehr Altes nicht', () => {
    const days = dailyLoads(
      [
        { date: ago(3), load: 450 },
        { date: ago(1), load: 300 },
        { date: ago(1), load: 150 },
        { date: addDays(TODAY, 1), load: 999 },
        { date: ago(400), load: 999 },
      ],
      TODAY,
    );
    expect(days).toEqual([
      { date: ago(3), load: 450 },
      { date: ago(2), load: 0 },
      { date: ago(1), load: 450 },
      { date: TODAY, load: 0 },
    ]);
    expect(dailyLoads([], TODAY)).toEqual([]);
    expect(dailyLoads([{ date: addDays(TODAY, 2), load: 500 }], TODAY)).toEqual([]);
  });

  it('eine Einheit von 900 heute: Müdigkeit 1575, Fitness ≈ 434,5, Form ≈ −1140,5 (Werte pro Woche)', () => {
    const [point] = loadCurve([{ date: TODAY, load: 900 }], TODAY);
    expect(point.fatigue).toBe(1575); // 0,25 × 900 × 7
    expect(point.fitness).toBeCloseTo((2 / 29) * 900 * 7, 6); // 434,48
    expect(point.form).toBeCloseTo(point.fitness - 1575, 6);
    expect(workloadRatio(point)).toBeCloseTo(3.625, 6);
  });

  it('klingt sanft ab statt schlagartig herauszufallen: nach 7 Ruhetagen Müdigkeit × 0,75⁷, Fitness × (27/29)⁷', () => {
    const curve = loadCurve([{ date: ago(7), load: 900 }], TODAY);
    expect(curve).toHaveLength(8);
    expect(curve.at(-1)!.fatigue).toBeCloseTo(1575 * 0.75 ** 7, 6); // ≈ 210,3
    expect(curve.at(-1)!.fitness).toBeCloseTo(434.4827586 * (27 / 29) ** 7, 4); // ≈ 264,3
    expect(curve.at(-1)!.form).toBeGreaterThan(0);
  });

  it('jede Woche 900 (2 × 450): Fitness pendelt sich bei ≈ 900 pro Woche ein, Verhältnis im Wochenschnitt ≈ 1', () => {
    const sessions = Array.from({ length: 26 }, (_, week) => [0, 2].map((day) => ({ date: ago(week * 7 + day + 1), load: 450 }))).flat();
    const lastWeek = loadCurve(sessions, TODAY).slice(-7);
    const meanFitness = lastWeek.reduce((sum, point) => sum + point.fitness, 0) / 7;
    expect(meanFitness).toBeGreaterThan(880);
    expect(meanFitness).toBeLessThan(920);
    const meanRatio = lastWeek.reduce((sum, point) => sum + workloadRatio(point)!, 0) / 7;
    expect(meanRatio).toBeGreaterThan(0.9);
    expect(meanRatio).toBeLessThan(1.1);
  });

  it('ohne Fitness kein Verhältnis', () => {
    expect(workloadRatio(undefined)).toBeNull();
    expect(workloadRatio({ fatigue: 0, fitness: 0 })).toBeNull();
  });
});
