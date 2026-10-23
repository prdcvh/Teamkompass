import { docFromRanking, entriesFor, inPeriod, monthPeriod, rankPlayers, rankingFromDoc, sameRanking, weekPeriod, withoutPoints } from './ranking';

describe('Zeiträume', () => {
  it('Woche geht von Montag bis Sonntag', () => {
    // 2026-10-21 ist ein Mittwoch.
    expect(weekPeriod('2026-10-21')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(weekPeriod('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    // Sonntag gehört noch zur alten Woche.
    expect(weekPeriod('2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(weekPeriod('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('Woche über den Monatswechsel und Jahreswechsel', () => {
    // 2026-10-29 Donnerstag → Woche reicht in den November.
    expect(weekPeriod('2026-10-29')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    // 2027-01-01 ist ein Freitag.
    expect(weekPeriod('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('Monat ist der Kalendermonat, auch Februar im Schaltjahr und Dezember', () => {
    expect(monthPeriod('2026-10-23')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthPeriod('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthPeriod('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthPeriod('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('Monatswechsel: ein Event am letzten bzw. ersten Tag liegt im richtigen Monat', () => {
    const october = monthPeriod('2026-10-15');
    expect(inPeriod('2026-10-31', october)).toBe(true);
    expect(inPeriod('2026-11-01', october)).toBe(false);
    expect(inPeriod('2026-09-30', october)).toBe(false);
    const week = weekPeriod('2026-10-29');
    expect(inPeriod('2026-11-01', week)).toBe(true);
    expect(inPeriod('2026-11-01', october)).toBe(false);
  });
});

describe('rankPlayers', () => {
  it('sortiert nach Punkten, nimmt höchstens fünf Plätze und lässt Spieler ohne Punkte weg', () => {
    const entries = rankPlayers([
      { name: 'F', points: 1 },
      { name: 'A', points: 10 },
      { name: 'B', points: 9 },
      { name: 'C', points: 8 },
      { name: 'D', points: 7 },
      { name: 'E', points: 6 },
      { name: 'Null', points: 0 },
    ]);
    expect(entries.map((entry) => `${entry.rank}:${entry.name}:${entry.points}`)).toEqual(['1:A:10', '2:B:9', '3:C:8', '4:D:7', '5:E:6']);
  });

  it('Gleichstand teilt sich den Platz, der nächste Platz wird übersprungen', () => {
    const entries = rankPlayers([
      { name: 'Ben', points: 10 },
      { name: 'Ali', points: 10 },
      { name: 'Cem', points: 4 },
    ]);
    expect(entries.map((entry) => [entry.rank, entry.name])).toEqual([
      [1, 'Ali'],
      [1, 'Ben'],
      [3, 'Cem'],
    ]);
  });

  it('Gleichstand auf Platz fünf zeigt alle Gleichplatzierten, Platz sechs fällt weg', () => {
    const entries = rankPlayers([
      { name: 'A', points: 9 },
      { name: 'B', points: 8 },
      { name: 'C', points: 7 },
      { name: 'D', points: 6 },
      { name: 'E', points: 5 },
      { name: 'F', points: 5 },
      { name: 'G', points: 4 },
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(entries.at(-1)?.rank).toBe(5);
  });

  it('ohne Punkte gibt es keine Rangliste', () => {
    expect(rankPlayers([])).toEqual([]);
    expect(rankPlayers([{ name: 'A', points: 0 }])).toEqual([]);
  });

  it('withoutPoints entfernt die Punktzahlen', () => {
    expect(withoutPoints([{ rank: 1, name: 'A', points: 3 }])).toEqual([{ rank: 1, name: 'A' }]);
  });
});

describe('Ranglisten-Dokument', () => {
  const ranking = {
    week: { from: '2026-10-19', to: '2026-10-25', entries: [{ rank: 1, name: 'Ali', points: 3 }, { rank: 2, name: 'Ben' }] },
    month: { from: '2026-10-01', to: '2026-10-31', entries: [] },
    updatedAt: '2026-10-23T08:00:00.000Z',
  };

  it('wird hin und zurück gewandelt', () => {
    expect(rankingFromDoc(docFromRanking(ranking))).toEqual(ranking);
  });

  it('unbrauchbare Dokumente ergeben null, kaputte Einträge werden ausgelassen', () => {
    expect(rankingFromDoc(null)).toBeNull();
    expect(rankingFromDoc({ week: 1, month: 2 })).toBeNull();
    const doc = docFromRanking(ranking) as { week: { entries: unknown[] } };
    doc.week.entries.push({ rank: 'x', name: 5 }, null);
    expect(rankingFromDoc(doc)?.week.entries).toHaveLength(2);
  });

  it('entriesFor zeigt veraltete Zeiträume als leer', () => {
    expect(entriesFor(ranking.week, { from: '2026-10-19', to: '2026-10-25' })).toHaveLength(2);
    expect(entriesFor(ranking.week, { from: '2026-10-26', to: '2026-11-01' })).toEqual([]);
    expect(entriesFor(null, { from: '2026-10-26', to: '2026-11-01' })).toEqual([]);
  });

  it('sameRanking ignoriert den Zeitstempel', () => {
    expect(sameRanking(ranking, { ...ranking, updatedAt: 'später' })).toBe(true);
    expect(sameRanking(ranking, { ...ranking, month: { ...ranking.month, entries: [{ rank: 1, name: 'X' }] } })).toBe(false);
    expect(sameRanking(null, ranking)).toBe(false);
  });
});
