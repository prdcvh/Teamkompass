import { FRESH_DAYS, GAP_DAYS, MIN_INTERVAL_DAYS, OUTLIER_RATE_CM_PER_YEAR, analyzeGrowth, growthRate, growthVelocityChart, rateText } from './growth-velocity';

describe('growth-velocity', () => {
  const m = (id: string, date: string, height: number | null) => ({ id, date, height });

  it('163,2 → 165,4 cm in 120 Tagen ergibt 6,70 cm/Jahr', () => {
    expect(rateText(growthRate(163.2, 165.4, 120) as number)).toBe('6,70');
    const analysis = analyzeGrowth([m('a', '2026-01-01', 163.2), m('b', '2026-05-01', 165.4)], '2026-05-10');
    expect(analysis.intervals[0].days).toBe(120);
    expect(rateText(analysis.intervals[0].rate as number)).toBe('6,70');
  });

  it('gleicher Messtag: keine Rate, keine Division durch null', () => {
    expect(growthRate(150, 151, 0)).toBeNull();
    const analysis = analyzeGrowth([m('a', '2026-01-01', 150), m('b', '2026-01-01', 151)], '2026-01-05');
    expect(analysis.intervals[0].rate).toBeNull();
    expect(analysis.intervals[0].status).toBe('same-day');
    expect(analysis.currentRate).toBeNull();
    expect(growthVelocityChart(analysis).bars).toHaveLength(0);
  });

  it('wertet ungeordnet erfasste Messungen nach Datum aus', () => {
    const analysis = analyzeGrowth([m('c', '2026-09-01', 158), m('a', '2026-01-01', 150), m('b', '2026-05-01', 154)], '2026-09-10');
    expect(analysis.points.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(analysis.intervals.map((i) => i.days)).toEqual([120, 123]);
    expect(analysis.intervals.every((i) => (i.rate as number) > 0)).toBe(true);
  });

  it('unterscheidet null, ein, zwei und mehrere Messpunkte', () => {
    expect(analyzeGrowth([], '2026-05-01').stage).toBe('none');
    const one = analyzeGrowth([m('a', '2026-01-01', 150)], '2026-01-10');
    expect(one.stage).toBe('baseline');
    expect(one.intervals).toHaveLength(0);
    expect(one.currentRate).toBeNull();
    const two = analyzeGrowth([m('a', '2026-01-01', 150), m('b', '2026-04-01', 152)], '2026-04-05');
    expect(two.stage).toBe('single-interval');
    expect(two.intervals).toHaveLength(1);
    expect(analyzeGrowth([m('a', '2026-01-01', 150), m('b', '2026-04-01', 152), m('c', '2026-07-01', 154)], '2026-07-05').stage).toBe('multiple-intervals');
  });

  it('ignoriert Messungen ohne Größe', () => {
    expect(analyzeGrowth([m('a', '2026-01-01', null), m('b', '2026-04-01', 152)], '2026-04-05').stage).toBe('baseline');
  });

  it('zu kurze Intervalle, negative Differenz und Ausreißer zählen nicht für Hinweise', () => {
    const short = analyzeGrowth([m('a', '2026-01-01', 150), m('b', `2026-01-${String(MIN_INTERVAL_DAYS)}`, 151)], '2026-02-01');
    expect(short.intervals[0].days).toBe(MIN_INTERVAL_DAYS - 1);
    expect(short.intervals[0].status).toBe('too-short');
    expect(short.intervals[0].rate).not.toBeNull();
    expect(short.currentRate).toBeNull();
    const negative = analyzeGrowth([m('a', '2026-01-01', 152), m('b', '2026-05-01', 150)], '2026-05-02');
    expect(negative.intervals[0].status).toBe('negative');
    expect(negative.currentRate).toBeNull();
    const outlier = analyzeGrowth([m('a', '2026-01-01', 150), m('b', '2026-03-01', 160)], '2026-03-02');
    expect((outlier.intervals[0].rate as number) > OUTLIER_RATE_CM_PER_YEAR).toBe(true);
    expect(outlier.intervals[0].status).toBe('outlier');
    expect(outlier.currentRate).toBeNull();
  });

  it('Messlücke wird markiert, der Balken überspannt nur den echten Zeitraum', () => {
    const analysis = analyzeGrowth([m('a', '2025-01-01', 150), m('b', '2025-04-01', 152), m('c', '2026-04-01', 160)], '2026-04-05');
    expect(analysis.intervals.map((i) => i.gap)).toEqual([false, true]);
    expect(analysis.intervals[1].days).toBeGreaterThanOrEqual(GAP_DAYS);
    const chart = growthVelocityChart(analysis);
    expect(chart.bars).toHaveLength(2);
    expect(chart.bars[0].x + chart.bars[0].width).toBeLessThanOrEqual(chart.bars[1].x + 0.001);
    expect(chart.bars[0].width).toBeLessThan(chart.bars[1].width);
  });

  it('Altdaten: kein aktueller Hinweis ohne frische letzte Messung, Verlauf bleibt', () => {
    const data = [m('a', '2025-01-01', 150), m('b', '2025-05-01', 153)];
    const fresh = analyzeGrowth(data, '2025-05-10');
    expect(fresh.currentRate).not.toBeNull();
    const old = analyzeGrowth(data, '2026-05-10');
    expect(old.currentRate).toBeNull();
    expect(old.dataAgeDays).toBeGreaterThan(FRESH_DAYS);
    expect(old.noHintReason).not.toBe('');
    expect(old.intervals).toHaveLength(1);
    expect(old.lastValidDate).toBe('2025-05-01');
  });

  it('jüngste Messung in einem ungültigen Intervall: kein aktueller Hinweis', () => {
    const analysis = analyzeGrowth([m('a', '2026-01-01', 150), m('b', '2026-05-01', 153), m('c', '2026-05-10', 153.5)], '2026-05-12');
    expect(analysis.lastValidDate).toBe('2026-05-01');
    expect(analysis.currentRate).toBeNull();
  });

  it('Bearbeiten/Löschen rechnet alle Intervalle neu', () => {
    const base = [m('a', '2026-01-01', 150), m('b', '2026-05-01', 153), m('c', '2026-09-01', 157)];
    const before = analyzeGrowth(base, '2026-09-05');
    const edited = analyzeGrowth(base.map((x) => (x.id === 'b' ? m('b', '2026-05-01', 155) : x)), '2026-09-05');
    expect(edited.intervals[0].rate).not.toBe(before.intervals[0].rate);
    expect(edited.intervals[1].rate).not.toBe(before.intervals[1].rate);
    const deleted = analyzeGrowth(base.filter((x) => x.id !== 'b'), '2026-09-05');
    expect(deleted.intervals).toHaveLength(1);
    expect(deleted.intervals[0].days).toBe(243);
  });

  it('ein auffällig markierter Messpunkt (SCRUM-253) schließt seine Intervalle aus', () => {
    const analysis = analyzeGrowth(
      [{ id: 'a', date: '2026-01-01', height: 150 }, { id: 'b', date: '2026-05-01', height: 153, quality: 'flagged' as const }],
      '2026-05-02',
    );
    expect(analysis.intervals[0].status).toBe('flagged');
    expect(analysis.currentRate).toBeNull();
  });
});
