import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { SquadService } from '../player/squad.service';
import { analyzeGrowth } from './growth-velocity';
import type { FakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { draftFromMeasurement, emptyMeasurementDraft } from './measurement-draft';
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

  describe('Markierungen der übrigen Messungen neu berechnen (SCRUM-306)', () => {
    const NOW = new Date('2026-11-10T18:00:00Z');
    async function withSeries() {
      const context = await setup();
      // me1 (Bestand): 01.07.2026, 150 cm. me2 und me3 aus dem Messassistenten; me3 ist „kleiner als vorige“ (155 → 154).
      await firebase.records.savePlayerRecord('p1', 'measurements', 'me2', { date: '2026-10-01', time: '17:00', protocol: '1.0', height: '155', weight: '', quality: 'verified', heightReadings: [155, 155], station: 'Halle' });
      await firebase.records.savePlayerRecord('p1', 'measurements', 'me3', { date: '2026-10-20', time: '17:00', protocol: '1.0', height: '154', weight: '', quality: 'flagged', flags: ['height-drop'], heightReadings: [154, 154], review: { at: '2026-10-21T10:00:00Z', by: 'Trainer', byUid: 'c1' } });
      await vi.waitFor(() => expect(context.measurements.measurements()).toHaveLength(3));
      return context;
    }
    const doc = (id: string) => stored().find(([key]) => key === id)![1];

    it('Korrektur einer älteren Messung: „kleiner als vorige“ der späteren entfällt und wird gespeichert', async () => {
      const { measurements } = await withSeries();
      const edit = { ...draftFromMeasurement(measurements.measurements()[1]), height: ['153,5', '153,5', ''], reason: 'Falsch abgelesen' };
      expect(measurements.saveMeasurement(edit, NOW)).toEqual({});
      await vi.waitFor(() => expect(doc('me3')['quality']).toBe('verified'));
      expect(doc('me3')).not.toHaveProperty('flags');
      // Messwert und übrige Felder der neu markierten Messung bleiben unverändert; die Bestätigung bleibt als Protokoll.
      expect(doc('me3')).toMatchObject({ height: '154', heightReadings: [154, 154], review: { by: 'Trainer' } });
      expect(doc('me2')).toMatchObject({ height: '153.5', station: 'Halle' });
      expect(firebase.records.calls).toContain('saveMeasurementFlags:p1:me3');
      expect(measurements.isFlagged(measurements.measurements()[2])).toBe(false);
    });

    it('Löschen einer Messung: übrige werden neu geprüft; beim Löschen aller Messungen nicht', async () => {
      const { measurements } = await withSeries();
      expect(await measurements.deleteMeasurement('me2')).toBe(true);
      // me3 (154) wird jetzt gegen me1 (150, 111 Tage) geprüft: unauffällig.
      await vi.waitFor(() => expect(doc('me3')['quality']).toBe('verified'));
      TestBed.resetTestingModule();
      const again = await withSeries();
      firebase.records.calls.length = 0;
      expect(await again.measurements.deleteMeasurement('me2', { recalculate: false })).toBe(true);
      expect(firebase.records.calls.some((call) => call.startsWith('saveMeasurementFlags'))).toBe(false);
      expect(doc('me3')).toMatchObject({ quality: 'flagged', flags: ['height-drop'] });
    });

    it('nichts zu ändern: kein zusätzlicher Schreibvorgang', async () => {
      const { measurements } = await setup();
      expect(measurements.saveMeasurement({ ...emptyMeasurementDraft('2026-10-10', '17:30'), height: ['155', '155', ''] }, NOW)).toEqual({});
      await vi.waitFor(() => expect(stored()).toHaveLength(2));
      expect(firebase.records.calls.some((call) => call.startsWith('saveMeasurementFlags'))).toBe(false);
    });

    it('widerrufene Einwilligung: Löschen einer einzelnen Messung ohne Neuberechnung, keine Fehlermeldung', async () => {
      const { measurements } = await withSeries();
      await firebase.players.savePlayer('p1', { ...firebase.players.players.get('p1'), consentStatus: 'revoked' });
      await vi.waitFor(() => expect(TestBed.inject(SquadService).players()[0]?.consentStatus).toBe('revoked'));
      firebase.records.calls.length = 0;
      expect(await measurements.deleteMeasurement('me2')).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(firebase.records.calls.some((call) => call.startsWith('saveMeasurementFlags'))).toBe(false);
      expect(TestBed.inject(SyncService).detail()).toBe('');
      expect(doc('me3')).toMatchObject({ quality: 'flagged', flags: ['height-drop'] });
    });

    it('Schreibfehler bei der Neuberechnung wird gemeldet', async () => {
      const { measurements } = await withSeries();
      firebase.records.saveMeasurementFlagsError = new Error('offline');
      expect(await measurements.deleteMeasurement('me2')).toBe(true);
      await vi.waitFor(() => expect(TestBed.inject(SyncService).detail()).toContain('Markierungen der übrigen Messungen'));
    });
  });

  describe('Bestätigung einer markierten Messung (SCRUM-387)', () => {
    async function withFlagged(role: 'trainer' | 'player' | 'physio' = 'trainer') {
      const context = await setup(role);
      await firebase.records.savePlayerRecord('p1', 'measurements', 'me2', { date: '2026-10-10', height: '153', weight: '', quality: 'flagged', flags: ['height-jump'], heightReadings: [153, 153] });
      await vi.waitFor(() => expect(context.measurements.measurements()).toHaveLength(2));
      return context;
    }

    it('bestätigt: speichert Datum, Konto und Grund; Wert unverändert, Markierung zählt nicht mehr', async () => {
      const { measurements, state } = await withFlagged();
      TestBed.inject(SessionService).uid.set('coach1');
      TestBed.inject(SessionService).displayName.set('Trainer Test');
      expect(measurements.isFlagged(measurements.measurements()[1])).toBe(true);
      expect(analyzeGrowth(measurements.measurements(), '2026-11-10').currentRate).toBeNull();
      expect(await measurements.confirmMeasurement('me2', ' Nachgemessen ', new Date('2026-11-10T18:00:00Z'))).toBe(true);
      expect(stored().find(([id]) => id === 'me2')![1]).toMatchObject({ height: '153', quality: 'flagged', review: { at: '2026-11-10T18:00:00.000Z', by: 'Trainer Test', byUid: 'coach1', reason: 'Nachgemessen' } });
      const entry = measurements.measurements()[1];
      expect(entry.height).toBe(153);
      expect(measurements.isFlagged(entry)).toBe(false);
      // Wachstumsrate: die bestätigte Messung zählt wieder (vorher keine Rate wegen Markierung)
      expect(analyzeGrowth(measurements.measurements(), '2026-11-10').currentRate).not.toBeNull();
      expect(state.measurementList()).toHaveLength(2);
    });

    it('ohne Begründung und ohne Anzeigename: kein E-Mail-Fallback', async () => {
      const { measurements } = await withFlagged();
      const session = TestBed.inject(SessionService);
      session.uid.set('coach1');
      session.email.set('geheim@example.com');
      await measurements.confirmMeasurement('me2');
      const review = stored().find(([id]) => id === 'me2')![1]['review'] as Record<string, unknown>;
      expect(review['by']).toBe('Trainer');
      expect(review).not.toHaveProperty('reason');
      expect(JSON.stringify(review)).not.toContain('geheim');
    });

    it('nimmt die Bestätigung zurück: Markierung und Rate wie zuvor', async () => {
      const { measurements } = await withFlagged();
      TestBed.inject(SessionService).uid.set('coach1');
      const before = analyzeGrowth(measurements.measurements(), '2026-11-10');
      await measurements.confirmMeasurement('me2');
      expect(await measurements.withdrawReview('me2')).toBe(true);
      expect(stored().find(([id]) => id === 'me2')![1]).not.toHaveProperty('review');
      expect(measurements.isFlagged(measurements.measurements()[1])).toBe(true);
      expect(analyzeGrowth(measurements.measurements(), '2026-11-10')).toEqual(before);
    });

    it('Medizin darf bestätigen, Spieler nicht; unmarkierte Messungen lassen sich nicht bestätigen', async () => {
      const physio = await withFlagged('physio');
      TestBed.inject(SessionService).uid.set('medic1');
      expect(await physio.measurements.confirmMeasurement('me1')).toBe(false);
      expect(await physio.measurements.confirmMeasurement('me2')).toBe(true);
      TestBed.resetTestingModule();
      const player = await withFlagged('player');
      TestBed.inject(SessionService).uid.set('pl1');
      expect(await player.measurements.confirmMeasurement('me2')).toBe(false);
      expect(stored().find(([id]) => id === 'me2')![1]).not.toHaveProperty('review');
    });

    it('eine Korrektur des Werts entfernt die Bestätigung (neuer Wert, neue Prüfung)', async () => {
      const { measurements } = await withFlagged();
      TestBed.inject(SessionService).uid.set('coach1');
      await measurements.confirmMeasurement('me2');
      const edit = { ...draftFromMeasurement(measurements.measurements()[1]), height: ['148', '148', ''], reason: 'Neu gemessen' };
      expect(measurements.saveMeasurement(edit, new Date('2026-11-11T18:00:00Z'))).toEqual({});
      await vi.waitFor(() => expect(stored().find(([id]) => id === 'me2')![1]['height']).toBe('148'));
      expect(stored().find(([id]) => id === 'me2')![1]).not.toHaveProperty('review');
    });

    it('meldet einen Schreibfehler und lässt den Zustand unverändert', async () => {
      const { measurements } = await withFlagged();
      TestBed.inject(SessionService).uid.set('coach1');
      firebase.records.saveMeasurementReviewError = new Error('offline');
      expect(await measurements.confirmMeasurement('me2')).toBe(false);
      expect(measurements.isFlagged(measurements.measurements()[1])).toBe(true);
    });
  });
});
