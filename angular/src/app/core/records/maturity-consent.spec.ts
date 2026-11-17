import type { Measurement } from './measurement';
import {
  EMPTY_MATURITY_INPUTS,
  docFromMaturityInputs,
  hasMaturityData,
  maturityHistory,
  maturityInputsForCalculation,
  maturityInputsFromDoc,
  maturityStopped,
  withParentsConsentRecord,
  type MaturityInputs,
} from './maturity';

const measurement = (date: string, height: number | null, weight: number | null, id = date): Measurement => ({ id, date, height, weight });
const inputs = (change: Partial<MaturityInputs> = {}): MaturityInputs => ({ sex: 'm', parentsConsent: true, motherHeight: 167.6, fatherHeight: 172.7, ...change });

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
