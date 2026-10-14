import { calculateBmi, docFromMeasurement, emptyMeasurementDraft, measurementFromDoc, measurementFromDraft, measurementText, validateMeasurement } from './measurement';

describe('Messwerte', () => {
  it('prüft Datum, Größe und Gewicht; mindestens ein Wert', () => {
    const ok = { ...emptyMeasurementDraft('2026-10-10'), height: '150,5', weight: '42' };
    expect(validateMeasurement(ok)).toEqual({});
    expect(validateMeasurement({ ...ok, date: '' }).date).toBeTruthy();
    expect(validateMeasurement({ ...ok, height: 'abc' }).height).toContain('Größe');
    expect(validateMeasurement({ ...ok, height: '300' }).height).toBeTruthy();
    expect(validateMeasurement({ ...ok, weight: '-3' }).weight).toBeTruthy();
    expect(validateMeasurement(emptyMeasurementDraft('2026-10-10')).height).toContain('Größe oder Gewicht');
    expect(validateMeasurement({ ...ok, weight: '' })).toEqual({});
  });

  it('speichert Zahlen mit Punkt und schreibt Werte als Text wie die bisherige App', () => {
    const measurement = measurementFromDraft({ ...emptyMeasurementDraft('2026-10-10'), height: '150,5', weight: '' }, 'm1');
    expect(measurement).toEqual({ id: 'm1', date: '2026-10-10', height: 150.5, weight: null });
    expect(docFromMeasurement(measurement)).toEqual({ id: 'm1', date: '2026-10-10', height: '150.5', weight: '' });
    expect(measurementFromDoc('m1', { date: '2026-10-10', height: '150.5', weight: '' }, '2026-10-11')).toEqual(measurement);
    expect(measurementFromDoc('m2', {}, '2026-10-11')).toEqual({ id: 'm2', date: '2026-10-11', height: null, weight: null });
  });

  it('BMI und Anzeige', () => {
    expect(calculateBmi(150, 40)).toBeCloseTo(17.78, 2);
    expect(calculateBmi(null, 40)).toBeNull();
    expect(calculateBmi(150, null)).toBeNull();
    expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: 40 })).toBe('150 cm · 40 kg · BMI 17,8');
    expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: null })).toBe('150 cm · – kg');
  });
});
