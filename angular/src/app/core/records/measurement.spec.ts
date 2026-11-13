import { type Measurement, calculateBmi, docFromMeasurement, measurementFromDoc, measurementQuality, measurementText } from './measurement';
import { type MeasurementContext, type MeasurementDraft, draftFromMeasurement, emptyMeasurementDraft, evaluateMeasurement, measurementFromDraft, validateMeasurement } from './measurement-draft';

const context: MeasurementContext = { today: '2026-11-10', birthdate: '2012-05-05', others: [] };
const NOW = '2026-11-10T18:00:00.000Z';

function draft(change: Partial<MeasurementDraft> = {}): MeasurementDraft {
  return { ...emptyMeasurementDraft('2026-10-10', '17:30', 'Messlatte Kabine'), ...change };
}

function save(input: MeasurementDraft, ctx: MeasurementContext = context, previous: Measurement | null = null): Measurement {
  const evaluation = evaluateMeasurement(input, ctx);
  expect(evaluation.errors).toEqual({});
  return measurementFromDraft(input, input.id ?? 'm1', evaluation, previous, NOW);
}

describe('Messwerte', () => {
  describe('Wiederholungsmessung Größe', () => {
    it('zwei Werte innerhalb 0,4 cm: Mittelwert, Rohwerte bleiben, Qualität geprüft', () => {
      const measurement = save(draft({ height: ['150,1', '150.3', ''] }));
      expect(measurement).toMatchObject({ height: 150.2, heightReadings: [150.1, 150.3], quality: 'verified', protocol: '1.0', time: '17:30', station: 'Messlatte Kabine' });
      expect(measurement.flags).toBeUndefined();
    });

    it('nur eine Messung oder Abweichung ab 0,4 cm ohne dritte Messung lässt sich nicht speichern', () => {
      expect(validateMeasurement(draft({ height: ['150', '', ''] }), context).height).toContain('zweites Mal');
      const pending = evaluateMeasurement(draft({ height: ['150', '150,4', ''] }), context);
      expect(pending.errors.height).toContain('drittes Mal');
      expect(pending.height.needs).toBe('third');
    });

    it('dritte Messung passt: mittlerer Wert, keine Markierung', () => {
      expect(save(draft({ height: ['150', '150,6', '150,4'] }))).toMatchObject({ height: 150.4, heightReadings: [150, 150.6, 150.4], quality: 'verified' });
    });

    it('auch die dritte streut: Median verwenden und als "prüfen" markieren, nichts verwerfen', () => {
      const measurement = save(draft({ height: ['150', '150,6', '151,2'] }));
      expect(measurement).toMatchObject({ height: 150.6, heightReadings: [150, 150.6, 151.2], quality: 'flagged', flags: ['height-spread'] });
    });

    it('gleiche Eingabe ergibt immer denselben Ablauf und Wert', () => {
      const input = draft({ height: ['152,3', '151,8', '152,0'] });
      expect(evaluateMeasurement(input, context)).toEqual(evaluateMeasurement(input, context));
      expect(save(input).height).toBe(152);
    });
  });

  describe('Eingabeprüfung', () => {
    it('Null, negative und unsinnige Werte werden abgefangen', () => {
      expect(validateMeasurement(draft({ height: ['0', '0', ''] }), context).height).toContain('in cm');
      expect(validateMeasurement(draft({ height: ['-150', '150', ''] }), context).height).toContain('in cm');
      expect(validateMeasurement(draft({ height: ['1,52', '1,52', ''] }), context).height).toContain('in cm'); // Meter statt cm
      expect(validateMeasurement(draft({ height: ['abc', '150', ''] }), context).height).toBeTruthy();
      expect(validateMeasurement(draft({ height: ['150', '150', ''], weight: ['-3', '', ''] }), context).weight).toContain('kg');
      expect(validateMeasurement(draft({ height: ['150', '150', ''], weight: ['0', '', ''] }), context).weight).toBeTruthy();
      expect(validateMeasurement(draft(), context).height).toContain('Größe');
    });

    it('Messdatum in der Zukunft oder vor der Geburt wird abgefangen', () => {
      const ok = draft({ height: ['150', '150', ''] });
      expect(validateMeasurement({ ...ok, date: '2026-11-11' }, context).date).toContain('Zukunft');
      expect(validateMeasurement({ ...ok, date: '2012-05-04' }, context).date).toContain('Geburt');
      expect(validateMeasurement({ ...ok, date: '' }, context).date).toBeTruthy();
      expect(validateMeasurement({ ...ok, date: '2026-11-10' }, context)).toEqual({});
      expect(validateMeasurement({ ...ok, date: '2000-01-01' }, { ...context, birthdate: '' })).toEqual({});
    });

    it('Uhrzeit ist Pflicht im Messassistenten; Grund ist Pflicht beim Bearbeiten', () => {
      expect(validateMeasurement(draft({ time: '', height: ['150', '150', ''] }), context).time).toBeTruthy();
      expect(validateMeasurement(draft({ time: '25:00', height: ['150', '150', ''] }), context).time).toBeTruthy();
      expect(validateMeasurement(draft({ id: 'm1', height: ['150', '150', ''] }), context).reason).toBeTruthy();
      expect(validateMeasurement(draft({ id: 'm1', reason: 'Tippfehler', height: ['150', '150', ''] }), context)).toEqual({});
    });

    it('Sitzhöhe ≥ Körpergröße und Sitzhöhe ohne Größe werden abgefangen', () => {
      expect(validateMeasurement(draft({ height: ['150', '150', ''], sittingMode: 'net', sitting: ['150', '', ''] }), context).sitting).toContain('kleiner als die Körpergröße');
      expect(validateMeasurement(draft({ height: ['140', '140', ''], sittingMode: 'net', sitting: ['141', '', ''] }), context).sitting).toBeTruthy();
      expect(validateMeasurement(draft({ weight: ['40', '', ''], sittingMode: 'net', sitting: ['75', '', ''] }), context).sitting).toContain('Größe');
    });

    it('Sitzkasten: Höhe Pflicht, Gesamthöhe muss über dem Kasten liegen', () => {
      const base = draft({ height: ['150', '150', ''], sitting: ['115', '', ''] });
      expect(validateMeasurement({ ...base, boxHeight: '' }, context).box).toBeTruthy();
      expect(validateMeasurement({ ...base, boxHeight: '-40' }, context).box).toBeTruthy();
      expect(validateMeasurement({ ...base, sitting: ['40', '', ''], boxHeight: '40' }, context).sitting).toContain('Sitzkasten');
      expect(validateMeasurement({ ...base, boxHeight: '40' }, context)).toEqual({});
    });
  });

  describe('Einheiten und Sitzkasten', () => {
    it('Sitzkasten wird einmal abgezogen; erneutes Bearbeiten zieht ihn nicht noch einmal ab', () => {
      const first = save(draft({ height: ['150', '150,2', ''], sitting: ['114,5', '114,7', ''], boxHeight: '40' }));
      expect(first).toMatchObject({ sittingReadings: [114.5, 114.7], sittingBoxCm: 40, sittingHeight: 74.6 });
      // Speichern → Firestore → Laden → Bearbeiten → Speichern
      const loaded = measurementFromDoc('m1', docFromMeasurement(first), '2026-11-10');
      const edit = draftFromMeasurement(loaded);
      expect(edit).toMatchObject({ legacy: false, sittingMode: 'box', boxHeight: '40', sitting: ['114.5', '114.7', ''] });
      const second = save({ ...edit, reason: 'Station ergänzt' }, context, loaded);
      expect(second.sittingHeight).toBe(74.6);
      expect(second.height).toBe(150.1);
      expect(second.sittingReadings).toEqual([114.5, 114.7]);
    });

    it('bereits bereinigte Sitzhöhe wird nicht noch einmal gekürzt', () => {
      const measurement = save(draft({ height: ['150', '150', ''], sittingMode: 'net', sitting: ['74,6', '', ''], boxHeight: '40' }));
      expect(measurement.sittingHeight).toBe(74.6);
      expect(measurement.sittingBoxCm).toBeUndefined();
      expect(draftFromMeasurement(measurement)).toMatchObject({ sittingMode: 'net', boxHeight: '' });
    });

    it('Größe in cm, Gewicht in kg: jeweils eigene Toleranz, keine Umrechnung', () => {
      const evaluation = evaluateMeasurement(draft({ height: ['150', '150,3', ''], weight: ['42,0', '42,3', ''] }), context);
      expect(evaluation.height.value).toBe(150.15);
      expect(evaluation.weight.value).toBe(42.15);
      expect(evaluateMeasurement(draft({ height: ['150', '150,3', ''], weight: ['42,0', '42,4', ''] }), context).errors.weight).toContain('0,4 kg');
    });

    it('Beinlänge und Dezimalalter am Messtag', () => {
      const evaluation = evaluateMeasurement(draft({ date: '2026-05-05', height: ['150', '150', ''], sittingMode: 'net', sitting: ['76', '', ''] }), context);
      expect(evaluation.legLength).toBe(74);
      expect(evaluation.age).toBeCloseTo(14, 2);
      expect(evaluateMeasurement(draft({ height: ['150', '150', ''] }), context).legLength).toBeNull();
    });
  });

  it('ohne Gewicht und Sitzhöhe ist eine Größenmessung gültig', () => {
    const measurement = save(draft({ height: ['150', '150,2', ''] }));
    expect(measurement).toMatchObject({ height: 150.1, weight: null, quality: 'verified' });
    expect(measurement.sittingHeight).toBeUndefined();
    expect(docFromMeasurement(measurement)).toEqual({ id: 'm1', date: '2026-10-10', height: '150.1', weight: '', time: '17:30', station: 'Messlatte Kabine', protocol: '1.0', heightReadings: [150, 150.2], weightReadings: [], quality: 'verified' });
  });

  it('Plausibilität und Ausreißer markieren, ohne zu blockieren oder zu ändern', () => {
    const others: Measurement[] = [{ id: 'old', date: '2026-07-01', height: 152, weight: 40 }];
    const measurement = save(draft({ height: ['151', '151', ''], sittingMode: 'net', sitting: ['95', '', ''] }), { ...context, others });
    expect(measurement).toMatchObject({ height: 151, sittingHeight: 95, quality: 'flagged', flags: ['sitting-ratio', 'height-drop'] });
  });

  describe('Bestandsmessungen', () => {
    it('bleiben lesbar, gelten als "nicht dokumentiert" und bekommen keine erfundenen Rohwerte', () => {
      const legacy = measurementFromDoc('m1', { date: '2026-07-01', height: '150', weight: '40', playerId: 'p1' }, '2026-11-10');
      expect(legacy).toEqual({ id: 'm1', date: '2026-07-01', height: 150, weight: 40 });
      expect(measurementQuality(legacy)).toBe('undocumented');
      const edit = draftFromMeasurement(legacy);
      expect(edit).toMatchObject({ legacy: true, height: ['150', '', ''], weight: ['40', '', ''] });
      // eine Größe genügt bei Bestandsmessungen; Grund ist Pflicht
      expect(validateMeasurement(edit, context).reason).toBeTruthy();
      const corrected = save({ ...edit, height: ['151', '', ''], reason: 'Tippfehler' }, context, legacy);
      expect(corrected).toEqual({ id: 'm1', date: '2026-07-01', height: 151, weight: 40, changes: [{ at: NOW, reason: 'Tippfehler', before: { height: 150, weight: 40, sittingHeight: null } }] });
      expect(measurementQuality(corrected)).toBe('undocumented');
      expect(docFromMeasurement(corrected)).not.toHaveProperty('heightReadings');
    });

    it('altes Format: Werte als Text, leeres Dokument', () => {
      expect(measurementFromDoc('m2', {}, '2026-10-11')).toEqual({ id: 'm2', date: '2026-10-11', height: null, weight: null });
      expect(docFromMeasurement({ id: 'm1', date: '2026-10-10', height: 150.5, weight: null })).toEqual({ id: 'm1', date: '2026-10-10', height: '150.5', weight: '' });
    });
  });

  it('Änderungen hängen Grund, Zeit und vorherige Werte an; das Protokoll übersteht Speichern und Laden', () => {
    const first = save(draft({ height: ['150', '150', ''] }));
    const second = save({ ...draftFromMeasurement(first), height: ['151', '151', ''], reason: 'falsch abgelesen' }, context, first);
    const third = save({ ...draftFromMeasurement(second), weight: ['40', '', ''], reason: 'Gewicht nachgetragen' }, context, second);
    expect(third.changes).toEqual([
      { at: NOW, reason: 'falsch abgelesen', before: { height: 150, weight: null, sittingHeight: null } },
      { at: NOW, reason: 'Gewicht nachgetragen', before: { height: 151, weight: null, sittingHeight: null } },
    ]);
    const loaded = measurementFromDoc('m1', docFromMeasurement(third), '2026-11-10');
    expect(loaded).toEqual(third);
  });

  it('Dokumente mit kaputten neuen Feldern werden robust gelesen', () => {
    const loaded = measurementFromDoc('m1', { date: '2026-10-10', height: '150', weight: '', heightReadings: ['150', -1, 'x', 150.2], quality: 'super', flags: ['height-drop', 'quatsch'], changes: [{ reason: 'ohne Zeit' }] }, '2026-11-10');
    expect(loaded).toEqual({ id: 'm1', date: '2026-10-10', height: 150, weight: null, heightReadings: [150, 150.2], flags: ['height-drop'], changes: [] });
  });

  it('BMI und Anzeige', () => {
    expect(calculateBmi(150, 40)).toBeCloseTo(17.78, 2);
    expect(calculateBmi(null, 40)).toBeNull();
    expect(calculateBmi(150, null)).toBeNull();
    expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: 40 })).toBe('150 cm · 40 kg · BMI 17,8');
    expect(measurementText({ id: 'm', date: '2026-10-10', height: 150, weight: null })).toBe('150 cm · – kg');
  });
});
