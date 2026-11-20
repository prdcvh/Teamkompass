import { EMPTY_MATURITY_INPUTS, MATURITY_METHOD_VERSION, type MaturityInputs, maturityAt, maturityInputsForCalculation, percentText } from './maturity';
import { ADULT_HEIGHT_ERROR_90_CM, ASSESSMENT_STATUS_TEXT, assessMaturity, maturityRange, pahSentence } from './maturity-assessment';
import type { Measurement } from './measurement';

/** SCRUM-256: Einordnung mit Datengrundlage, Unsicherheit und Widersprüchen. Junge, geboren 05.05.2012. */
describe('Reife-Kompass: Erklärung der Einordnung (SCRUM-256)', () => {
  const born = '2012-05-05';
  const today = '2026-11-03';
  const inputs: MaturityInputs = { sex: 'm', parentsConsent: true, motherHeight: 168, fatherHeight: 182, updatedAt: '2026-11-01T10:00:00.000Z' };
  const m = (id: string, date: string, height: number | null, weight: number | null, extra: Partial<Measurement> = {}): Measurement => ({ id, date, height, weight, ...extra });
  const normal = [m('a', '2026-04-01', 160, 47), m('b', '2026-10-01', 165, 51)];

  it('Beispiel 166/181: etwa 91,7 % der geschätzten Erwachsenengröße', () => {
    expect(pahSentence(166, 181)).toBe('etwa 91,7 % der geschätzten Erwachsenengröße (heute 166 cm, geschätzt ca. 181 cm erwachsen)');
  });

  it('frische, unauffällige Daten: Einordnung wie bisher, mit Datengrundlage, Eingabestand und Methodenversion', () => {
    const result = assessMaturity(normal, born, inputs, today);
    const latest = maturityAt(normal[1], born, inputs)!;
    expect(result.status).toBe('classified');
    expect(result.band).toBe(latest.band);
    expect(result.latest?.percent).toBe(latest.percent);
    expect(result.causes).toEqual([]);
    expect(result.basis).toMatchObject({
      heightCount: 2,
      firstDate: '2026-04-01',
      lastDate: '2026-10-01',
      usableCount: 2,
      quality: { undocumented: 2, verified: 0, flagged: 0 },
      latestAgeDays: 33,
      missing: [],
      inputsDate: '2026-11-01',
      methodVersion: MATURITY_METHOD_VERSION,
    });
  });

  describe('keine Elternhöhen', () => {
    it('kein Wert, keine Einordnung, konkreter Grund – Messungen bleiben gezählt (Wachstumskurve nutzbar)', () => {
      const result = assessMaturity(normal, born, { ...inputs, motherHeight: null, fatherHeight: null }, today);
      expect(result.status).toBe('not-calculated');
      expect(result.latest).toBeNull();
      expect(result.band).toBeNull();
      expect(result.statusText).toBe('nicht eingeordnet');
      expect(result.causes).toEqual(['Größe beider Eltern']);
      expect(result.basis.heightCount).toBe(2);
    });

    it('ohne Einverständnis der Eltern heißt der Grund genau so', () => {
      const result = assessMaturity(normal, born, { ...inputs, parentsConsent: false }, today);
      expect(result.causes).toEqual(['Einverständnis der Eltern zur Speicherung ihrer Größe']);
    });
  });

  it('widerrufene Einwilligung: mit den Angaben aus maturityInputsForCalculation gibt es keinen Wert und keine Einordnung', () => {
    const result = assessMaturity(normal, born, maturityInputsForCalculation(inputs, { consentStatus: 'revoked' }), today);
    expect(result.status).toBe('not-calculated');
    expect(result.latest).toBeNull();
    expect(result.history).toEqual([]);
    expect(assessMaturity(normal, born, EMPTY_MATURITY_INPUTS, today).basis.inputsDate).toBe('');
  });

  it('veraltet (älter als 90 Tage): Wert mit Datum bleibt, aber keine Einordnung', () => {
    const result = assessMaturity(normal, born, inputs, '2027-01-15');
    expect(result.status).toBe('stale');
    expect(result.band).toBeNull();
    expect(result.latest?.date).toBe('2026-10-01');
    expect(result.statusText).toBe(ASSESSMENT_STATUS_TEXT.stale);
    expect(result.causes[0]).toContain('106 Tage alt');
    // genau 90 Tage = noch aktuell
    expect(assessMaturity(normal, born, inputs, '2026-12-30').status).toBe('classified');
  });

  describe('widersprüchliche Hinweise → „Einordnung unsicher – prüfen“ mit Ursachen, keine Mehrheit', () => {
    it('jüngste Messung ist zur Prüfung markiert', () => {
      const series = [normal[0], m('b', '2026-10-01', 165, 51, { quality: 'flagged', flags: ['height-spread'] })];
      const result = assessMaturity(series, born, inputs, today);
      expect(result.status).toBe('uncertain');
      expect(result.band).toBeNull();
      expect(result.statusText).toBe('Einordnung unsicher – prüfen');
      expect(result.causes[0]).toContain('01.10.2026 ist zur Prüfung markiert');
      expect(result.causes[0]).toContain('Auch nach der 3. Messung');
    });

    it('Größe gesunken (ab 0,4 cm) gegenüber der vorigen Messung', () => {
      const series = [m('a', '2026-04-01', 166, 47), m('b', '2026-10-01', 165, 51)];
      const result = assessMaturity(series, born, inputs, today);
      expect(result.status).toBe('uncertain');
      expect(result.causes.join(' ')).toContain('gesunken');
    });

    it('unplausibel starker Zuwachs (über 20 cm/Jahr)', () => {
      const series = [m('a', '2026-04-01', 150, 47), m('b', '2026-10-01', 165, 51)];
      const result = assessMaturity(series, born, inputs, today);
      expect(result.status).toBe('uncertain');
      expect(result.causes.join(' ')).toContain('unplausibel stark gestiegen');
    });

    it('Reifestand um 1,5 Prozentpunkte oder mehr gesunken – wird einzeln genannt', () => {
      // Gleiche Tabellenzeile (14,5), 9 cm weniger – z. B. Tippfehler bei der vorigen Messung.
      const series = [m('a', '2026-10-01', 175, 51), m('b', '2026-10-20', 166, 51)];
      const before = maturityAt(series[0], born, inputs)!;
      const after = maturityAt(series[1], born, inputs)!;
      expect(before.percent - after.percent).toBeGreaterThanOrEqual(1.5);
      const result = assessMaturity(series, born, inputs, today);
      expect(result.status).toBe('uncertain');
      expect(result.causes.join(' ')).toContain(`von ${percentText(before.percent)}`);
    });

    it('neuere Größenmessung ohne Gewicht: Wert beruht auf älterer Messung', () => {
      const series = [...normal, m('c', '2026-10-20', 166, null)];
      const result = assessMaturity(series, born, inputs, today);
      expect(result.status).toBe('uncertain');
      expect(result.latest?.date).toBe('2026-10-01');
      expect(result.causes.join(' ')).toContain('ohne Gewicht');
      expect(result.basis.notCounted.join(' ')).toContain('1 Messung ohne Gewicht');
    });

    it('veraltet und widersprüchlich: beide Ursachen, Status unsicher', () => {
      const series = [normal[0], m('b', '2026-10-01', 165, 51, { quality: 'flagged' })];
      const result = assessMaturity(series, born, inputs, '2027-03-01');
      expect(result.status).toBe('uncertain');
      expect(result.causes).toHaveLength(2);
    });
  });

  it('außerhalb des Altersbereichs: Messungen vor dem 12. Geburtstag zählen nicht und werden genannt', () => {
    const series = [m('a', '2024-01-01', 150, 40), ...normal];
    const result = assessMaturity(series, born, inputs, today);
    expect(result.basis.usableCount).toBe(2);
    expect(result.basis.notCounted).toEqual(['1 Messung vor dem 12. Geburtstag (außerhalb des Altersbereichs 12 bis 15 Jahre)']);
  });

  it('Fehlerbreite: Bereich aus der 90-%-Grenze der Studie, Grenzen im Bereich werden genannt', () => {
    // Cumming-Beispiel Spieler B: 172,5 cm, 184,7 cm → 93,4 %; ±5,3 cm → 90,8 bis 96,2 %
    const point = maturityAt({ id: 'x', date: '2025-11-05', height: 172.5, weight: 55 }, '2012-05-05', { sex: 'm', parentsConsent: true, motherHeight: 167.6, fatherHeight: 172.7 })!;
    const range = maturityRange(point, 'm');
    expect(range).toMatchObject({ lowPercent: 90.8, highPercent: 96.2, boundaries: [95], errorCm: ADULT_HEIGHT_ERROR_90_CM.m });
    expect(ADULT_HEIGHT_ERROR_90_CM.f).toBe(4.3);
  });

  it('Neuberechnung nach Korrektur ist nachvollziehbar (vorher / jetzt)', () => {
    const corrected = m('b', '2026-10-01', 165, 51, { changes: [{ at: '2026-10-05T09:00:00.000Z', reason: 'Tippfehler', before: { height: 156, weight: 51, sittingHeight: null } }] });
    const result = assessMaturity([normal[0], corrected], born, inputs, today);
    const before = maturityAt({ ...corrected, height: 156 }, born, inputs)!;
    expect(result.recalculation).toBe(
      `Die Messung vom 01.10.2026 wurde am 05.10.2026 korrigiert (Grund: Tippfehler). Neu berechnet: vorher ${percentText(before.percent)}, jetzt ${percentText(result.latest!.percent)}.`,
    );
  });
});
