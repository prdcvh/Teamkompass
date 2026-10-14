import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { emptyMeasurementDraft } from './measurement';

describe('MeasurementsService', () => {
  let firebase: FakeFirebase;

  async function setup(role?: 'trainer' | 'player' | 'medical') {
    const context = await setupRecords(role);
    firebase = context.firebase;
    return context;
  }

  it('legt an, bearbeitet und löscht; schreibt Werte als Text wie die bisherige App', async () => {
    const { measurements } = await setup();
    expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10'), height: '155,5', weight: '' })).toEqual({});
    await vi.waitFor(() => expect(firebase.records.playerRecords.get('p1/measurements')?.size).toBe(2));
    const saved = [...firebase.records.playerRecords.get('p1/measurements')!.entries()].find(([, data]) => data['date'] === '2026-10-10')!;
    expect(saved[1]).toMatchObject({ height: '155.5', weight: '', playerId: 'p1' });
    expect(measurements.measurements().map((entry) => entry.date)).toEqual(['2026-07-01', '2026-10-10']);
    expect(await measurements.deleteMeasurement('me1')).toBe(true);
    expect(measurements.measurements()).toHaveLength(1);
  });

  it('prüft Eingaben', async () => {
    const { measurements } = await setup();
    expect(measurements.saveMeasurement(emptyMeasurementDraft('2026-10-10')).height).toBeTruthy();
  });
});
