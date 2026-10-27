import { type TeamEvent } from '../events/event';
import { countedPoints, countsPoints, livePointsSum, normalizePoints, pointsFromDoc, pointsHistory, totalPoints } from './points';

function event(id: string, type: 'Training' | 'Spiel', date: string, pointsEnabled?: boolean): TeamEvent {
  return {
    id, type, title: id, date, exertion: 5, intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null,
    matchDuration: type === 'Spiel' ? 70 : null, startTime: null, durationMinutes: null, locationCoords: null, notes: '',
    ...(pointsEnabled === undefined ? {} : { pointsEnabled }),
  };
}

describe('Trainingspunkte (Logik)', () => {
  it('normalisiert: ganze Zahlen auch negativ, leer/ungültig = 0, keine Obergrenze', () => {
    expect(normalizePoints(5)).toBe(5);
    expect(normalizePoints('12')).toBe(12);
    expect(normalizePoints('')).toBe(0);
    expect(normalizePoints('   ')).toBe(0);
    expect(normalizePoints(null)).toBe(0);
    expect(normalizePoints(undefined)).toBe(0);
    expect(normalizePoints('abc')).toBe(0);
    expect(normalizePoints(-3)).toBe(-3);
    expect(normalizePoints('-2')).toBe(-2);
    expect(normalizePoints(-0.2)).toBe(0);
    expect(Object.is(normalizePoints(-0.2), 0)).toBe(true);
    expect(normalizePoints(2.6)).toBe(3);
    expect(normalizePoints(250000)).toBe(250000);
  });

  it('negative Punkte zählen in Summe und Verlauf mit (SCRUM-213)', () => {
    const entries = [
      { event: event('t1', 'Training', '2026-10-01'), points: 3 },
      { event: event('t2', 'Training', '2026-10-05'), points: -5 },
    ];
    expect(totalPoints(entries)).toBe(-2);
    expect(pointsHistory(entries).map((row) => [row.points, row.total])).toEqual([[3, 3], [-5, -2]]);
  });

  it('Training zählt immer, Spiel nur mit „ja“ (fehlende Angabe = nein)', () => {
    expect(countsPoints(event('t', 'Training', '2026-10-01'))).toBe(true);
    expect(countsPoints(event('s1', 'Spiel', '2026-10-01', true))).toBe(true);
    expect(countsPoints(event('s2', 'Spiel', '2026-10-01', false))).toBe(false);
    expect(countsPoints(event('s3', 'Spiel', '2026-10-01'))).toBe(false);
  });

  it('summiert Trainings und Spiele mit „ja“', () => {
    const entries = [
      { event: event('t1', 'Training', '2026-10-01'), points: 3 },
      { event: event('s1', 'Spiel', '2026-10-03', true), points: 5 },
      { event: event('t2', 'Training', '2026-10-05'), points: 0 },
    ];
    expect(totalPoints(entries)).toBe(8);
    expect(totalPoints([])).toBe(0);
  });

  it('Spiel ohne Punkte zählt nicht, die gespeicherten Punkte bleiben aber erhalten und zählen bei „ja“ wieder', () => {
    const off = { event: event('s1', 'Spiel', '2026-10-03', false), points: 9 };
    const on = { event: event('s1', 'Spiel', '2026-10-03', true), points: 9 };
    const training = { event: event('t1', 'Training', '2026-10-01'), points: 2 };
    expect(countedPoints(off)).toBe(0);
    expect(totalPoints([off, training])).toBe(2);
    expect(pointsHistory([off, training]).map((row) => row.event.id)).toEqual(['t1']);
    expect(off.points).toBe(9); // Eintrag unverändert
    expect(totalPoints([on, training])).toBe(11);
  });

  it('Verlauf: älteste zuerst mit laufender Summe, 0-Punkte-Events bleiben sichtbar', () => {
    const rows = pointsHistory([
      { event: event('t2', 'Training', '2026-10-08'), points: 4 },
      { event: event('t1', 'Training', '2026-10-01'), points: 0 },
      { event: event('s1', 'Spiel', '2026-10-05', true), points: 6 },
    ]);
    expect(rows.map((row) => [row.event.id, row.points, row.total])).toEqual([
      ['t1', 0, 0],
      ['s1', 6, 6],
      ['t2', 4, 10],
    ]);
  });

  it('ungültige gespeicherte Werte werden beim Zählen zu 0, negative zählen mit', () => {
    expect(totalPoints([{ event: event('t1', 'Training', '2026-10-01'), points: -5 }, { event: event('t2', 'Training', '2026-10-02'), points: Number.NaN }])).toBe(-5);
  });

  it('Punkte eines Trainer-Dokuments: Grundwert plus alle Live-Änderungen (SCRUM-216)', () => {
    expect(pointsFromDoc(null)).toBe(0);
    expect(pointsFromDoc({ points: 4 })).toBe(4);
    expect(pointsFromDoc({ live: { a1: 2, b2: -3 } })).toBe(-1);
    expect(pointsFromDoc({ points: 4, live: { a1: 2, b2: -3 } })).toBe(3);
    // Kaputtes zählt 0 statt die Summe zu verderben.
    expect(livePointsSum({ a: 'x', b: Number.NaN, c: 2, d: null })).toBe(2);
    expect(livePointsSum([1, 2])).toBe(0);
    expect(livePointsSum('5')).toBe(0);
  });

  it('dieselbe Live-Änderung zweimal gesendet zählt einmal, zwei Trainer zählen beide (SCRUM-216)', () => {
    // Firestore „merge“ legt jede Änderung unter ihrer Kennung ab: erneutes Senden setzt denselben Schlüssel.
    const merge = (doc: Record<string, unknown>, id: string, delta: number) => ({ ...doc, live: { ...(doc['live'] as object), [id]: delta } });
    let doc: Record<string, unknown> = { points: 1 };
    doc = merge(doc, 'trainerA1', 2);
    doc = merge(doc, 'trainerA1', 2); // erneuter Versuch nach Funkloch
    doc = merge(doc, 'trainerB1', 3); // zweiter Trainer
    expect(pointsFromDoc(doc)).toBe(6);
  });

  it('unbewertete Events stehen nicht im Verlauf, ihre Punkte zählen aber in Summe und laufender Summe (SCRUM-226)', () => {
    const entries = [
      { event: event('t1', 'Training', '2026-10-01'), points: 3, rated: true },
      { event: event('t2', 'Training', '2026-10-05'), points: 2, rated: false },
      { event: event('t3', 'Training', '2026-10-08'), points: 0, rated: false },
      { event: event('t4', 'Training', '2026-10-10'), points: 1, rated: true },
    ];
    expect(totalPoints(entries)).toBe(6);
    expect(pointsHistory(entries).map((row) => [row.event.id, row.points, row.total])).toEqual([['t1', 3, 3], ['t4', 1, 6]]);
  });
});
