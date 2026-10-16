import { type TeamEvent } from '../events/event';
import { type TrainingSeries, emptySeriesDraft, seriesFromDraft } from './planning';
import { changeCandidates, changeText, eventFromSeries, parseSeriesEventId, planSeriesChange, seriesDates, seriesEventId } from './series-events';

/** Feste Uhr: Mittwoch, 14.10.2026 (die Pläne bekommen „heute“ als Text). */
const TODAY = '2026-10-14';

const series: TrainingSeries = seriesFromDraft(
  { ...emptySeriesDraft('2026-10-06', null), weekday: 2, startTime: '17:30', startDate: '2026-10-06', endDate: '2026-11-17' },
  'sabc',
);
const noSkips = new Map<string, Set<string>>();

/** Alle Termine der Serie als Events (auch vergangene), wie sie beim Anlegen entstanden wären. */
function allEvents(of: TrainingSeries = series): TeamEvent[] {
  return seriesDates(of, of.startDate).map((date) => eventFromSeries(of, date));
}
const ids = (dates: string[]) => dates.map((date) => seriesEventId('sabc', date));

describe('Serie ändern: Plan (feste Uhr 14.10.2026)', () => {
  // Termine: 06.10. und 13.10. liegen vor heute; 20.10., 27.10., 03.11., 10.11., 17.11. sind künftig.
  const events = allEvents();

  it('passt künftige Termine an und lässt vergangene unberührt', () => {
    const changed = { ...series, startTime: '18:00', durationMinutes: 60, location: 'Kunstrasen', title: 'Techniktraining', intensity: 3, trainingFocus: 'Umschalten' };
    const plan = planSeriesChange('sabc', changed, TODAY, events, new Set(), noSkips);
    expect(plan.update.map((entry) => entry.id)).toEqual(ids(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17']));
    expect(plan.update[0].changes).toEqual({
      title: 'Techniktraining',
      intensity: 3,
      location: 'Kunstrasen',
      trainingFocus: 'Umschalten',
      startTime: '18:00',
      durationMinutes: 60,
    });
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.past).toBe(2);
  });

  it('schreibt nur geänderte Felder und erkennt, was schon stimmt', () => {
    const plan = planSeriesChange('sabc', { ...series, startTime: '18:00' }, TODAY, events, new Set(), noSkips);
    expect(plan.update[0].changes).toEqual({ startTime: '18:00' });
    expect(planSeriesChange('sabc', series, TODAY, events, new Set(), noSkips)).toMatchObject({ update: [], remove: [], create: [], unchanged: 5 });
  });

  it('lässt bewertete Termine bestehen', () => {
    const rated = new Set(ids(['2026-10-27']));
    const plan = planSeriesChange('sabc', { ...series, startTime: '18:00' }, TODAY, events, rated, noSkips);
    expect(plan.keptRated).toBe(1);
    expect(plan.update.map((entry) => entry.id)).not.toContain(seriesEventId('sabc', '2026-10-27'));
    expect(plan.update).toHaveLength(4);
  });

  it('lässt von Hand geänderte und verlegte Termine bestehen', () => {
    const edited = events.map((event) => (event.id === seriesEventId('sabc', '2026-10-27') ? { ...event, seriesEdited: true as const } : event));
    const moved = edited.map((event) => (event.id === seriesEventId('sabc', '2026-11-03') ? { ...event, date: '2026-11-05' } : event));
    const plan = planSeriesChange('sabc', { ...series, startTime: '18:00' }, TODAY, moved, new Set(), noSkips);
    expect(plan.keptEdited).toBe(2);
    expect(plan.update).toHaveLength(3);
    // Auch beim Löschen der Serie und beim Kürzen bleiben sie.
    expect(planSeriesChange('sabc', null, TODAY, moved, new Set(), noSkips).remove).toHaveLength(3);
    expect(planSeriesChange('sabc', { ...series, endDate: '2026-10-20' }, TODAY, moved, new Set(), noSkips).remove).toHaveLength(2);
  });

  it('entfernt beim Wochentagwechsel die alten künftigen Termine und legt neue an', () => {
    const thursday = { ...series, weekday: 4 };
    const plan = planSeriesChange('sabc', thursday, TODAY, events, new Set(), noSkips);
    expect(plan.remove).toEqual(ids(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17']));
    expect(plan.create).toEqual(['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12']);
    expect(plan.update).toEqual([]);
  });

  it('legt beim Verlängern neue Termine an und lässt die alten, wie sie sind', () => {
    const plan = planSeriesChange('sabc', { ...series, endDate: '2026-12-01' }, TODAY, events, new Set(), noSkips);
    expect(plan.create).toEqual(['2026-11-24', '2026-12-01']);
    expect(plan.unchanged).toBe(5);
    expect(plan.remove).toEqual([]);
  });

  it('entfernt beim Kürzen die Termine nach dem neuen Ende', () => {
    const plan = planSeriesChange('sabc', { ...series, endDate: '2026-11-03' }, TODAY, events, new Set(), noSkips);
    expect(plan.remove).toEqual(ids(['2026-11-10', '2026-11-17']));
    expect(plan.unchanged).toBe(3);
  });

  it('entfernt beim Kürzen auf einen Tag in der Vergangenheit alle künftigen, nie die vergangenen', () => {
    const plan = planSeriesChange('sabc', { ...series, endDate: '2026-10-08' }, TODAY, events, new Set(), noSkips);
    expect(plan.remove).toHaveLength(5);
    expect(plan.remove.every((id) => (parseSeriesEventId(id)?.date ?? '') >= TODAY)).toBe(true);
  });

  it('entfernt beim Verschieben des Starts nach hinten die Termine davor (nur künftige)', () => {
    const plan = planSeriesChange('sabc', { ...series, startDate: '2026-11-03' }, TODAY, events, new Set(), noSkips);
    expect(plan.remove).toEqual(ids(['2026-10-20', '2026-10-27']));
  });

  it('löscht beim Löschen nur künftige, unbewertete Termine', () => {
    const rated = new Set(ids(['2026-11-10']));
    const plan = planSeriesChange('sabc', null, TODAY, events, rated, noSkips);
    expect(plan.remove).toEqual(ids(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-17']));
    expect(plan.keptRated).toBe(1);
    expect(plan.create).toEqual([]);
  });

  it('berücksichtigt den heutigen Tag als künftig und andere Serien nie', () => {
    const today = seriesDates(series, series.startDate).includes(TODAY);
    expect(today).toBe(false);
    const sameDay = { ...series, startDate: '2026-10-07', weekday: 3 }; // Mittwoch, auch heute
    const own = allEvents(sameDay);
    const other = { ...eventFromSeries({ ...sameDay, id: 'andere' }, '2026-10-21'), startTime: '09:00' };
    const plan = planSeriesChange('sabc', null, TODAY, [...own, other], new Set(), noSkips);
    expect(plan.remove).toContain(seriesEventId('sabc', TODAY));
    expect(plan.remove).not.toContain(other.id);
    expect(plan.remove).not.toContain(seriesEventId('sabc', '2026-10-07'));
  });

  it('nennt die Folgen in der Vorschau', () => {
    const rated = new Set(ids(['2026-11-10']));
    const edited = events.map((event) => (event.id === seriesEventId('sabc', '2026-10-27') ? { ...event, seriesEdited: true as const } : event));
    const plan = planSeriesChange('sabc', { ...series, startTime: '18:00', endDate: '2026-11-10' }, TODAY, edited, rated, noSkips);
    expect(changeText(plan)).toBe(
      '2 Termine werden angepasst; 1 Termin wird entfernt; 1 Termin bleibt, weil er schon bewertet ist; 1 Termin bleibt, weil du ihn von Hand geändert hast. (2 Termine liegen vor heute und werden nicht angelegt.)',
    );
    expect(changeText(planSeriesChange('sabc', series, TODAY, events, new Set(), noSkips))).toContain('Es werden keine neuen Trainings angelegt.');
  });

  it('sucht Bewertungen nur bei künftigen, nicht bearbeiteten Terminen der eigenen Serie', () => {
    const edited = events.map((event) => (event.id === seriesEventId('sabc', '2026-10-27') ? { ...event, seriesEdited: true as const } : event));
    expect(changeCandidates('sabc', TODAY, edited)).toEqual(ids(['2026-10-20', '2026-11-03', '2026-11-10', '2026-11-17']));
    expect(changeCandidates('andere', TODAY, edited)).toEqual([]);
  });
});
