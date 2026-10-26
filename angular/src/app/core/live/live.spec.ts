import { LIVE_STEPS, isAway, liveRows, nextStep, pointsLabel } from './live';

describe('Live-Modus (Logik)', () => {
  it('Schrittweite wechselt im Kreis', () => {
    expect(LIVE_STEPS[0]).toBe(1);
    expect([1, 2, 5].map(nextStep)).toEqual([2, 5, 1]);
    expect(nextStep(7)).toBe(1); // unbekannt → Standard
  });

  it('negative Punkte mit Minuszeichen', () => {
    expect(pointsLabel(3)).toBe('3');
    expect(pointsLabel(0)).toBe('0');
    expect(pointsLabel(-2)).toBe('−2');
  });

  it('Fehlt und Nicht im Kader sind „nicht da“', () => {
    expect(isAway('absent')).toBe(true);
    expect(isAway('excluded')).toBe(true);
    expect(isAway('open')).toBe(false);
    expect(isAway('present')).toBe(false);
    expect(isAway('limited')).toBe(false);
  });

  it('Reihenfolge ist alphabetisch und fest; gleiche Vornamen bekommen den Anfangsbuchstaben', () => {
    const rows = liveRows([
      { id: 'p3', name: 'Leon Schmidt' },
      { id: 'p1', name: 'Anna Berg' },
      { id: 'p2', name: 'Leon Müller' },
      { id: 'p4', name: 'Mo' },
    ]);
    expect(rows.map((row) => row.label)).toEqual(['Anna', 'Leon M.', 'Leon S.', 'Mo']);
    expect(rows.map((row) => row.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
