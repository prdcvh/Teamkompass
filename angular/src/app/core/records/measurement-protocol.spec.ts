import {
  HEIGHT_MIN_READINGS,
  HEIGHT_TOLERANCE_TENTHS,
  WEIGHT_TOLERANCE_TENTHS,
  decimalAgeAt,
  evaluateSeries,
  heightTrendFlag,
  legLengthCm,
  median,
  rangeFlags,
  sittingNet,
} from './measurement-protocol';

describe('Messprotokoll (Methodenversion 1.0 §6)', () => {
  const height = (values: number[]) => evaluateSeries(values, HEIGHT_TOLERANCE_TENTHS, HEIGHT_MIN_READINGS);

  it('Median: 2 Werte = Mittelwert, 3 Werte = der mittlere', () => {
    expect(median([150, 150.3])).toBe(150.15);
    expect(median([150.9, 150, 150.4])).toBe(150.4);
    expect(median([42])).toBe(42);
  });

  it('Größe: eine Messung reicht nicht, zwei innerhalb der Toleranz ergeben den Mittelwert', () => {
    expect(height([150])).toMatchObject({ value: null, needs: 'second' });
    expect(height([150, 150.3])).toMatchObject({ value: 150.15, needs: 'none', spread: false });
  });

  it('Toleranz wird in mm verglichen: 0,39 cm reicht noch, ab 0,4 cm ist die dritte Messung nötig (auch bei Kommazahlen-Resten)', () => {
    expect(height([150.1, 150.4])).toMatchObject({ needs: 'none' }); // 3 mm
    expect(height([150.1, 150.5])).toMatchObject({ value: null, needs: 'third' }); // 4 mm, 0.1 + 0.4 ist in JS ungenau
    expect(height([150.0, 150.4])).toMatchObject({ value: null, needs: 'third' });
    expect(height([0.1 + 0.2 + 150, 150.6])).toMatchObject({ needs: 'none' });
  });

  it('dritte Messung: mittlerer Wert; liegen keine zwei Werte innerhalb der Toleranz, wird geprüft statt verworfen', () => {
    expect(height([150, 150.6, 150.2])).toMatchObject({ value: 150.2, needs: 'none', spread: false });
    expect(height([150, 150.6, 151.2])).toMatchObject({ value: 150.6, needs: 'none', spread: true, readings: [150, 150.6, 151.2] });
    expect(height([150, 150.6, 151.2]).range).toBe(1.2);
  });

  it('Gewicht/Sitzhöhe: eine Messung genügt; Abweichung ab 0,4 kg verlangt eine dritte', () => {
    const weight = (values: number[]) => evaluateSeries(values, WEIGHT_TOLERANCE_TENTHS, 1);
    expect(weight([42.3])).toMatchObject({ value: 42.3, needs: 'none' });
    expect(weight([42.3, 42.5])).toMatchObject({ value: 42.4 });
    expect(weight([42.3, 42.7])).toMatchObject({ value: null, needs: 'third' });
  });

  it('Sitzkasten wird genau einmal abgezogen; Beinlänge nur aus gültigen Werten', () => {
    expect(sittingNet(114.5, 40)).toBe(74.5);
    expect(sittingNet(74.5, 0)).toBe(74.5);
    expect(legLengthCm(150, 74.5)).toBe(75.5);
    expect(legLengthCm(150, 150)).toBeNull();
    expect(legLengthCm(null, 74.5)).toBeNull();
    expect(legLengthCm(150, null)).toBeNull();
  });

  it('Dezimalalter am Messtag', () => {
    expect(decimalAgeAt('2012-05-05', '2026-05-05')).toBeCloseTo(14, 2);
    expect(decimalAgeAt('2012-05-05', '2026-11-04')).toBeCloseTo(14.5, 1);
    expect(decimalAgeAt('2012-05-05', '2012-05-04')).toBeNull();
    expect(decimalAgeAt('', '2026-05-05')).toBeNull();
  });

  it('Ausreißer gegenüber der vorigen Messung', () => {
    const previous = { date: '2026-01-01', height: 150 };
    expect(heightTrendFlag('2026-04-01', 149.6, previous)).toBe('height-drop');
    expect(heightTrendFlag('2026-04-01', 149.7, previous)).toBeNull();
    expect(heightTrendFlag('2026-04-01', 152, previous)).toBeNull();
    expect(heightTrendFlag('2026-04-01', 156, previous)).toBe('height-jump'); // 6 cm in 90 Tagen ≈ 24 cm/Jahr
    expect(heightTrendFlag('2026-01-15', 152, previous)).toBe('height-jump');
    expect(heightTrendFlag('2026-04-01', 150, null)).toBeNull();
  });

  it('Plausibilität der verwendeten Werte', () => {
    expect(rangeFlags(150, 40, 78)).toEqual([]);
    expect(rangeFlags(95, 15, null)).toEqual(['height-range', 'weight-range']);
    expect(rangeFlags(150, null, 118)).toEqual(['sitting-ratio']); // Sitzkasten (40 cm) vergessen
  });
});
