import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { draftFromMeasurement, emptyMeasurementDraft } from './measurement';
import { measurementChart } from './measurement-chart';

describe('MeasurementsService', () => {
  let firebase: FakeFirebase;

  async function setup(role?: 'trainer' | 'player' | 'physio') {
    const context = await setupRecords(role);
    firebase = context.firebase;
    return context;
  }

  const stored = () => [...firebase.records.playerRecords.get('p1/measurements')!.entries()];

  it('legt an, bearbeitet und löscht; schreibt Werte als Text wie die bisherige App', async () => {
    const { measurements } = await setup();
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10', '17:30'), height: ['155,5', '155,3', ''] })).toEqual({});
    await vi.waitFor(() => expect(firebase.records.playerRecords.get('p1/measurements')?.size).toBe(2));
    const saved = stored().find(([, data]) => data['date'] === '2026-10-10')!;
    expect(saved[1]).toMatchObject({ height: '155.4', weight: '', playerId: 'p1', heightReadings: [155.5, 155.3], quality: 'verified', time: '17:30', protocol: '1.0' });
    expect(measurements.measurements().map((entry) => entry.date)).toEqual(['2026-07-01', '2026-10-10']);
    expect(await measurements.deleteMeasurement('me1')).toBe(true);
    expect(measurements.measurements()).toHaveLength(1);
  });

  it('prüft Eingaben inkl. Geburtsdatum des Spielers und Datum in der Zukunft', async () => {
    const { measurements } = await setup();
    expect(measurements.saveMeasurement(emptyMeasurementDraft('2026-10-10', '17:30')).height).toBeTruthy();
    // p1 ist am 05.05.2012 geboren (records-setup)
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2012-05-01', '17:30'), height: ['150', '150', ''] }).date).toContain('Geburt');
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2999-01-01', '17:30'), height: ['150', '150', ''] }).date).toContain('Zukunft');
    expect(stored()).toHaveLength(1);
  });

  it('Korrektur einer Bestandsmessung: Grund und Zeit im Protokoll, abhängige Auswertungen nutzen den neuen Wert', async () => {
    const { measurements } = await setup();
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10', '17:30'), height: ['154', '154', ''], weight: ['42', '', ''] }, new Date('2026-11-10T18:00:00Z'))).toEqual({});
    const before = measurementChart(measurements.measurements(), '2026-11-10');
    expect(before.enough).toBe(true);
    const legacy = measurements.measurements()[0];
    expect(legacy.quality).toBeUndefined();
    const edit = { ...draftFromMeasurement(legacy), height: ['152', '', ''], reason: 'Tippfehler' };
    expect(measurements.saveMeasurement(edit, new Date('2026-11-10T18:00:00Z'))).toEqual({});
    await vi.waitFor(() => expect(stored().find(([id]) => id === 'me1')![1]['height']).toBe('152'));
    expect(stored().find(([id]) => id === 'me1')![1]).toMatchObject({ changes: [{ at: '2026-11-10T18:00:00.000Z', reason: 'Tippfehler', before: { height: 150, weight: 40, sittingHeight: null } }] });
    expect(stored().find(([id]) => id === 'me1')![1]).not.toHaveProperty('heightReadings');
    expect(stored().find(([id]) => id === 'me1')![1]).not.toHaveProperty('quality');
    expect(measurements.measurements()[0].height).toBe(152);
    expect(measurementChart(measurements.measurements(), '2026-11-10')).not.toEqual(before);
  });

  it('eine neue Messung wird gegen die vorige auf Ausreißer geprüft', async () => {
    const { measurements } = await setup();
    // vorige Messung 01.07.2026: 150 cm
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10', '17:30'), height: ['149', '149', ''] })).toEqual({});
    await vi.waitFor(() => expect(stored()).toHaveLength(2));
    expect(stored().find(([, data]) => data['date'] === '2026-10-10')![1]).toMatchObject({ quality: 'flagged', flags: ['height-drop'], height: '149' });
  });
});
