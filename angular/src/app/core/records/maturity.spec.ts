import type { Measurement } from './measurement';
import {
  KHAMIS_ROCHE_COEFFICIENTS,
  type MaturityInputs,
  coefficientsFor,
  decimalAge,
  EMPTY_MATURITY_INPUTS,
  docFromMaturityInputs,
  hasMaturityData,
  maturityAt,
  maturityBand,
  maturityHistory,
  maturityInputsForCalculation,
  maturityInputsFromDoc,
  maturityStopped,
  midParentHeight,
  missingMaturityInputs,
  parseParentHeight,
  percentText,
  predictedAdultHeightCm,
  withParentsConsentRecord,
} from './maturity';

const measurement = (date: string, height: number | null, weight: number | null, id = date): Measurement => ({ id, date, height, weight });
const inputs = (change: Partial<MaturityInputs> = {}): MaturityInputs => ({ sex: 'm', parentsConsent: true, motherHeight: 167.6, fatherHeight: 172.7, ...change });

describe('Reife-Kompass: Khamis-Roche (SCRUM-190)', () => {
  describe('Koeffiziententabelle', () => {
    it('hat für Jungen und Mädchen je 28 Zeilen von 4,0 bis 17,5 Jahren in halben Jahren', () => {
      for (const rows of Object.values(KHAMIS_ROCHE_COEFFICIENTS)) {
        expect(rows).toHaveLength(28);
        rows.forEach((row, index) => expect(row[0]).toBe(4 + index / 2));
      }
    });

    it('enthält die Gewichts-Spalte nach dem Erratum 1995 (nicht die um Faktor 10 zu kleine Fassung)', () => {
      // Stichproben im Anzeigebereich 12–15 Jahre (UW MSK Radiology / calcvita, beide erratum-korrigiert).
      expect(coefficientsFor('m', 12)).toEqual([12.0, -9.3522, 0.68325, -0.020076, 0.60927]);
      expect(coefficientsFor('m', 13.5)).toEqual([13.5, -7.1348, 0.59228, -0.011624, 0.61253]);
      expect(coefficientsFor('m', 15.5)).toEqual([15.5, -4.5092, 0.68548, -0.005863, 0.42687]);
      expect(coefficientsFor('f', 12)).toEqual([12.0, 4.84365, 0.64452, -0.04894, 0.3949]);
      expect(coefficientsFor('f', 14)).toEqual([14.0, 0.32425, 0.85062, -0.025, 0.20235]);
      expect(coefficientsFor('f', 15.5)).toEqual([15.5, -3.10326, 1.01514, -0.01037, 0.05909]);
    });

    it('wählt die Zeile zum nächsten halben Jahr und kennt nichts außerhalb von 4,0–17,5', () => {
      expect(coefficientsFor('m', 13.24)?.[0]).toBe(13);
      expect(coefficientsFor('m', 13.25)?.[0]).toBe(13.5);
      expect(coefficientsFor('m', 13.74)?.[0]).toBe(13.5);
      expect(coefficientsFor('m', 3.7)).toBeNull();
      expect(coefficientsFor('m', 17.8)).toBeNull();
    });
  });

  describe('Beispielrechnung aus der Bio-Banding-Literatur (Cumming et al. 2017, Folien „Sport for Life“)', () => {
    // Zwei Jungen, 13,5 Jahre, 172,5 cm, 55 kg.
    it('Spieler B: Mutter 167,6 cm, Vater 172,7 cm → 184,7 cm und 93,4 %', () => {
      const predicted = predictedAdultHeightCm('m', 13.5, 172.5, 55, (167.6 + 172.7) / 2)!;
      expect(predicted).toBeCloseTo(184.7, 1);
      expect(Math.round((172.5 / predicted) * 1000) / 10).toBe(93.4);
    });

    it('Spieler A: Mutter 175,4 cm, Vater 177,8 cm → 188,5 cm und 91,5 % (Folie rechnet mit gerundeten Zoll-Werten)', () => {
      const predicted = predictedAdultHeightCm('m', 13.5, 172.5, 55, 176.6)!;
      // Ungerundet 188,64 cm / 91,44 %; mit den auf Zoll gerundeten Eingaben der Folie 188,58 cm / 91,47 %.
      expect(Math.abs(predicted - 188.5)).toBeLessThan(0.2);
      expect(Math.abs((172.5 / predicted) * 100 - 91.5)).toBeLessThan(0.1);
    });

    it('die unkorrigierte Gewichts-Spalte (Faktor 10 kleiner) träfe das Beispiel nicht', () => {
      const [, b0, bH, bW, bM] = coefficientsFor('m', 13.5)!;
      const wrong = (b0 + bH * (172.5 / 2.54) + (bW / 10) * (55 / 0.45359237) + bM * ((167.6 + 172.7) / 2 / 2.54)) * 2.54;
      expect(Math.abs(wrong - 184.7)).toBeGreaterThan(2);
    });
  });

  it('liefert plausible Werte für Mädchen (Erwachsenengröße nahe der Mittelelterngröße)', () => {
    const predicted = predictedAdultHeightCm('f', 13, 157, 48, 166)!;
    expect(predicted).toBeGreaterThan(160);
    expect(predicted).toBeLessThan(172);
  });

  it('rechnet das Dezimalalter am Messtag', () => {
    expect(decimalAge('2012-01-01', '2025-07-02')).toBeCloseTo(13.5, 2);
    expect(decimalAge('2012-01-01', '2011-12-31')).toBeNull();
    expect(decimalAge('', '2025-07-02')).toBeNull();
  });

  describe('Reifestand je Messung', () => {
    const birthdate = '2012-01-01';

    it('trifft die Beispielrechnung über Geburtsdatum und Messung', () => {
      const point = maturityAt(measurement('2025-07-02', 172.5, 55), birthdate, inputs())!;
      expect(point.predictedAdultCm).toBeCloseTo(184.7, 1);
      expect(percentText(point.percent)).toBe('93,4 %');
      expect(point.band).toBe('average');
    });

    it('zeigt nur 12- bis 15-Jährige (Dezimalalter ≥ 12 und < 16)', () => {
      expect(maturityAt(measurement('2023-12-31', 150, 40), birthdate, inputs())).toBeNull(); // 11,99 Jahre
      expect(maturityAt(measurement('2024-01-01', 150, 40), birthdate, inputs())).not.toBeNull(); // 12,0
      expect(maturityAt(measurement('2027-12-30', 175, 62), birthdate, inputs())).not.toBeNull(); // 15,99
      expect(maturityAt(measurement('2028-01-02', 175, 62), birthdate, inputs())).toBeNull(); // 16,0
    });

    it('ohne Größe der Eltern, Einverständnis, Geschlecht, Größe oder Gewicht erscheint kein Wert', () => {
      const m = measurement('2025-07-02', 172.5, 55);
      expect(maturityAt(m, birthdate, inputs({ motherHeight: null }))).toBeNull();
      expect(maturityAt(m, birthdate, inputs({ fatherHeight: null }))).toBeNull();
      expect(maturityAt(m, birthdate, inputs({ parentsConsent: false }))).toBeNull();
      expect(maturityAt(m, birthdate, inputs({ sex: null }))).toBeNull();
      expect(maturityAt(measurement('2025-07-02', 172.5, null), birthdate, inputs())).toBeNull();
      expect(maturityAt(measurement('2025-07-02', null, 55), birthdate, inputs())).toBeNull();
      expect(maturityAt(m, '', inputs())).toBeNull();
    });

    it('Verlauf: nur verwertbare Messungen, älteste zuerst', () => {
      const history = maturityHistory(
        [measurement('2026-01-10', 176, 60), measurement('2023-06-01', 145, 36), measurement('2025-01-10', 168, null), measurement('2025-07-02', 172.5, 55)],
        birthdate,
        inputs(),
      );
      expect(history.map((point) => point.date)).toEqual(['2025-07-02', '2026-01-10']);
      expect(history[1].percent).toBeGreaterThan(history[0].percent);
    });
  });

  it('ordnet am angezeigten (gerundeten) Prozentwert ein: < 85 spät, 85–95 im Schnitt, > 95 früh', () => {
    expect(maturityBand(80)).toBe('late');
    expect(maturityBand(84.94)).toBe('late');
    expect(maturityBand(84.96)).toBe('average');
    expect(maturityBand(85)).toBe('average');
    expect(maturityBand(95)).toBe('average');
    expect(maturityBand(95.04)).toBe('average');
    expect(maturityBand(95.06)).toBe('early');
    expect(maturityBand(98)).toBe('early');
  });

  describe('Angaben der Eltern', () => {
    it('Mittelelterngröße nur mit Einverständnis und beiden Größen', () => {
      expect(midParentHeight(inputs())).toBeCloseTo(170.15, 5);
      expect(midParentHeight(inputs({ parentsConsent: false }))).toBeNull();
      expect(midParentHeight(inputs({ motherHeight: null }))).toBeNull();
    });

    it('ohne Häkchen werden die Größen beim Speichern geleert und beim Lesen ignoriert', () => {
      expect(docFromMaturityInputs('p1', inputs({ parentsConsent: false }), '2026-11-03')).toEqual({
        playerId: 'p1',
        sex: 'm',
        parentsConsent: false,
        motherHeight: null,
        fatherHeight: null,
        updatedAt: '2026-11-03',
      });
      expect(maturityInputsFromDoc({ sex: 'f', parentsConsent: false, motherHeight: 170, fatherHeight: 180 })).toMatchObject({
        sex: 'f',
        parentsConsent: false,
        motherHeight: null,
        fatherHeight: null,
      });
      expect(maturityInputsFromDoc({ sex: 'x', parentsConsent: true, motherHeight: '170', fatherHeight: 400 })).toMatchObject({
        sex: null,
        parentsConsent: true,
        motherHeight: null,
        fatherHeight: null,
      });
      expect(maturityInputsFromDoc(null).parentsConsent).toBe(false);
    });

    it('prüft die eingegebene Größe (100–250 cm, Komma erlaubt)', () => {
      expect(parseParentHeight('')).toBeNull();
      expect(parseParentHeight('172,5')).toBe(172.5);
      expect(parseParentHeight('99')).toBeNaN();
      expect(parseParentHeight('abc')).toBeNaN();
    });

    it('sagt, was für einen Wert noch fehlt', () => {
      const ok = [measurement('2025-07-02', 172.5, 55)];
      expect(missingMaturityInputs(inputs(), '2012-01-01', ok)).toEqual([]);
      expect(missingMaturityInputs(inputs({ sex: null, parentsConsent: false }), '2012-01-01', [])).toEqual([
        'Geschlecht für die Berechnung',
        'Einverständnis der Eltern zur Speicherung ihrer Größe',
        'eine Messung mit Größe und Gewicht im Alter von 12 bis 15 Jahren',
      ]);
      expect(missingMaturityInputs(inputs({ fatherHeight: null }), '2012-01-01', ok)).toEqual(['Größe beider Eltern']);
      expect(missingMaturityInputs(inputs(), '', ok)).toEqual(['Geburtsdatum']);
    });
  });
});

