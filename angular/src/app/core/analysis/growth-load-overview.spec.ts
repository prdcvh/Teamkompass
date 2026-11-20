import { analyzeGrowth } from '../records/growth-velocity';
import { type LoadCurvePoint } from './load-curve';
import { type WellnessPoint, hintDetail, loadSummary, overviewChart, overviewRows, wellnessSummary } from './growth-load-overview';

const TODAY = '2026-11-01';
const m = (id: string, date: string, height: number | null, quality?: 'verified' | 'flagged') => ({ id, date, height, ...(quality ? { quality } : {}) });
const day = (date: string, load: number): LoadCurvePoint => ({ date, load, fatigue: load, fitness: load / 2, form: 0 });

describe('Wachstum, Belastung und Befinden (SCRUM-257)', () => {
  describe('loadSummary', () => {
    it('Ø pro Woche über die erfassten Tage im Zeitraum (von, bis]', () => {
      // 4 Tage von 5 (Mo–Do im Zeitraum 01.–05.): Summe 280 / 4 Tage * 7
      const curve = [day('2026-10-01', 999), day('2026-10-02', 100), day('2026-10-03', 0), day('2026-10-04', 100), day('2026-10-05', 80)];
      expect(loadSummary(curve, '2026-10-01', '2026-10-05')).toEqual({ state: 'full', perWeek: (280 / 4) * 7, coveredDays: 4 });
    });

    it('ohne Kurventage keine Belastung erfasst (nicht 0)', () => {
      expect(loadSummary([], '2026-08-01', '2026-10-01')).toEqual({ state: 'none', perWeek: null, coveredDays: 0 });
      expect(loadSummary([day('2026-11-01', 50)], '2026-08-01', '2026-10-01').state).toBe('none');
    });

    it('nur Teil des Zeitraums erfasst: partial mit Anzahl', () => {
      const curve = [day('2026-10-04', 70), day('2026-10-05', 70)];
      const result = loadSummary(curve, '2026-10-01', '2026-10-05');
      expect(result).toEqual({ state: 'partial', perWeek: 490, coveredDays: 2 });
    });
  });

  describe('wellnessSummary', () => {
    const entries: WellnessPoint[] = [
      { date: '2026-09-10', sum: 20 },
      { date: '2026-09-20', sum: 10 },
      { date: '2026-09-25', sum: null },
      { date: '2026-08-01', sum: 28 },
    ];
    it('Mittel nur aus vollständigen Antworten im Zeitraum', () => {
      expect(wellnessSummary(entries, '2026-08-01', '2026-10-01')).toEqual({ state: 'some', count: 2, mean: 15 });
    });
    it('keine Antworten = keine Angaben, nicht unauffällig', () => {
      expect(wellnessSummary(entries, '2026-10-01', '2026-11-01')).toEqual({ state: 'none', count: 0, mean: null });
      expect(wellnessSummary([], '2026-08-01', '2026-10-01').state).toBe('none');
    });
    it('nicht lesbar (Widerruf/Regeln) ist ein eigener Zustand', () => {
      expect(wellnessSummary(null, '2026-08-01', '2026-10-01')).toEqual({ state: 'unreadable', count: 0, mean: null });
    });
  });

  describe('overviewRows', () => {
    it('eine Zeile je Intervall, jüngstes zuerst, mit Rate und Zeitraumdaten', () => {
      const analysis = analyzeGrowth([m('a', '2026-05-01', 150), m('b', '2026-08-01', 152), m('c', '2026-10-30', 153)], TODAY);
      const rows = overviewRows(analysis, [day('2026-09-01', 100)], []);
      expect(rows.map((row) => `${row.from.date}>${row.to.date}`)).toEqual(['2026-08-01>2026-10-30', '2026-05-01>2026-08-01']);
      expect(rows[0].rate).not.toBeNull();
      expect(rows[0].load.state).toBe('partial');
      expect(rows[1].load.state).toBe('none');
      expect(rows[1].wellness.state).toBe('none');
    });
    it('Intervall ohne Rate (zu kurz) bleibt sichtbar', () => {
      const analysis = analyzeGrowth([m('a', '2026-10-01', 150), m('b', '2026-10-10', 151)], TODAY);
      const rows = overviewRows(analysis, [], null);
      expect(rows).toHaveLength(1);
      expect(rows[0].rate).toBeNull();
      expect(rows[0].rateStatus).toBe('too-short');
      expect(rows[0].wellness.state).toBe('unreadable');
    });
  });

  describe('hintDetail', () => {
    it('nennt Intervall, Aktualität und Messqualität', () => {
      const analysis = analyzeGrowth([m('a', '2026-07-01', 150, 'verified'), m('b', '2026-10-15', 152)], TODAY);
      const detail = hintDetail(analysis, TODAY)!;
      expect(detail.partner?.date).toBe('2026-07-01');
      expect(detail.newest.date).toBe('2026-10-15');
      expect(detail.days).toBe(106);
      expect(detail.ageDays).toBe(17);
      expect(detail.fresh).toBe(true);
      expect(detail.qualityChecks).toEqual(['Messung vom 2026-10-15: Messqualität nicht dokumentiert, bitte prüfen']);
    });
    it('veraltete Messung wird als nicht aktuell gekennzeichnet, markierte zählen nicht', () => {
      const analysis = analyzeGrowth([m('a', '2026-03-01', 150, 'verified'), m('b', '2026-06-01', 152, 'verified'), m('c', '2026-10-30', 160, 'flagged')], TODAY);
      const detail = hintDetail(analysis, TODAY)!;
      expect(detail.newest.date).toBe('2026-06-01');
      expect(detail.fresh).toBe(false);
      expect(detail.qualityChecks).toEqual([]);
    });
    it('Vergleichsmessung folgt der gemeinsamen Regel (90 bis 365 Tage, nicht die direkt vorherige)', () => {
      const analysis = analyzeGrowth([m('a', '2026-05-01', 150, 'verified'), m('b', '2026-10-10', 152, 'verified'), m('c', '2026-10-20', 153, 'verified')], TODAY);
      const detail = hintDetail(analysis, TODAY)!;
      expect(detail.partner?.date).toBe('2026-05-01');
      expect(detail.days).toBe(172);
    });
    it('ohne gültige Messung gibt es keine Details', () => {
      expect(hintDetail(analyzeGrowth([], TODAY), TODAY)).toBeNull();
    });
  });

  describe('overviewChart', () => {
    it('ohne jede Datenlage null', () => {
      expect(overviewChart(analyzeGrowth([], TODAY), [], [], TODAY)).toBeNull();
    });

    it('gleiche x-Achse: Balken, Kurve und Punkte im selben Zeitraum, Lücken bleiben leer', () => {
      const analysis = analyzeGrowth([m('a', '2026-05-01', 150), m('b', '2026-08-01', 152)], TODAY);
      const curve = [day('2026-09-01', 100), day('2026-10-01', 100)];
      const chart = overviewChart(analysis, curve, [{ date: '2026-09-15', sum: 20 }], TODAY)!;
      expect(chart.bars).toHaveLength(1);
      expect(chart.bars[0].hasRate).toBe(true);
      expect(chart.dots).toHaveLength(1);
      // Befinden-Punkt liegt zwischen den beiden Belastungstagen (gleiche Achse).
      const [first, second] = chart.fatigue.split(' L').map((part) => Number(part.replace(/^M/, '').split(',')[0]));
      expect(chart.dots[0].x).toBeGreaterThan(first);
      expect(chart.dots[0].x).toBeLessThan(second);
      expect(chart.panels.find((p) => p.key === 'growth')!.empty.length).toBeGreaterThan(0); // nach der letzten Messung
      expect(chart.panels.find((p) => p.key === 'load')!.empty.length).toBeGreaterThan(0); // vor der ersten Belastung
    });

    it('Befinden: keine Angaben vs. nicht lesbar, nie als Punkt', () => {
      const analysis = analyzeGrowth([m('a', '2026-05-01', 150), m('b', '2026-08-01', 152)], TODAY);
      expect(overviewChart(analysis, [], [], TODAY)!.panels[2].emptyText).toBe('keine Angaben');
      expect(overviewChart(analysis, [], null, TODAY)!.panels[2].emptyText).toBe('Befinden nicht freigegeben oder nicht lesbar');
      expect(overviewChart(analysis, [], [{ date: '2026-09-01', sum: null }], TODAY)!.dots).toHaveLength(0);
    });

    it('Intervall ohne Rate wird als „keine Rate“ markiert, nicht als Balken mit Wert', () => {
      const analysis = analyzeGrowth([m('a', '2026-10-01', 150), m('b', '2026-10-10', 151)], TODAY);
      const chart = overviewChart(analysis, [], [], TODAY)!;
      expect(chart.bars[0].hasRate).toBe(false);
      expect(chart.bars[0].title).toContain('keine Rate');
    });

    it('Intervalle vor dem Rückblick-Fenster werden abgeschnitten, nicht verworfen', () => {
      const analysis = analyzeGrowth([m('a', '2025-06-01', 140), m('b', '2026-06-01', 150)], TODAY);
      const chart = overviewChart(analysis, [], [], TODAY)!;
      expect(chart.bars).toHaveLength(1);
      expect(chart.bars[0].x).toBe(chart.left);
    });
  });
});
