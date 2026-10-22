import { type TeamEvent } from '../events/event';
import { countedPoints, countsPoints, normalizePoints, pointsHistory, totalPoints } from './points';

function event(id: string, type: 'Training' | 'Spiel', date: string, pointsEnabled?: boolean): TeamEvent {
  return {
    id, type, title: id, date, exertion: 5, intensity: 2, location: '', trainingFocus: '', opponent: '', goalsFor: null, goalsAgainst: null,
    matchDuration: type === 'Spiel' ? 70 : null, startTime: null, durationMinutes: null, locationCoords: null, notes: '',
    ...(pointsEnabled === undefined ? {} : { pointsEnabled }),
  };
}

describe('Trainingspunkte (Logik)', () => {
  it('normalisiert: nur ganze Zahlen ab 0, leer/ungültig/negativ = 0, keine Obergrenze', () => {
    expect(normalizePoints(5)).toBe(5);
    expect(normalizePoints('12')).toBe(12);
    expect(normalizePoints('')).toBe(0);
    expect(normalizePoints('   ')).toBe(0);
    expect(normalizePoints(null)).toBe(0);
    expect(normalizePoints(undefined)).toBe(0);
    expect(normalizePoints('abc')).toBe(0);
    expect(normalizePoints(-3)).toBe(0);
    expect(normalizePoints(2.6)).toBe(3);
    expect(normalizePoints(250000)).toBe(250000);
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

  it('ungültige gespeicherte Werte werden beim Zählen zu 0', () => {
    expect(totalPoints([{ event: event('t1', 'Training', '2026-10-01'), points: -5 }, { event: event('t2', 'Training', '2026-10-02'), points: Number.NaN }])).toBe(0);
  });
});
