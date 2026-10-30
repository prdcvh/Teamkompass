import { berlinTodayIso, warmupFromDoc, warmupQuoteText, warmupSummary, warmupWeek, weekStartIso, type WarmupEvent } from './warmup';

const training = (date: string, warmup: WarmupEvent['warmup'] = null, extra: Partial<WarmupEvent> = {}): WarmupEvent => ({ type: 'Training', date, warmup, ...extra });

describe('Aufwärmprogramm-Auswertung (SCRUM-178)', () => {
  // 2026-10-26 ist ein Montag, 2026-11-01 der Sonntag danach.
  it('Woche läuft Montag bis Sonntag', () => {
    expect(weekStartIso('2026-10-26')).toBe('2026-10-26');
    expect(weekStartIso('2026-10-28')).toBe('2026-10-26');
    expect(weekStartIso('2026-11-01')).toBe('2026-10-26');
    expect(weekStartIso('2026-11-02')).toBe('2026-11-02');
  });

  it('zählt Trainings der Woche und davon die mit Programm', () => {
    const events = [training('2026-10-27', '11+ Kids'), training('2026-10-29', '11+'), training('2026-10-30')];
    const week = warmupWeek(events, '2026-10-30');
    expect(week).toMatchObject({ start: '2026-10-26', end: '2026-11-01', total: 3, done: 2, hint: false });
    expect(warmupQuoteText(week)).toBe('2 von 3 Trainings');
  });

  it('beachtet die Wochengrenzen (Sonntag zählt zur alten, Montag zur neuen Woche)', () => {
    const events = [training('2026-10-25', '11+ Kids'), training('2026-10-26'), training('2026-11-01', '11+')];
    expect(warmupWeek(events, '2026-11-01')).toMatchObject({ total: 2, done: 1 });
    expect(warmupWeek(events, '2026-11-01', '2026-10-25')).toMatchObject({ total: 1, done: 1 });
  });

  it('zählt nur vergangene oder heutige Trainings', () => {
    const events = [training('2026-10-28'), training('2026-10-29'), training('2026-10-31', '11+')];
    expect(warmupWeek(events, '2026-10-29')).toMatchObject({ total: 2, done: 0 });
  });

  it('zählt keine Spiele und keine abgesagten Termine', () => {
    const events: WarmupEvent[] = [{ type: 'Spiel', date: '2026-10-28' }, training('2026-10-27', null, { cancelled: true }), training('2026-10-29', '11+ Kids')];
    expect(warmupWeek(events, '2026-10-30')).toMatchObject({ total: 1, done: 1, hint: false });
  });

  it('Hinweis nur bei Training ohne Programm; Wochen ohne Training bleiben still', () => {
    expect(warmupWeek([training('2026-10-27')], '2026-10-30').hint).toBe(true);
    expect(warmupWeek([], '2026-10-30')).toMatchObject({ total: 0, done: 0, hint: false });
    expect(warmupWeek([training('2026-10-27', '11+')], '2026-10-30').hint).toBe(false);
    // nur ein künftiges Training: noch nichts zu bemängeln
    expect(warmupWeek([training('2026-11-01')], '2026-10-30').hint).toBe(false);
  });

  it('alte Events ohne oder mit ungültigem Feld gelten als nicht gemacht', () => {
    expect(warmupFromDoc(undefined)).toBeNull();
    expect(warmupFromDoc('irgendwas')).toBeNull();
    expect(warmupFromDoc('11+ Kids')).toBe('11+ Kids');
    expect(warmupWeek([{ type: 'Training', date: '2026-10-27' }], '2026-10-30')).toMatchObject({ total: 1, done: 0 });
  });

  it('fasst laufende und vorige Woche zusammen', () => {
    const summary = warmupSummary([training('2026-10-20'), training('2026-10-27', '11+')], '2026-10-30');
    expect(summary.current).toMatchObject({ total: 1, done: 1, hint: false });
    expect(summary.previous).toMatchObject({ start: '2026-10-19', total: 1, done: 0, hint: true });
  });

  it('ungültige Daten ergeben eine leere Woche', () => {
    expect(warmupWeek([training('kaputt')], '2026-10-30')).toMatchObject({ total: 0, hint: false });
    expect(warmupWeek([], 'kaputt')).toMatchObject({ total: 0, hint: false });
  });

  it('Einzahl: „1 Training“', () => {
    expect(warmupQuoteText({ done: 0, total: 1 })).toBe('0 von 1 Training');
  });

  it('berlinTodayIso nutzt den Berliner Kalendertag', () => {
    expect(berlinTodayIso(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-30'); // 23:30 in Berlin (MEZ nach der Umstellung)
    expect(berlinTodayIso(new Date('2026-10-30T23:30:00Z'))).toBe('2026-10-31'); // 00:30 am Folgetag
    expect(berlinTodayIso(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02'); // Sommerzeit
  });
});
