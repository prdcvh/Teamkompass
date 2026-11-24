import type { FieldTestResult } from './field-test';
import {
  MIN_N_PERCENTILE,
  MIN_N_Z,
  REFERENCE_WINDOW_DAYS,
  type ReferencePlayer,
  compareWithReference,
  directedZ,
  distributionStats,
  midRankPercentile,
  quantile,
  referenceValueOf,
} from './field-test-reference';
import { findProtocol } from './field-test-protocols';

let counter = 0;
function result(protocolId: string, value: number | null, extra: Partial<FieldTestResult> = {}): FieldTestResult {
  counter += 1;
  const protocol = findProtocol(protocolId, extra.protocolVersion ?? '1.0');
  return {
    id: `r${counter}`,
    date: '2026-11-01',
    sessionId: 's1',
    protocolId,
    protocolVersion: '1.0',
    unit: protocol?.unit ?? 's',
    method: protocol?.methods[0] ?? 'light-gate',
    tester: '',
    surface: 'artificial',
    conditions: '',
    attempts: protocolId === 'cmj' ? [{ n: 1, value, valid: value !== null }, { n: 2, value, valid: value !== null }] : [{ n: 1, value, valid: value !== null }],
    recordedAt: '2026-11-01T18:00:00.000Z',
    ...extra,
  };
}

/** Team aus Werten: Spieler o0, o1, … mit Jahrgang 2012 (sofern nicht anders angegeben). */
function team(protocolId: string, values: readonly number[], extra: Partial<FieldTestResult> = {}, birthdate = '2012-03-01'): ReferencePlayer[] {
  return values.map((value, index) => ({ playerId: `o${index}`, birthdate, results: [result(protocolId, value, extra)] }));
}

const target = (protocolId: string, value: number, extra: Partial<FieldTestResult> = {}, birthdate = '2012-05-05') => ({ playerId: 'me', birthdate, result: result(protocolId, value, extra) });

describe('Vergleichswerte: Grundfunktionen (SCRUM-264)', () => {
  it('Statistik: Mittelwert, Stichproben-SD (n − 1), Quantile Typ 7', () => {
    const stats = distributionStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats.mean).toBe(5);
    expect(stats.sd).toBeCloseTo(Math.sqrt(32 / 7), 10);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    expect(distributionStats([3]).sd).toBe(0);
    expect(distributionStats([1.85, 1.85, 1.85]).sd).toBe(0);
  });

  it('z wird bei „kleiner ist besser“ umgepolt – eine langsamere Zeit ist nie besser', () => {
    expect(directedZ(2.1, 2, 0.1, 'lower')).toBeCloseTo(-1, 10);
    expect(directedZ(1.9, 2, 0.1, 'lower')).toBeCloseTo(1, 10);
    expect(directedZ(40, 35, 5, 'higher')).toBeCloseTo(1, 10);
    expect(directedZ(2, 2, 0, 'lower')).toBeNull();
  });

  it('Perzentilrang nach Mid-Rank, Gleichstände halb gezählt, richtungsrichtig', () => {
    // Zeiten: 1,8 ist die schnellste von vier → 3 schlechtere + ½ eigener = 3,5 / 4.
    expect(midRankPercentile(1.8, [1.8, 1.9, 2.0, 2.1], 'lower')).toBe(87.5);
    expect(midRankPercentile(2.1, [1.8, 1.9, 2.0, 2.1], 'lower')).toBe(12.5);
    // Gleichstand: zwei gleiche Werte bekommen denselben Rang.
    expect(midRankPercentile(30, [20, 30, 30, 40], 'higher')).toBe(50);
    expect(midRankPercentile(40, [20, 30, 30, 40], 'higher')).toBe(87.5);
  });

  it('nimmt je Spieler das messgleiche Ergebnis, das dem Datum am nächsten liegt, und nur im Fenster', () => {
    const protocol = findProtocol('sprint-10', '1.0')!;
    const own = result('sprint-10', 1.9, { date: '2026-11-01' });
    const player: ReferencePlayer = {
      playerId: 'x',
      birthdate: '',
      results: [
        result('sprint-10', 2.2, { date: '2026-05-01' }),
        result('sprint-10', 2.0, { date: '2026-10-20' }),
        result('sprint-10', 1.7, { date: '2026-11-01', method: 'stopwatch' }),
        result('sprint-20', 3.1, { date: '2026-11-01' }),
      ],
    };
    expect(referenceValueOf(player, own, protocol)?.value).toBe(2.0);
    const far: ReferencePlayer = { playerId: 'y', birthdate: '', results: [result('sprint-10', 2.0, { date: '2025-01-01' })] };
    expect(referenceValueOf(far, own, protocol)).toBeNull();
    const edge: ReferencePlayer = { playerId: 'z', birthdate: '', results: [result('sprint-10', 2.0, { date: '2027-05-03' })] };
    expect(REFERENCE_WINDOW_DAYS).toBe(183);
    expect(referenceValueOf(edge, own, protocol)?.value).toBe(2.0);
  });
});

