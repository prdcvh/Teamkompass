import { DEFAULT_STEP_PREFS, LIVE_STEPS, STEP_STORAGE_KEY, isAway, liveRows, loadStepPrefs, parseCustomStep, pointsLabel, saveStepPrefs, stepOptions } from './live';

describe('Live-Modus (Logik)', () => {
  it('feste Schrittweiten 1, 2, 3, 5; Standard ist 1', () => {
    expect([...LIVE_STEPS]).toEqual([1, 2, 3, 5]);
    expect(DEFAULT_STEP_PREFS.step).toBe(1);
  });

  it('eigene Zahl: nur ganze Zahlen von 1 bis 20', () => {
    for (const ok of ['1', '7', ' 12 ', '20', 20]) expect(parseCustomStep(ok)).not.toBeNull();
    expect(parseCustomStep('7')).toBe(7);
    for (const bad of ['', '  ', '0', '-3', '2.5', '2,5', '21', '100', 'abc', '3x', '1e1', null, undefined, 0, -1, 1.5, Number.NaN]) {
      expect(parseCustomStep(bad), String(bad)).toBeNull();
    }
  });

  it('eigene Zahl erscheint als eigener Knopf, feste Zahl nicht doppelt', () => {
    expect(stepOptions(null)).toEqual([1, 2, 3, 5]);
    expect(stepOptions(7)).toEqual([1, 2, 3, 5, 7]);
    expect(stepOptions(3)).toEqual([1, 2, 3, 5]);
  });

  it('Schrittweite wird gespeichert und wieder gelesen; Ungültiges fällt auf den Standard', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
    expect(loadStepPrefs(storage)).toEqual(DEFAULT_STEP_PREFS);
    saveStepPrefs(storage, { step: 7, custom: 7 });
    expect(loadStepPrefs(storage)).toEqual({ step: 7, custom: 7 });
    data.set(STEP_STORAGE_KEY, JSON.stringify({ step: 9, custom: 99 }));
    expect(loadStepPrefs(storage)).toEqual(DEFAULT_STEP_PREFS);
    data.set(STEP_STORAGE_KEY, '{kaputt');
    expect(loadStepPrefs(storage)).toEqual(DEFAULT_STEP_PREFS);
    expect(loadStepPrefs(null)).toEqual(DEFAULT_STEP_PREFS);
    expect(() => saveStepPrefs({ setItem: () => { throw new Error('gesperrt'); } }, DEFAULT_STEP_PREFS)).not.toThrow();
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