describe('Reife-Kompass: Einwilligung, Widerruf und abgeleitete Werte (SCRUM-252)', () => {
  const born = '2012-05-05';
  const series = [measurement('2026-04-01', 160, 47, 'a'), measurement('2026-10-01', 165, 51, 'b')];

  it('Widerruf stoppt jede neue Berechnung, gespeicherte Angaben bleiben unberührt', () => {
    const stored = inputs();
    expect(maturityStopped({ consentStatus: 'revoked' })).toBe(true);
    expect(maturityStopped({ consentStatus: 'pending' })).toBe(false);
    expect(maturityStopped({ consentStatus: 'granted' })).toBe(false);
    expect(maturityHistory(series, born, maturityInputsForCalculation(stored, { consentStatus: 'revoked' }))).toEqual([]);
    expect(maturityHistory(series, born, maturityInputsForCalculation(stored, { consentStatus: 'granted' }))).toHaveLength(2);
    expect(maturityHistory(series, born, maturityInputsForCalculation(stored, { consentStatus: 'pending' }))).toHaveLength(2);
    // Nichts wird gelöscht – nur nicht mehr gerechnet.
    expect(stored.motherHeight).toBe(167.6);
  });

  it('Elternzustimmung fehlt oder ist zurückgenommen: kein Wert, auch wenn Größen im Dokument stehen', () => {
    const doc = { playerId: 'p1', sex: 'm', parentsConsent: false, motherHeight: 168, fatherHeight: 182 };
    expect(maturityHistory(series, born, maturityInputsFromDoc(doc))).toEqual([]);
  });

  it('abgeleitete Werte folgen den Rohdaten: Messung gelöscht/korrigiert oder Elterngröße geändert → neu berechnet', () => {
    const before = maturityHistory(series, born, inputs());
    expect(before).toHaveLength(2);
    // Messung gelöscht → der Punkt verschwindet aus dem Verlauf.
    expect(maturityHistory(series.slice(0, 1), born, inputs()).map((point) => point.date)).toEqual(['2026-04-01']);
    // Messung korrigiert → neuer Wert.
    const corrected = maturityHistory([series[0]!, measurement('2026-10-01', 163, 51, 'b')], born, inputs());
    expect(corrected[1]!.percent).not.toBeCloseTo(before[1]!.percent, 3);
    // Elterngröße korrigiert → neue Erwachsenengröße.
    expect(maturityHistory(series, born, inputs({ fatherHeight: 190 }))[1]!.predictedAdultCm).toBeGreaterThan(before[1]!.predictedAdultCm);
    // Angaben gelöscht → kein Wert.
    expect(maturityHistory(series, born, EMPTY_MATURITY_INPUTS)).toEqual([]);
  });

  it('Nachweis: neues Häkchen trägt Tag und Konto ein, bestehendes bleibt, ohne Häkchen kein Nachweis', () => {
    const author = { uid: 'uid-1', email: 'coach@example.test', today: '2026-11-10' };
    const fresh = withParentsConsentRecord(inputs(), inputs({ parentsConsent: false }), author);
    expect(fresh).toMatchObject({ parentsConsentDate: '2026-11-10', parentsConsentBy: 'coach@example.test', parentsConsentByUid: 'uid-1' });
    const kept = withParentsConsentRecord(inputs({ motherHeight: 170 }), fresh, { ...author, uid: 'uid-2', today: '2026-12-01' });
    expect(kept).toMatchObject({ motherHeight: 170, parentsConsentDate: '2026-11-10', parentsConsentByUid: 'uid-1' });
    const removed = withParentsConsentRecord(inputs({ parentsConsent: false }), fresh, author);
    expect(removed).toMatchObject({ parentsConsentDate: '', parentsConsentBy: '', parentsConsentByUid: '' });
    const removedDoc = docFromMaturityInputs('p1', removed, 'x');
    expect(removedDoc).toMatchObject({ motherHeight: null, fatherHeight: null });
    expect(Object.keys(removedDoc).filter((key) => key.startsWith('parentsConsent') && key !== 'parentsConsent')).toEqual([]);
    expect(docFromMaturityInputs('p1', fresh, 'x')).toMatchObject({ parentsConsentDate: '2026-11-10', parentsConsentByUid: 'uid-1' });
    // Gelesen wird der Nachweis nur mit Häkchen und gültigem Datum.
    expect(maturityInputsFromDoc({ parentsConsent: true, parentsConsentDate: '2026-11-10', parentsConsentByUid: 'u' })).toMatchObject({ parentsConsentDate: '2026-11-10' });
    expect(maturityInputsFromDoc({ parentsConsent: false, parentsConsentDate: '2026-11-10' })).toMatchObject({ parentsConsentDate: '' });
    expect(maturityInputsFromDoc({ parentsConsent: true, parentsConsentDate: 'gestern' })).toMatchObject({ parentsConsentDate: '' });
  });

  it('erkennt, ob noch Angaben gespeichert sind (für die Lösch-Aufgabe)', () => {
    expect(hasMaturityData(EMPTY_MATURITY_INPUTS)).toBe(false);
    expect(hasMaturityData({ ...EMPTY_MATURITY_INPUTS, sex: 'f' })).toBe(true);
    expect(hasMaturityData(inputs())).toBe(true);
  });
});
