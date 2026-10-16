import { type TeamEvent } from '../events/event';
import { breakChangeText, breakCandidates, breakScope, planBreakChange } from './break-change';
import {
  type BreakDraft,
  type PlanningBreak,
  breakFromDoc,
  breakFromDraft,
  breaksFromPlanningDoc,
  docFromBreak,
  draftFromBreak,
  emptyBreakDraft,
  isInBreak,
  validateBreakDraft,
} from './breaks';
import { type TrainingSeries, emptySeriesDraft, seriesFromDraft } from './planning';
import { eventFromSeries, planSeries, planSeriesChange, planText, seriesDates, seriesEventId } from './series-events';

/** Feste Uhr: Mittwoch, 14.10.2026. */
const TODAY = '2026-10-14';

// Dienstags-Serie bis 17.11.: 06.10. und 13.10. liegen vor heute; 20.10., 27.10., 03.11., 10.11., 17.11. sind künftig.
const series: TrainingSeries = seriesFromDraft(
  { ...emptySeriesDraft('2026-10-06', null), weekday: 2, startTime: '17:30', startDate: '2026-10-06', endDate: '2026-11-17' },
  'sabc',
);
const noSkips = new Map<string, Set<string>>();
const events = (): TeamEvent[] => seriesDates(series, series.startDate).map((date) => eventFromSeries(series, date));
const id = (date: string) => seriesEventId('sabc', date);
const pause = (startDate: string, endDate: string, name = 'Herbstferien', key = 'b1'): PlanningBreak => ({ id: key, name, startDate, endDate });
const none = new Set<string>();

describe('Pausen: Prüfungen', () => {
  const draft: BreakDraft = { ...emptyBreakDraft('2026-10-26'), name: 'Herbstferien', endDate: '2026-11-08' };

  it('nimmt eine gültige Pause an', () => {
    expect(validateBreakDraft(draft)).toEqual({});
    expect(validateBreakDraft({ ...draft, endDate: '2026-10-26' })).toEqual({});
  });

  it('verlangt einen Namen und die beiden Daten', () => {
    expect(validateBreakDraft({ ...draft, name: '   ' }).name).toContain('Namen');
    expect(validateBreakDraft({ ...draft, name: 'x'.repeat(200) }).name).toContain('höchstens');
    expect(validateBreakDraft({ ...draft, startDate: '' }).startDate).toContain('Von');
    expect(validateBreakDraft({ ...draft, endDate: '' }).endDate).toContain('Bis');
    expect(validateBreakDraft({ ...draft, endDate: '2026-02-30' }).endDate).toContain('ungültig');
  });

  it('lässt Bis nicht vor Von liegen', () => {
    expect(validateBreakDraft({ ...draft, endDate: '2026-10-25' }).endDate).toBe('Das Bis-Datum darf nicht vor dem Von-Datum liegen.');
  });

  it('wandelt Entwurf, Dokument und Pause ineinander um und liest nur Brauchbares', () => {
    const entry = breakFromDraft({ ...draft, name: '  Herbstferien ' }, 'b1');
    expect(entry).toEqual({ id: 'b1', name: 'Herbstferien', startDate: '2026-10-26', endDate: '2026-11-08' });
    expect(draftFromBreak(entry)).toEqual({ id: 'b1', name: 'Herbstferien', startDate: '2026-10-26', endDate: '2026-11-08' });
    expect(breakFromDoc('b1', docFromBreak(entry))).toEqual(entry);
    const doc = {
      breaks: {
        b2: { name: 'Winterpause', startDate: '2026-12-20', endDate: '2027-01-10' },
        b1: docFromBreak(entry),
        bad1: { name: 'x', startDate: '2026-11-08', endDate: '2026-10-26' },
        bad2: { name: 'x', startDate: 'morgen', endDate: '2026-10-26' },
        bad3: 'kaputt',
        b3: { startDate: '2026-12-01', endDate: '2026-12-02' },
      },
    };
    expect(breaksFromPlanningDoc(doc).map((item) => item.id)).toEqual(['b1', 'b3', 'b2']);
    expect(breaksFromPlanningDoc(doc)[1].name).toBe('Pause');
    expect(breaksFromPlanningDoc(null)).toEqual([]);
    expect(breaksFromPlanningDoc({ breaks: [1] })).toEqual([]);
  });

  it('erkennt Tage in einer Pause (beide Grenzen gehören dazu, Überlappung erlaubt)', () => {
    const breaks = [pause('2026-10-26', '2026-11-08'), pause('2026-11-05', '2026-11-12', 'Kurz', 'b2')];
    expect(['2026-10-25', '2026-10-26', '2026-11-08', '2026-11-12', '2026-11-13'].map((date) => isInBreak(date, breaks))).toEqual([false, true, true, true, false]);
    expect(isInBreak('2026-10-26', [])).toBe(false);
  });
});

