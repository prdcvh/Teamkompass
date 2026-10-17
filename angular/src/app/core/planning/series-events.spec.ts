import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { type TeamEvent, draftFromEvent, eventFromDoc, eventStart } from '../events/event';
import { EventsService } from '../events/events.service';
import { SyncService } from '../shell/sync.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { type SeriesDraft, type TrainingSeries, emptySeriesDraft, seriesFromDraft } from './planning';
import { PlanningService } from './planning.service';
import {
  eventFromSeries,
  isSeriesEvent,
  parseSeriesEventId,
  planSeries,
  planText,
  seriesDates,
  seriesEventId,
  skippedFromPlanningDoc,
} from './series-events';

/** Feste Uhr: Mittwoch, 14.10.2026, mittags (UTC), damit „heute“ in jeder Zeitzone dasselbe Datum ist. */
const NOW = new Date('2026-10-14T12:00:00Z');

const series: TrainingSeries = seriesFromDraft(
  { ...emptySeriesDraft('2026-10-20', null), weekday: 2, startTime: '17:30', startDate: '2026-10-20', endDate: '2026-11-10' },
  'sabc',
);
const noSkips = new Map<string, Set<string>>();

describe('Serien-Trainings: Termine', () => {
  it('erzeugt die Termine über einen Monatswechsel', () => {
    expect(seriesDates(series, series.startDate)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10']);
    expect(seriesDates({ weekday: 5, startDate: '2026-01-29', endDate: '2026-03-01' }, '2026-01-29')).toEqual(['2026-01-30', '2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27']);
  });

  it('lässt die Startzeit bei der Zeitumstellung auf 17:30 Ortszeit', () => {
    const sunday = { ...series, weekday: 7, startDate: '2026-10-18', endDate: '2026-11-01' };
    const events = seriesDates(sunday, sunday.startDate).map((date) => eventFromSeries(sunday, date));
    expect(events.map((event) => event.date)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
    expect(events.every((event) => event.startTime === '17:30')).toBe(true);
    // 25.10.2026 endet die Sommerzeit: 17:30 Ortszeit ist davor 15:30 UTC, danach 16:30 UTC.
    expect(events.map((event) => eventStart(event)?.toISOString())).toEqual(['2026-10-18T15:30:00.000Z', '2026-10-25T16:30:00.000Z', '2026-11-01T16:30:00.000Z']);
    const spring = { ...series, weekday: 7, startDate: '2027-03-21', endDate: '2027-03-28' };
    expect(seriesDates(spring, spring.startDate).map((date) => eventStart(eventFromSeries(spring, date))?.toISOString())).toEqual(['2027-03-21T16:30:00.000Z', '2027-03-28T15:30:00.000Z']);
  });

  it('legt nur Termine ab heute an (heute eingeschlossen)', () => {
    const early = { ...series, startDate: '2026-09-29', endDate: '2026-11-03' };
    const plan = planSeries(early, '2026-10-14', new Set(), noSkips);
    expect(plan.create).toEqual(['2026-10-20', '2026-10-27', '2026-11-03']);
    expect(plan.past).toBe(3); // 29.09., 06.10., 13.10.
    expect(planSeries(early, '2026-10-20', new Set(), noSkips).create[0]).toBe('2026-10-20');
    expect(planSeries(early, '2026-11-04', new Set(), noSkips).create).toEqual([]);
  });

  it('lässt vorhandene und von Hand gelöschte Termine aus', () => {
    const existing = new Set([seriesEventId('sabc', '2026-10-27')]);
    const skipped = new Map([['sabc', new Set(['2026-11-03'])], ['andere', new Set(['2026-10-20'])]]);
    const plan = planSeries(series, '2026-10-14', existing, skipped);
    expect(plan).toEqual({ create: ['2026-10-20', '2026-11-10'], existing: 1, deleted: 1, past: 0 });
  });

  it('formuliert die Vorschau', () => {
    expect(planText({ create: ['a', 'b'], existing: 0, deleted: 0, past: 0 })).toBe('2 Trainings werden angelegt.');
    expect(planText({ create: ['a'], existing: 0, deleted: 0, past: 0 })).toBe('1 Training wird angelegt.');
    expect(planText({ create: [], existing: 2, deleted: 1, past: 3 })).toBe(
      'Es werden keine neuen Trainings angelegt. (2 Termine gibt es schon; 1 von Hand gelöschter Termin entsteht nicht neu; 3 Termine liegen vor heute und werden nicht angelegt.)',
    );
  });

  it('erkennt Serien-Event-IDs', () => {
    expect(parseSeriesEventId('serie-sabc-2026-11-03')).toEqual({ seriesId: 'sabc', date: '2026-11-03' });
    expect(parseSeriesEventId('serie-sabc-2026-02-30')).toBeNull();
    expect(isSeriesEvent('e1234')).toBe(false);
  });

  it('liest die Merker nur, wenn sie brauchbar sind', () => {
    const skipped = skippedFromPlanningDoc({ skipped: { a: { '2026-10-20': true, kaputt: true, '2026-10-21': false }, b: 'x', c: [] } });
    expect([...skipped.entries()].map(([id, dates]) => [id, [...dates]])).toEqual([['a', ['2026-10-20']]]);
    expect(skippedFromPlanningDoc(null).size).toBe(0);
  });
});

describe('PlanningService: Serien-Trainings anlegen', () => {
  let firebase: FakeFirebase;
  const base: SeriesDraft = { ...emptySeriesDraft('2026-10-20', null), weekday: 2, startTime: '17:30', title: 'Training', startDate: '2026-10-20', endDate: '2027-04-13' };

  async function setup() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const planning = TestBed.inject(PlanningService);
    planning.start();
    await vi.waitFor(() => expect(planning.load()).toBe('ready'));
    await TestBed.inject(EventsService).whenLoaded();
    return planning;
  }

  const batches = () => firebase.calls.filter((call) => call.startsWith('saveEventsBatch'));
  const done = (planning: PlanningService) => vi.waitFor(() => expect(['done', 'error']).toContain(planning.run().state));

  afterEach(() => vi.useRealTimers());

  it('legt 78 Termine in Stapeln an, nicht einzeln', async () => {
    const planning = await setup();
    expect(planning.preview(base)?.text).toBe('26 Trainings werden angelegt.');
    const long = { ...base, endDate: '2028-04-11' }; // 18 Monate ab dem Start
    expect(planning.saveSeries(long)).toEqual({});
    await done(planning);
    expect(planning.run()).toEqual({ state: 'done', text: '78 Trainings wurden angelegt.' });
    expect(batches()).toEqual(['saveEventsBatch:50', 'saveEventsBatch:28']);
    expect(firebase.calls.filter((call) => call.startsWith('saveEvent:'))).toEqual([]);
    expect(firebase.events.events.size).toBe(78);
    const [id, data] = [...firebase.events.events][0];
    expect(id).toMatch(/^serie-s[0-9a-f]{16}-2026-10-20$/);
    expect(eventFromDoc(id, data)).toMatchObject({ type: 'Training', title: 'Training', date: '2026-10-20', startTime: '17:30', durationMinutes: 90, exertion: 5, intensity: 2 });
  });

  it('legt beim zweiten Speichern nichts doppelt an', async () => {
    const planning = await setup();
    planning.saveSeries(base);
    await done(planning);
    const count = firebase.events.events.size;
    expect(count).toBe(26);
    const [saved] = planning.series();
    await planning.loadProtection(saved.id);
    expect(planning.preview({ ...base, id: saved.id })?.text).toContain('Es werden keine neuen Trainings angelegt. (26 Termine gibt es schon');
    planning.saveSeries({ ...base, id: saved.id });
    await vi.waitFor(() => expect(planning.run().text).toBe('Es gab keine neuen Trainings anzulegen.'));
    expect(firebase.events.events.size).toBe(count);
    expect(batches()).toHaveLength(1);
  });

  it('überschreibt von Hand geänderte Trainings nicht', async () => {
    const planning = await setup();
    planning.saveSeries(base);
    await done(planning);
    const [saved] = planning.series();
    const id = seriesEventId(saved.id, '2026-10-27');
    const events = TestBed.inject(EventsService);
    const moved = events.events().find((event) => event.id === id);
    expect(events.save({ ...draftFromEvent(moved as TeamEvent), notes: 'Platz gesperrt', startTime: '18:30' })).toEqual({});
    await vi.waitFor(() => expect(firebase.events.events.get(id)).toMatchObject({ seriesEdited: true }));
    planning.saveSeries({ ...base, id: saved.id, endDate: '2027-04-20' });
    await vi.waitFor(() => expect(planning.run().text).toBe('1 Training wurde angelegt. 1 Termin blieb unverändert, weil er bewertet oder von Hand geändert wurde.'));
    expect(firebase.events.events.get(id)).toMatchObject({ notes: 'Platz gesperrt', startTime: '18:30' });
  });

  it('legt ein von Hand gelöschtes Training nicht neu an', async () => {
    const planning = await setup();
    planning.saveSeries(base);
    await done(planning);
    const [saved] = planning.series();
    const id = seriesEventId(saved.id, '2026-11-03');
    expect(await TestBed.inject(EventsService).remove(id)).toBe(true);
    expect(firebase.planning.skipped[saved.id]).toEqual({ '2026-11-03': true });
    expect(firebase.events.events.has(id)).toBe(false);
    await planning.loadProtection(saved.id);
    expect(planning.preview({ ...base, id: saved.id })?.text).toContain('1 von Hand gelöschter Termin entsteht nicht neu');
    planning.saveSeries({ ...base, id: saved.id });
    await vi.waitFor(() => expect(planning.run().text).toBe('Es gab keine neuen Trainings anzulegen.'));
    expect(firebase.events.events.has(id)).toBe(false);
  });

  it('merkt sich nichts beim Löschen normaler Events und räumt Merker mit der Serie auf', async () => {
    const planning = await setup();
    firebase.events.events.set('e1', { type: 'Training', title: 'x', date: '2026-10-21' });
    firebase.events.emitEvents();
    expect(await TestBed.inject(EventsService).remove('e1')).toBe(true);
    expect(firebase.calls.some((call) => call.startsWith('markSkipped'))).toBe(false);
    planning.saveSeries(base);
    await done(planning);
    const [saved] = planning.series();
    await TestBed.inject(EventsService).remove(seriesEventId(saved.id, '2026-11-03'));
    planning.deleteSeries(saved.id);
    await vi.waitFor(() => expect(planning.series()).toHaveLength(0));
    expect(firebase.planning.skipped).toEqual({});
    // Die künftigen, unbewerteten Trainings verschwinden mit der Serie (SCRUM-147).
    expect(firebase.events.events.size).toBe(0);
  });

  it('bricht das Löschen ab, wenn der Merker nicht gesetzt werden kann', async () => {
    const planning = await setup();
    planning.saveSeries(base);
    await done(planning);
    const [saved] = planning.series();
    const id = seriesEventId(saved.id, '2026-11-03');
    firebase.planning.skipError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await TestBed.inject(EventsService).remove(id)).toBe(false);
    expect(firebase.events.events.has(id)).toBe(true);
  });

  it('legt bei Startdatum in der Vergangenheit nur Termine ab heute an', async () => {
    const planning = await setup();
    planning.saveSeries({ ...base, startDate: '2026-09-01', endDate: '2026-11-03' });
    await done(planning);
    expect([...firebase.events.events.keys()].map((id) => parseSeriesEventId(id)?.date)).toEqual(['2026-10-20', '2026-10-27', '2026-11-03']);
    expect(planning.preview({ ...base, startDate: '2026-09-01', endDate: '2026-11-03' })?.text).toContain('7 Termine liegen vor heute');
  });

  it('lässt ein Spiel am selben Tag bestehen und legt das Training trotzdem an', async () => {
    const planning = await setup();
    firebase.events.events.set('match1', { type: 'Spiel', title: 'Derby', date: '2026-10-27', opponent: 'SV Nord' });
    firebase.events.emitEvents();
    planning.saveSeries({ ...base, endDate: '2026-11-03' });
    await done(planning);
    expect(firebase.events.events.get('match1')).toEqual({ type: 'Spiel', title: 'Derby', date: '2026-10-27', opponent: 'SV Nord' });
    expect(firebase.events.events.size).toBe(4);
    expect([...firebase.events.events.keys()].filter((id) => isSeriesEvent(id))).toHaveLength(3);
  });

  it('meldet einen Fehler mitten im Stapeln, und erneutes Speichern ergänzt nur das Fehlende', async () => {
    const planning = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.events.failBatchNumber = 2;
    const long = { ...base, endDate: '2028-04-11' };
    planning.saveSeries(long);
    await done(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('Es wurden nur 50 von 78 Terminänderungen übernommen');
    expect(TestBed.inject(SyncService).state()).toBe('error');
    expect(firebase.events.events.size).toBe(50);

    const [saved] = planning.series();
    firebase.events.failBatchNumber = null;
    planning.saveSeries({ ...long, id: saved.id });
    await done(planning);
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    expect(planning.run().text).toBe('28 Trainings wurden angelegt.');
    expect(batches().slice(2)).toEqual(['saveEventsBatch:28']);
    expect(firebase.events.events.size).toBe(78);
  });

  it('legt nichts an, wenn die Serie nicht gespeichert werden konnte', async () => {
    const planning = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.planning.saveError = { code: 'permission-denied' };
    planning.saveSeries(base);
    await vi.waitFor(() => expect(planning.run().state).toBe('error'));
    expect(planning.run().text).toContain('nicht gespeichert');
    expect(batches()).toEqual([]);
  });

  it('legt nichts an, wenn die vorhandenen Events nicht geladen werden können', async () => {
    const planning = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(EventsService).stop();
    firebase.events.watchEventsError = { code: 'unavailable' };
    planning.saveSeries(base);
    await vi.waitFor(() => expect(planning.run().state).toBe('error'));
    expect(planning.run().text).toContain('konnten nicht geladen werden');
    expect(batches()).toEqual([]);
  });
});