describe('Vergleichswerte: compareWithReference (SCRUM-264)', () => {
  it('Sprint: schnellster Spieler hat positiven z, Index > 50 und hohen Rang; langsamster das Gegenteil', () => {
    const others = team('sprint-10', [1.9, 1.95, 2.0, 2.05, 2.1, 2.15, 2.2, 2.25, 2.3]);
    const fast = compareWithReference(target('sprint-10', 1.85), others);
    expect(fast.group?.n).toBe(10);
    expect(fast.group?.scope).toBe('birth-year');
    expect(fast.z!).toBeGreaterThan(1);
    expect(fast.index!).toBeGreaterThan(60);
    expect(fast.percentile).toBe(95);
    const slow = compareWithReference(target('sprint-10', 2.4), others);
    expect(slow.z!).toBeLessThan(-1);
    expect(slow.index!).toBeLessThan(40);
    expect(slow.percentile).toBe(5);
  });

  it('Index ist ungekappt und vom Perzentil getrennt', () => {
    // Mit dem eigenen Wert in der Gruppe ist |z| höchstens (n − 1)/√n – für einen Index über 100 braucht es n ≥ 28.
    const others = team('cmj', Array.from({ length: 29 }, (_, index) => 30 + (index % 5) * 0.5));
    const outlier = compareWithReference(target('cmj', 79), others);
    expect(outlier.index!).toBeGreaterThan(100);
    expect(outlier.percentile).toBeCloseTo((100 * 29.5) / 30, 10);
    expect(outlier.hints.some((hint) => hint.includes('Ausreißer') && hint.includes('auch dieser Wert'))).toBe(true);
    expect(outlier.hints.some((hint) => hint.includes('schiefe Verteilung'))).toBe(true);
  });

  it('Einzelfall: keine Zahl, klarer Grund', () => {
    const single = compareWithReference(target('sprint-10', 1.9), []);
    expect(single.group?.n).toBe(1);
    expect(single.z).toBeNull();
    expect(single.index).toBeNull();
    expect(single.percentile).toBeNull();
    expect(single.zMissing).toContain('Einzelfall');
  });

  it(`unter ${MIN_N_Z} Spielern kein z; zwischen ${MIN_N_Z} und ${MIN_N_PERCENTILE - 1} z, aber kein Perzentil`, () => {
    const four = compareWithReference(target('sprint-10', 1.9), team('sprint-10', [2.0, 2.1, 2.2]));
    expect(four.z).toBeNull();
    expect(four.zMissing).toContain('nur 4 Spieler');
    const five = compareWithReference(target('sprint-10', 1.9), team('sprint-10', [2.0, 2.1, 2.2, 2.3]));
    expect(five.z).not.toBeNull();
    expect(five.percentile).toBeNull();
    expect(five.percentileMissing).toContain(`ab ${MIN_N_PERCENTILE} Spielern`);
    expect(five.hints.some((hint) => hint.includes('Kleine Gruppe'))).toBe(true);
  });

  it('SD = 0: kein z, kein Index, kein Perzentil', () => {
    const same = compareWithReference(target('sprint-10', 2.0), team('sprint-10', Array(11).fill(2.0)));
    expect(same.sd).toBe(0);
    expect(same.z).toBeNull();
    expect(same.index).toBeNull();
    expect(same.percentile).toBeNull();
    expect(same.zMissing).toContain('Standardabweichung 0');
  });

  it('mischt keine Protokollversionen, Methoden oder Einheiten', () => {
    const mixed: ReferencePlayer[] = [
      ...team('sprint-10', [2.0, 2.1], { method: 'stopwatch' }),
      ...team('sprint-10', [2.0, 2.1], { protocolVersion: '0.9' }).map((player, index) => ({ ...player, playerId: `v${index}` })),
      ...team('sprint-10', [2.0, 2.1], { unit: 'ms' }).map((player, index) => ({ ...player, playerId: `u${index}` })),
      ...team('sprint-20', [3.0, 3.1]).map((player, index) => ({ ...player, playerId: `t${index}` })),
    ];
    const comparison = compareWithReference(target('sprint-10', 1.9), mixed);
    expect(comparison.group?.n).toBe(1);
    expect(comparison.z).toBeNull();
  });

  it('unbekanntes Testprotokoll und fehlender Wert ergeben keine Gruppe', () => {
    const unknown = compareWithReference({ playerId: 'me', birthdate: '2012-01-01', result: result('sprint-10', 1.9, { protocolVersion: '9.9' }) }, team('sprint-10', [2, 2.1, 2.2, 2.3, 2.4]));
    expect(unknown.group).toBeNull();
    expect(unknown.zMissing).toContain('unbekannt');
    const missing = compareWithReference({ playerId: 'me', birthdate: '2012-01-01', result: result('sprint-10', null) }, team('sprint-10', [2, 2.1, 2.2, 2.3, 2.4]));
    expect(missing.group).toBeNull();
    expect(missing.value).toBeNull();
  });

  it('fehlende Werte anderer Spieler zählen nicht mit (kein Nullwert)', () => {
    const others = [...team('sprint-10', [2.0, 2.1, 2.2, 2.3]), { playerId: 'leer', birthdate: '2012-01-01', results: [result('sprint-10', null)] }, { playerId: 'nix', birthdate: '2012-01-01', results: [] }];
    expect(compareWithReference(target('sprint-10', 1.9), others).group?.n).toBe(5);
  });

  it('erweitert auf alle Jahrgänge mit Kennzeichnung, wenn der Jahrgang zu klein ist', () => {
    const others = [...team('sprint-10', [2.0, 2.1]), ...team('sprint-10', [2.2, 2.3, 2.4], {}, '2013-01-01').map((player, index) => ({ ...player, playerId: `j${index}` }))];
    const comparison = compareWithReference(target('sprint-10', 1.9), others);
    expect(comparison.group?.scope).toBe('team');
    expect(comparison.group?.broadened).toBe(true);
    expect(comparison.group?.n).toBe(6);
    expect(comparison.group?.criteria).toContain('alle Jahrgänge (Jahrgang 2012 allein hat nur 3)');
    expect(comparison.hints[0]).toContain('Breiterer Vergleich');
  });

  it('der verglichene Spieler zählt genau einmal (mit dem verglichenen Ergebnis)', () => {
    const own: ReferencePlayer = { playerId: 'me', birthdate: '2012-05-05', results: [result('sprint-10', 3.5), result('sprint-10', 3.9)] };
    const comparison = compareWithReference(target('sprint-10', 1.9), [own, ...team('sprint-10', [2.0, 2.1, 2.2, 2.3])]);
    expect(comparison.group?.n).toBe(5);
    expect(comparison.mean).toBeCloseTo((1.9 + 2.0 + 2.1 + 2.2 + 2.3) / 5, 10);
  });

  it('zeigt n, Zeitraum, Filter, nicht berücksichtigte Kriterien und Regel-Version', () => {
    const others = team('sprint-10', [2.0, 2.1, 2.2, 2.3]).map((player, index) => ({ ...player, results: [result('sprint-10', 2 + index / 10, { date: `2026-10-0${index + 1}` })] }));
    const group = compareWithReference(target('sprint-10', 1.9), others).group!;
    expect(group.from).toBe('2026-10-01');
    expect(group.to).toBe('2026-11-01');
    expect(group.rulesVersion).toBe('1.0');
    expect(group.criteria).toEqual(expect.arrayContaining(['nur eigenes Team', '10-m-Sprint, Protokoll 1.0', 'Messmethode Lichtschranke', 'Jahrgang 2012']));
    expect(group.notConsidered.join(' ')).toContain('Position');
    expect(group.notConsidered.join(' ')).toContain('Reifestatus');
  });

  it('ist deterministisch (gleiche Eingabe, gleiche Ausgabe; Reihenfolge egal)', () => {
    const others = team('cmj', [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
    const a = compareWithReference(target('cmj', 34), others);
    const b = compareWithReference(target('cmj', 34), [...others].reverse());
    expect(b).toEqual(a);
  });

  it('warnt bei Handstoppung und gemischtem Untergrund', () => {
    const others = team('sprint-10', [2.0, 2.1, 2.2, 2.3], { method: 'stopwatch', surface: 'grass' });
    const comparison = compareWithReference(target('sprint-10', 1.9, { method: 'stopwatch' }), others);
    expect(comparison.hints.some((hint) => hint.includes('Handstoppung'))).toBe(true);
    expect(comparison.hints.some((hint) => hint.includes('Verschiedene Untergründe'))).toBe(true);
  });
});