describe('Pausen: Serien lassen Pausen aus (feste Uhr 14.10.2026)', () => {
  it('legt an Pausentagen nichts an und nennt es in der Vorschau', () => {
    const plan = planSeries(series, TODAY, new Set(), noSkips, [pause('2026-10-26', '2026-11-08')]);
    expect(plan.create).toEqual(['2026-10-20', '2026-11-10', '2026-11-17']);
    expect(plan.paused).toBe(2);
    expect(planText(plan)).toBe('3 Trainings werden angelegt. (2 Termine liegen vor heute und werden nicht angelegt; 2 Termine fallen in eine Pause und werden nicht angelegt.)');
  });

  it('hält Pausentage auch bei überlappenden Pausen frei', () => {
    const plan = planSeries(series, TODAY, new Set(), noSkips, [pause('2026-10-26', '2026-10-28'), pause('2026-10-27', '2026-11-04', 'Zweite', 'b2')]);
    expect(plan.create).toEqual(['2026-10-20', '2026-11-10', '2026-11-17']);
  });

  it('vergangene Tage in einer Pause zählen nicht als Pause-Termin', () => {
    const plan = planSeries(series, TODAY, new Set(), noSkips, [pause('2026-10-01', '2026-10-14')]);
    expect(plan.paused).toBe(0);
    expect(plan.past).toBe(2);
  });

  it('entfernt beim Speichern der Serie vorhandene unbewertete Termine in der Pause', () => {
    const plan = planSeriesChange('sabc', series, TODAY, events(), none, noSkips, [pause('2026-10-26', '2026-11-08')]);
    expect(plan.remove).toEqual([id('2026-10-27'), id('2026-11-03')]);
    expect(plan.create).toEqual([]);
  });
});

