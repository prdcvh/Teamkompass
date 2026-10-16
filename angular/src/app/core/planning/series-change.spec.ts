import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { type TeamEvent, draftFromEvent, eventFromDoc } from '../events/event';
import { EventsService } from '../events/events.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { type SeriesDraft, emptySeriesDraft } from './planning';
import { PlanningService } from './planning.service';
import { eventFromSeries, parseSeriesEventId, seriesEventId } from './series-events';

/** Feste Uhr: Mittwoch, 14.10.2026. */
const NOW = new Date('2026-10-14T12:00:00Z');
const TODAY = '2026-10-14';

describe('PlanningService: Serie ändern und löschen', () => {
  let firebase: FakeFirebase;
  const base: SeriesDraft = { ...emptySeriesDraft('2026-10-20', null), weekday: 2, startTime: '17:30', title: 'Training', startDate: '2026-10-06', endDate: '2026-12-29' };
  const log = () => firebase.calls.filter((call) => /^(saveEventsBatch|deleteEventsBatch|findEventsWithRecords)/.test(call));
  const finished = (planning: PlanningService) => vi.waitFor(() => expect(['done', 'error']).toContain(planning.run().state));

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
    planning.saveSeries(base);
    await finished(planning);
    const [saved] = planning.series();
    // Ein vergangenes Training der Serie (06.10. und 13.10. entstehen nicht, weil vor heute) mit altem Inhalt.
    firebase.events.events.set(seriesEventId(saved.id, '2026-10-06'), { ...eventFromSeries(saved, '2026-10-06'), id: seriesEventId(saved.id, '2026-10-06') });
    firebase.events.emitEvents();
    firebase.calls.length = 0;
    planning.run.set({ state: 'idle', text: '' });
    return { planning, saved, events: TestBed.inject(EventsService) };
  }
  const futureIds = () => [...firebase.events.events.keys()].filter((id) => (parseSeriesEventId(id)?.date ?? '') >= TODAY);

  afterEach(() => vi.useRealTimers());

  it('passt alle künftigen Termine in Stapeln an und lässt Vergangenes, Bewertetes und Verlegtes', async () => {
    const { planning, saved, events } = await setup();
    expect(futureIds()).toHaveLength(11);
    firebase.ratings.ratings.set(seriesEventId(saved.id, '2026-10-27'), new Map([['p1', { attendance: 'present' }]]));
    firebase.ratings.privateNotes.set(seriesEventId(saved.id, '2026-11-03'), new Map([['p1', { playerId: 'p1', note: 'x' }]]));
    const movedId = seriesEventId(saved.id, '2026-11-10');
    const moved = events.events().find((event) => event.id === movedId) as TeamEvent;
    events.save({ ...draftFromEvent(moved), date: '2026-11-12' });
    await vi.waitFor(() => expect(firebase.events.events.get(movedId)).toMatchObject({ date: '2026-11-12', seriesEdited: true }));
    firebase.calls.length = 0;

    await planning.loadProtection(saved.id);
    firebase.calls.length = 0;
    const preview = planning.preview({ ...base, id: saved.id, startTime: '18:15', durationMinutes: '60', location: 'Kunstrasen' });
    expect(preview?.text).toBe('8 Termine werden angepasst; 2 Termine bleiben, weil sie schon bewertet sind; 1 Termin bleibt, weil du ihn von Hand geändert hast. (2 Termine liegen vor heute und werden nicht angelegt.)');

    planning.saveSeries({ ...base, id: saved.id, startTime: '18:15', durationMinutes: '60', location: 'Kunstrasen' });
    await finished(planning);
    expect(planning.run()).toEqual({
      state: 'done',
      text: '8 Termine wurden angepasst. 3 Termine blieben unverändert, weil sie bewertet oder von Hand geändert wurden.',
    });
    expect(log()).toEqual(['findEventsWithRecords:10', 'saveEventsBatch:8']);
    const doc = (date: string) => firebase.events.events.get(seriesEventId(saved.id, date));
    expect(doc('2026-10-20')).toMatchObject({ startTime: '18:15', durationMinutes: 60, location: 'Kunstrasen', notes: '' });
    expect(doc('2026-10-27')).toMatchObject({ startTime: '17:30', durationMinutes: 90 });
    expect(doc('2026-11-03')).toMatchObject({ startTime: '17:30' });
    expect(doc('2026-11-10')).toMatchObject({ startTime: '17:30', date: '2026-11-12' });
    expect(doc('2026-10-06')).toMatchObject({ startTime: '17:30' });
  });

  it('markiert Serien-Termine erst bei einer echten Einzeländerung als von Hand geändert', async () => {
    const { saved, events } = await setup();
    const id = seriesEventId(saved.id, '2026-10-20');
    const event = events.events().find((entry) => entry.id === id) as TeamEvent;
    events.save(draftFromEvent(event));
    await vi.waitFor(() => expect(firebase.calls).toContain(`saveEvent:${id}`));
    expect(firebase.events.events.get(id)).not.toHaveProperty('seriesEdited');
    events.save({ ...draftFromEvent(event), location: 'Anderer Platz' });
    await vi.waitFor(() => expect(firebase.events.events.get(id)).toMatchObject({ seriesEdited: true, location: 'Anderer Platz' }));
    expect(eventFromDoc(id, firebase.events.events.get(id) ?? {}).seriesEdited).toBe(true);
    // Ein normales Event bekommt den Merker nie.
    firebase.events.events.set('e1', { type: 'Training', title: 'x', date: '2026-10-21' });
    firebase.events.emitEvents();
    events.save({ ...draftFromEvent(events.events().find((entry) => entry.id === 'e1') as TeamEvent), title: 'y' });
    await vi.waitFor(() => expect(firebase.events.events.get('e1')).toMatchObject({ title: 'y' }));
    expect(firebase.events.events.get('e1')).not.toHaveProperty('seriesEdited');
  });

  it('verkürzt und verlängert die Serie, ohne Vergangenes zu berühren', async () => {
    const { planning, saved } = await setup();
    planning.saveSeries({ ...base, id: saved.id, endDate: '2026-11-03' });
    await finished(planning);
    expect(planning.run().text).toBe('8 Termine wurden entfernt.');
    expect(futureIds()).toHaveLength(3);
    expect(firebase.events.events.has(seriesEventId(saved.id, '2026-10-06'))).toBe(true);
    expect(log()).toEqual(['findEventsWithRecords:11', 'deleteEventsBatch:8']);
    planning.run.set({ state: 'idle', text: '' });
    planning.saveSeries({ ...base, id: saved.id, endDate: '2026-11-17' });
    await vi.waitFor(() => expect(planning.run().text).toBe('2 Trainings wurden angelegt.'));
    expect(futureIds()).toHaveLength(5);
  });

  it('wechselt den Wochentag: alte künftige Termine weg, neue am neuen Tag', async () => {
    const { planning, saved } = await setup();
    planning.saveSeries({ ...base, id: saved.id, weekday: 4, endDate: '2026-11-12' });
    await finished(planning);
    expect(planning.run().text).toBe('5 Trainings wurden angelegt, 11 Termine wurden entfernt.');
    expect(futureIds().map((id) => parseSeriesEventId(id)?.date)).toEqual(['2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12']);
    expect(firebase.events.events.has(seriesEventId(saved.id, '2026-10-06'))).toBe(true);
  });

  it('meldet einen Fehler mitten beim Ändern, und erneutes Speichern bringt alles in Ordnung', async () => {
    const { planning, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.events.failBatchNumber = 3; // Block 1 ging beim Anlegen der Serie, Block 2 klappt, Block 3 bricht ab
    const long = { ...base, id: saved.id, startTime: '18:00', startDate: '2026-10-20', endDate: '2028-04-11' }; // 67 neue + 11 anzupassende Termine
    planning.saveSeries(long);
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toMatch(/^Es wurden nur 50 von 78 Terminänderungen übernommen\. Bitte die Serie erneut speichern/);
    const partial = firebase.events.events.size;
    firebase.events.failBatchNumber = null;
    planning.run.set({ state: 'idle', text: '' });
    planning.saveSeries(long);
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    const startTimes = new Set(futureIds().map((id) => (firebase.events.events.get(id) as { startTime: string }).startTime));
    expect([...startTimes]).toEqual(['18:00']);
    expect(futureIds()).toHaveLength(78);
    expect(partial).toBe(62); // 12 vorhandene + 50 angelegte
  });

  it('ändert nichts, wenn nicht geprüft werden kann, was bewertet ist', async () => {
    const { planning, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.events.findRecordsError = { code: 'unavailable' };
    planning.saveSeries({ ...base, id: saved.id, startTime: '19:00' });
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('nicht geprüft werden, welche Termine schon bewertet sind. Deshalb wurde nichts geändert.');
    expect(log().filter((call) => !call.startsWith('find'))).toEqual([]);
    await planning.loadProtection(saved.id);
    expect(planning.preview({ ...base, id: saved.id })?.text).toContain('nicht geprüft werden');
  });

  it('löscht die Serie samt künftiger, unbewerteter Termine; Bewertetes, Verlegtes und Vergangenes bleibt', async () => {
    const { planning, saved, events } = await setup();
    firebase.ratings.ratings.set(seriesEventId(saved.id, '2026-10-27'), new Map([['p1', { attendance: 'absent' }]]));
    const editedId = seriesEventId(saved.id, '2026-11-03');
    events.save({ ...draftFromEvent(events.events().find((event) => event.id === editedId) as TeamEvent), date: '2026-11-04' });
    await vi.waitFor(() => expect(firebase.events.events.get(editedId)).toMatchObject({ seriesEdited: true }));
    await TestBed.inject(EventsService).remove(seriesEventId(saved.id, '2026-11-10'));
    expect(firebase.planning.skipped[saved.id]).toBeDefined();
    firebase.calls.length = 0;

    await planning.loadProtection(saved.id);
    firebase.calls.length = 0;
    expect(planning.deletePreview(saved.id)).toBe('8 Termine werden entfernt; 1 Termin bleibt, weil er schon bewertet ist; 1 Termin bleibt, weil du ihn von Hand geändert hast.');
    expect(planning.deleteSeries(saved.id)).toBe(true);
    await finished(planning);
    expect(planning.run().state).toBe('done');
    expect(planning.run().text).toBe('Die Serie wurde gelöscht. 8 Termine wurden entfernt. 2 Termine blieben unverändert, weil sie bewertet oder von Hand geändert wurden.');
    expect(planning.series()).toEqual([]);
    expect(firebase.planning.skipped).toEqual({});
    expect([...firebase.events.events.keys()].sort()).toEqual(
      [seriesEventId(saved.id, '2026-10-06'), seriesEventId(saved.id, '2026-10-27'), editedId].sort(),
    );
    expect(log()).toEqual(['findEventsWithRecords:9', 'deleteEventsBatch:8']);
  });

  it('löscht die Serie in Stapeln, und bei einem Fehler bleibt die Serie bestehen und lässt sich erneut löschen', async () => {
    const { planning, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Mehr Termine als in einen Block passen.
    planning.saveSeries({ ...base, id: saved.id, startDate: '2026-10-20', endDate: '2028-04-11' });
    await vi.waitFor(() => expect(futureIds()).toHaveLength(78));
    await finished(planning);
    planning.run.set({ state: 'idle', text: '' });
    firebase.calls.length = 0;
    firebase.events.failDeleteBatchNumber = 2;
    planning.deleteSeries(saved.id);
    await finished(planning);
    expect(planning.run()).toMatchObject({ state: 'error' });
    expect(planning.run().text).toContain('Es wurden nur 50 von 78 Terminänderungen übernommen. Die Serie besteht noch; bitte erneut löschen');
    expect(planning.series()).toHaveLength(1);
    expect(futureIds()).toHaveLength(28);
    firebase.events.failDeleteBatchNumber = null;
    planning.run.set({ state: 'idle', text: '' });
    planning.deleteSeries(saved.id);
    await vi.waitFor(() => expect(planning.series()).toHaveLength(0));
    await finished(planning);
    expect(planning.run().state).toBe('done');
    expect(futureIds()).toEqual([]);
    expect(firebase.events.events.has(seriesEventId(saved.id, '2026-10-06'))).toBe(true);
  });

  it('löscht die Serie nicht, wenn die Prüfung auf Bewertungen scheitert', async () => {
    const { planning, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.events.findRecordsError = { code: 'unavailable' };
    planning.deleteSeries(saved.id);
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('Die Serie wurde nicht gelöscht');
    expect(planning.series()).toHaveLength(1);
    expect(futureIds()).toHaveLength(11);
  });

  it('meldet, wenn die Serie selbst nicht gelöscht werden kann', async () => {
    const { planning, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.planning.saveError = { code: 'permission-denied' };
    planning.deleteSeries(saved.id);
    await finished(planning);
    expect(planning.run().text).toContain('Die künftigen Termine wurden entfernt, aber die Serie konnte nicht gelöscht werden');
    expect(planning.series()).toHaveLength(1);
  });

  it('lässt Spieler und Fremde nichts ändern', async () => {
    const { planning, saved } = await setup();
    TestBed.inject(SessionService).role.set('player');
    expect(planning.deleteSeries(saved.id)).toBe(false);
    expect(planning.saveSeries({ ...base, id: saved.id })).not.toEqual({});
    expect(futureIds()).toHaveLength(11);
  });
});
