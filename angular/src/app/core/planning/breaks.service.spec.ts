import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { type TeamEvent, draftFromEvent } from '../events/event';
import { EventsService } from '../events/events.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { type BreakDraft, emptyBreakDraft } from './breaks';
import { type SeriesDraft, emptySeriesDraft } from './planning';
import { BreaksService } from './breaks.service';
import { PlanningService } from './planning.service';
import { parseSeriesEventId, seriesEventId } from './series-events';

/** Feste Uhr: Mittwoch, 14.10.2026. */
const NOW = new Date('2026-10-14T12:00:00Z');

describe('PlanningService: Pausen (SCRUM-148)', () => {
  let firebase: FakeFirebase;
  // Dienstage vom 06.10. bis 29.12.2026: künftig sind 20.10., 27.10., 03.11., 10.11., 17.11., 24.11., 01.12., 08.12., 15.12., 22.12., 29.12.
  const base: SeriesDraft = { ...emptySeriesDraft('2026-10-20', null), weekday: 2, startTime: '17:30', title: 'Training', startDate: '2026-10-06', endDate: '2026-12-29' };
  const herbst: BreakDraft = { ...emptyBreakDraft('2026-10-26'), name: 'Herbstferien', endDate: '2026-11-08' };
  const finished = (planning: PlanningService) => vi.waitFor(() => expect(['done', 'error']).toContain(planning.run().state));
  const idle = (planning: PlanningService) => planning.run.set({ state: 'idle', text: '' });

  async function setup() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const planning = TestBed.inject(PlanningService);
    const svc = TestBed.inject(BreaksService);
    planning.start();
    await vi.waitFor(() => expect(planning.load()).toBe('ready'));
    const events = TestBed.inject(EventsService);
    await events.whenLoaded();
    planning.saveSeries(base);
    await finished(planning);
    idle(planning);
    return { planning, svc, events, saved: planning.series()[0] };
  }
  const futureDates = (seriesId: string) =>
    [...firebase.events.events.keys()]
      .map((id) => parseSeriesEventId(id))
      .filter((parsed) => parsed !== null && parsed.seriesId === seriesId && parsed.date >= '2026-10-14')
      .map((parsed) => parsed?.date);
  const has = (seriesId: string, date: string) => firebase.events.events.has(seriesEventId(seriesId, date));

  afterEach(() => vi.useRealTimers());

  it('legt eine Pause an und entfernt die Serien-Trainings darin; Spiele, Bewertetes und von Hand Geändertes bleiben', async () => {
    const { planning, svc, events, saved } = await setup();
    expect(futureDates(saved.id)).toHaveLength(11);
    // Ein Spiel in den Ferien (kein Serien-Event), ein bewertetes Training und ein von Hand verlegtes Training.
    firebase.events.events.set('spiel1', { type: 'Spiel', title: 'Testspiel', date: '2026-10-31', opponent: 'SG Test' });
    firebase.events.emitEvents();
    firebase.ratings.ratings.set(seriesEventId(saved.id, '2026-11-03'), new Map([['p1', { attendance: 'present' }]]));
    const editedId = seriesEventId(saved.id, '2026-10-27');
    events.save({ ...draftFromEvent(events.events().find((event) => event.id === editedId) as TeamEvent), location: 'Halle' });
    await vi.waitFor(() => expect(firebase.events.events.get(editedId)).toMatchObject({ seriesEdited: true }));

    await svc.loadBreakProtection(herbst);
    expect(svc.previewBreak(herbst)).toBe('In der Pause „Herbstferien“: 1 Termin bleibt, weil er schon bewertet ist; 1 Termin bleibt, weil du ihn von Hand geändert hast.');
    expect(svc.saveBreak(herbst)).toEqual({});
    await finished(planning);
    expect(planning.run().state).toBe('done');
    expect(planning.breaks()).toHaveLength(1);
    expect(firebase.planning.breaks[planning.breaks()[0].id]).toEqual({ name: 'Herbstferien', startDate: '2026-10-26', endDate: '2026-11-08' });
    expect(has(saved.id, '2026-10-27')).toBe(true);
    expect(has(saved.id, '2026-11-03')).toBe(true);
    expect(firebase.events.events.has('spiel1')).toBe(true);
    expect(has(saved.id, '2026-10-20')).toBe(true);
  });

  it('entfernt die unbewerteten Termine in der Pause und nennt es vorher und nachher', async () => {
    const { planning, svc, saved } = await setup();
    await svc.loadBreakProtection(herbst);
    expect(svc.previewBreak(herbst)).toBe('In der Pause „Herbstferien“: 2 Trainings fallen weg.');
    svc.saveBreak(herbst);
    await finished(planning);
    expect(planning.run().text).toBe('2 Trainings sind weggefallen.');
    expect(has(saved.id, '2026-10-27')).toBe(false);
    expect(has(saved.id, '2026-11-03')).toBe(false);
    expect(futureDates(saved.id)).toHaveLength(9);
  });

  it('verlängern entfernt weitere Termine, kürzen und Löschen lassen sie wieder entstehen', async () => {
    const { planning, svc, saved } = await setup();
    svc.saveBreak(herbst);
    await finished(planning);
    idle(planning);
    const [entry] = planning.breaks();

    svc.saveBreak({ ...herbst, id: entry.id, endDate: '2026-11-15' });
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    expect(planning.run().text).toBe('1 Training ist weggefallen.');
    expect(has(saved.id, '2026-11-10')).toBe(false);
    idle(planning);

    svc.saveBreak({ ...herbst, id: entry.id, endDate: '2026-10-30' });
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    expect(planning.run().text).toBe('2 Trainings wurden wieder angelegt.');
    expect(has(saved.id, '2026-11-03')).toBe(true);
    expect(has(saved.id, '2026-11-10')).toBe(true);
    expect(has(saved.id, '2026-10-27')).toBe(false);
    idle(planning);

    await svc.loadBreakProtection(null, planning.breaks()[0]);
    expect(svc.deleteBreakPreview(entry.id)).toBe('Pause „Herbstferien“ wird gelöscht: 1 Training entsteht wieder.');
    expect(svc.deleteBreak(entry.id)).toBe(true);
    await finished(planning);
    expect(planning.run().text).toBe('Die Pause „Herbstferien“ wurde gelöscht. 1 Training wurde wieder angelegt.');
    expect(planning.breaks()).toEqual([]);
    expect(has(saved.id, '2026-10-27')).toBe(true);
    expect(futureDates(saved.id)).toHaveLength(11);
  });

  it('von Hand gelöschte Serien-Trainings kommen auch nach dem Löschen der Pause nicht zurück', async () => {
    const { planning, svc, events, saved } = await setup();
    await events.remove(seriesEventId(saved.id, '2026-10-27'));
    svc.saveBreak(herbst);
    await finished(planning);
    idle(planning);
    svc.deleteBreak(planning.breaks()[0].id);
    await finished(planning);
    expect(has(saved.id, '2026-10-27')).toBe(false);
    expect(has(saved.id, '2026-11-03')).toBe(true);
  });

  it('eine Serie, die später gespeichert wird, lässt Pausentage aus', async () => {
    const { planning, svc, saved } = await setup();
    svc.saveBreak(herbst);
    await finished(planning);
    idle(planning);
    planning.saveSeries({ ...base, id: saved.id, endDate: '2027-01-12' });
    await finished(planning);
    expect(planning.run().text).toBe('2 Trainings wurden angelegt.');
    expect(has(saved.id, '2026-10-27')).toBe(false);
    expect(has(saved.id, '2026-11-03')).toBe(false);
    idle(planning);
    // Eine neue Serie legt in der Pause gar nichts an.
    planning.saveSeries({ ...base, id: null, weekday: 4, startDate: '2026-10-15', endDate: '2026-11-12' });
    await finished(planning);
    const donnerstag = planning.series().find((entry) => entry.weekday === 4) as { id: string };
    expect(futureDates(donnerstag.id)).toEqual(['2026-10-15', '2026-10-22', '2026-11-12']);
    expect(planning.run().text).toBe('3 Trainings wurden angelegt.');
  });

  it('Pausen wirken auf alle Serien', async () => {
    const { planning, svc, saved } = await setup();
    planning.saveSeries({ ...base, id: null, weekday: 4, startDate: '2026-10-15', endDate: '2026-11-12' });
    await finished(planning);
    idle(planning);
    const second = planning.series().find((entry) => entry.id !== saved.id) as { id: string };
    expect(futureDates(second.id)).toHaveLength(5);
    svc.saveBreak(herbst);
    await finished(planning);
    expect(planning.run().text).toBe('4 Trainings sind weggefallen.');
    expect(futureDates(second.id)).toEqual(['2026-10-15', '2026-10-22', '2026-11-12']);
  });

  it('Überlappende Pausen sind erlaubt: Tage bleiben frei, bis keine Pause sie mehr deckt', async () => {
    const { planning, svc, saved } = await setup();
    svc.saveBreak(herbst);
    await finished(planning);
    idle(planning);
    svc.saveBreak({ ...emptyBreakDraft('2026-11-01'), name: 'Zusatz', endDate: '2026-11-04' });
    await finished(planning);
    idle(planning);
    expect(planning.breaks()).toHaveLength(2);
    const herbstId = planning.breaks().find((entry) => entry.name === 'Herbstferien')?.id as string;
    svc.deleteBreak(herbstId);
    await finished(planning);
    // 27.10. kommt zurück, 03.11. liegt weiter in „Zusatz“.
    expect(has(saved.id, '2026-10-27')).toBe(true);
    expect(has(saved.id, '2026-11-03')).toBe(false);
  });

  it('prüft die Eingaben und speichert dann nichts', () => {
    return setup().then(({ planning, svc }) => {
      expect(svc.saveBreak({ ...herbst, name: '' }).name).toBeDefined();
      expect(svc.saveBreak({ ...herbst, endDate: '2026-10-01' }).endDate).toBeDefined();
      expect(planning.breaks()).toEqual([]);
      expect(firebase.calls).not.toContain('saveBreak');
    });
  });

  it('verlangt Trainer-Rolle und geladene Planung', async () => {
    const { planning, svc } = await setup();
    TestBed.inject(SessionService).role.set('player');
    expect(svc.saveBreak(herbst)).not.toEqual({});
    expect(planning.breaks()).toEqual([]);
    expect(svc.deleteBreak('x')).toBe(false);
  });

  it('ändert nichts, wenn nicht geprüft werden kann, was bewertet ist', async () => {
    const { planning, svc, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.events.findRecordsError = { code: 'unavailable' };
    await svc.loadBreakProtection(herbst);
    expect(svc.previewBreak(herbst)).toContain('nicht geprüft werden');
    svc.saveBreak(herbst);
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('Die Pause ist gespeichert, aber es konnte nicht geprüft werden');
    expect(futureDates(saved.id)).toHaveLength(11);
    // Erneutes Speichern holt es nach.
    firebase.events.findRecordsError = null;
    idle(planning);
    svc.saveBreak({ ...herbst, id: planning.breaks()[0].id });
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    expect(futureDates(saved.id)).toHaveLength(9);
  });

  it('meldet einen Fehler mitten beim Entfernen; die Pause bleibt, erneutes Speichern erledigt den Rest', async () => {
    const { planning, svc, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Mehr Termine als in einen Block passen: Serie über 18 Monate.
    planning.saveSeries({ ...base, id: saved.id, startDate: '2026-10-20', endDate: '2028-04-11' });
    await vi.waitFor(() => expect(futureDates(saved.id)).toHaveLength(78));
    await finished(planning);
    idle(planning);
    firebase.events.failDeleteBatchNumber = 2;
    const long: BreakDraft = { ...emptyBreakDraft('2026-10-20'), name: 'Lang', endDate: '2028-04-11' };
    svc.saveBreak(long);
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('Es wurden nur 50 von 78 Terminänderungen übernommen. Bitte die Pause erneut speichern');
    expect(planning.breaks()).toHaveLength(1);
    expect(futureDates(saved.id)).toHaveLength(28);
    firebase.events.failDeleteBatchNumber = null;
    idle(planning);
    svc.saveBreak({ ...long, id: planning.breaks()[0].id });
    await vi.waitFor(() => expect(planning.run().state).toBe('done'));
    expect(futureDates(saved.id)).toEqual([]);
  });

  it('meldet, wenn die Pause selbst nicht gespeichert werden kann, und ändert keine Termine', async () => {
    const { planning, svc, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.planning.saveError = { code: 'permission-denied' };
    svc.saveBreak(herbst);
    await finished(planning);
    expect(planning.run().text).toBe('Die Pause wurde nicht gespeichert, deshalb wurden keine Termine geändert.');
    expect(futureDates(saved.id)).toHaveLength(11);
  });

  it('löscht die Pause nicht, wenn das Wiederanlegen scheitert', async () => {
    const { planning, svc, saved } = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    svc.saveBreak(herbst);
    await finished(planning);
    idle(planning);
    firebase.events.failBatchNumber = 2; // Block 1 war das Anlegen der Serie
    svc.deleteBreak(planning.breaks()[0].id);
    await finished(planning);
    expect(planning.run().state).toBe('error');
    expect(planning.run().text).toContain('Die Pause besteht noch');
    expect(planning.breaks()).toHaveLength(1);
    expect(has(saved.id, '2026-10-27')).toBe(false);
  });

  it('nennt Pausen auch in der Vorschau der Serie', async () => {
    const { planning, svc } = await setup();
    svc.saveBreak(herbst);
    await finished(planning);
    const fresh = { ...base, id: null, weekday: 4, startDate: '2026-10-15', endDate: '2026-11-12' };
    expect(planning.preview(fresh)?.text).toBe('3 Trainings werden angelegt. (2 Termine fallen in eine Pause und werden nicht angelegt.)');
  });
});