describe('Pausen: Pause ändern (feste Uhr 14.10.2026)', () => {
  const all = [series];
  const plan = (before: PlanningBreak | null, after: PlanningBreak | null, list: readonly TeamEvent[], rated: ReadonlySet<string> = none, others: readonly PlanningBreak[] = []) =>
    planBreakChange(all, TODAY, list, rated, noSkips, [...others, ...(after ? [after] : [])], breakScope(before, after));

  it('neue Pause: künftige Serien-Trainings darin verschwinden, andere nicht', () => {
    const result = plan(null, pause('2026-10-26', '2026-11-08'), events());
    expect(result.remove).toEqual([id('2026-10-27'), id('2026-11-03')]);
    expect(result.create).toEqual([]);
    expect(breakChangeText('In der Pause „Herbstferien“', result)).toBe('In der Pause „Herbstferien“: 2 Trainings fallen weg.');
  });

  it('verlängerte Pause entfernt zusätzlich die Termine im neuen Teil', () => {
    const before = pause('2026-10-26', '2026-11-08');
    const after = pause('2026-10-26', '2026-11-11');
    // Die Termine der ersten Fassung sind schon weg.
    const present = events().filter((event) => event.id !== id('2026-10-27') && event.id !== id('2026-11-03'));
    const result = plan(before, after, present);
    expect(result.remove).toEqual([id('2026-11-10')]);
    expect(result.create).toEqual([]);
  });

  it('gekürzte Pause lässt die Termine wieder entstehen', () => {
    const before = pause('2026-10-26', '2026-11-11');
    const after = pause('2026-10-26', '2026-10-30');
    const present = events().filter((event) => ![id('2026-10-27'), id('2026-11-03'), id('2026-11-10')].includes(event.id));
    const result = plan(before, after, present);
    expect(result.remove).toEqual([]);
    expect(result.create.flatMap((entry) => entry.dates)).toEqual(['2026-11-03', '2026-11-10']);
    expect(breakChangeText('Die Pause wird gekürzt', result)).toBe('Die Pause wird gekürzt: 2 Trainings entstehen wieder.');
  });

  it('gelöschte Pause lässt die Termine wieder entstehen, außer von Hand gelöschte', () => {
    const before = pause('2026-10-26', '2026-11-08');
    const present = events().filter((event) => event.id !== id('2026-10-27') && event.id !== id('2026-11-03'));
    const skipped = new Map([['sabc', new Set(['2026-11-03'])]]);
    const result = planBreakChange(all, TODAY, present, none, skipped, [], breakScope(before, null));
    expect(result.create.flatMap((entry) => entry.dates)).toEqual(['2026-10-27']);
  });

  it('entfernt nie bewertete, von Hand geänderte, vergangene oder einzeln angelegte Events', () => {
    const edited: TeamEvent = { ...eventFromSeries(series, '2026-11-03'), seriesEdited: true };
    const moved = { ...eventFromSeries(series, '2026-10-27'), date: '2026-10-29' };
    const single: TeamEvent = { ...eventFromSeries(series, '2026-10-29'), id: 'e1', type: 'Spiel', title: 'Testspiel' };
    const list = [...events().filter((event) => ![id('2026-11-03'), id('2026-10-27')].includes(event.id)), edited, moved, single];
    const result = plan(null, pause('2026-10-01', '2026-11-30'), list, new Set([id('2026-11-10')]));
    expect(result.remove).toEqual([id('2026-10-20'), id('2026-11-17')]);
    expect(result.keptRated).toBe(1);
    expect(result.keptEdited).toBe(2);
    expect(result.remove).not.toContain('e1');
    expect(result.remove).not.toContain(id('2026-10-06'));
    expect(result.remove).not.toContain(id('2026-10-13'));
    expect(breakChangeText('X', result)).toBe('X: 2 Trainings fallen weg; 1 Termin bleibt, weil er schon bewertet ist; 2 Termine bleiben, weil du sie von Hand geändert hast.');
  });

  it('eine andere, überlappende Pause hält die Tage weiter frei, wenn eine gelöscht wird', () => {
    const other = pause('2026-10-26', '2026-11-04', 'Andere', 'b2');
    const before = pause('2026-10-26', '2026-11-08');
    const present = events().filter((event) => event.id !== id('2026-10-27') && event.id !== id('2026-11-03'));
    const result = planBreakChange(all, TODAY, present, none, noSkips, [other], breakScope(before, null));
    expect(result.create).toEqual([]);
  });

  it('fasst nur Termine im betroffenen Zeitraum an', () => {
    const result = plan(null, pause('2026-11-03', '2026-11-03'), events());
    expect(result.remove).toEqual([id('2026-11-03')]);
    expect(breakCandidates(all, TODAY, events(), breakScope(null, pause('2026-11-03', '2026-11-03')))).toEqual([id('2026-11-03')]);
  });

  it('sagt, wenn sich nichts ändert', () => {
    const result = plan(null, pause('2027-05-01', '2027-05-10'), events());
    expect(breakChangeText('In der Pause „Sommer“', result)).toBe('In der Pause „Sommer“: Es gibt keine Serien-Trainings, die sich dadurch ändern.');
  });

  it('zählt geschützte Termine außerhalb jeder Pause nicht mit (beim Kürzen)', () => {
    const before = pause('2026-10-26', '2026-11-11');
    const after = pause('2026-10-26', '2026-10-30');
    const result = plan(before, after, events(), new Set([id('2026-11-10')]));
    expect(result.keptRated).toBe(0);
  });
});
