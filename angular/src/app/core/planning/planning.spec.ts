import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import {
  type SeriesDraft,
  addMonthsIso,
  countWeekdays,
  emptySeriesDraft,
  isoWeekday,
  seriesFromPlanningDoc,
  validateSeriesDraft,
} from './planning';
import { PlanningService } from './planning.service';

const valid: SeriesDraft = { ...emptySeriesDraft('2026-10-20', null), weekday: 2, startTime: '17:30', endDate: '2027-03-30' };

describe('Planung: Prüfungen', () => {
  it('akzeptiert eine vollständige Serie', () => {
    expect(validateSeriesDraft(valid)).toEqual({});
  });

  it('verlangt Enddatum, Startzeit und Dauer', () => {
    const errors = validateSeriesDraft({ ...valid, endDate: '', startTime: '', durationMinutes: '' });
    expect(errors.endDate).toContain('Enddatum');
    expect(errors.startTime).toContain('Startzeit');
    expect(errors.durationMinutes).toContain('Dauer');
  });

  it('lehnt ein Enddatum vor dem Startdatum ab', () => {
    expect(validateSeriesDraft({ ...valid, endDate: '2026-10-19' }).endDate).toBe('Das Enddatum darf nicht vor dem Startdatum liegen.');
  });

  it('erlaubt höchstens 18 Monate, genau 18 Monate noch', () => {
    expect(validateSeriesDraft({ ...valid, endDate: '2028-04-20' })).toEqual({});
    expect(validateSeriesDraft({ ...valid, endDate: '2028-04-21' }).endDate).toContain('18 Monate');
  });

  it('prüft Uhrzeit und Dauer', () => {
    expect(validateSeriesDraft({ ...valid, startTime: '25:00' }).startTime).toContain('ungültig');
    for (const bad of ['0', '301', '-5', '1.5', 'abc', '90 min']) expect(validateSeriesDraft({ ...valid, durationMinutes: bad }).durationMinutes).toContain('zwischen 1 und 300');
    expect(validateSeriesDraft({ ...valid, durationMinutes: '300' })).toEqual({});
  });

  it('meldet ungültige Daten und Wochentage', () => {
    expect(validateSeriesDraft({ ...valid, startDate: '2026-02-30' }).startDate).toContain('Startdatum');
    expect(validateSeriesDraft({ ...valid, weekday: 9 }).weekday).toContain('Wochentag');
  });

  it('meldet eine Serie, in der der Wochentag gar nicht vorkommt', () => {
    // Dienstag, 20.10.2026 bis Montag, 26.10.2026: kein zweiter Dienstag, aber der erste zählt.
    expect(validateSeriesDraft({ ...valid, startDate: '2026-10-21', endDate: '2026-10-26' }).endDate).toContain('kein Dienstag');
    expect(validateSeriesDraft({ ...valid, startDate: '2026-10-20', endDate: '2026-10-20' })).toEqual({});
  });

  it('begrenzt Titel und Ort', () => {
    const errors = validateSeriesDraft({ ...valid, title: 'x'.repeat(61), location: 'y'.repeat(51) });
    expect(errors.title).toContain('60');
    expect(errors.location).toContain('50');
  });
});

describe('Planung: Datumshilfen', () => {
  it('rechnet Wochentage und Monate', () => {
    expect(isoWeekday('2026-10-20')).toBe(2);
    expect(isoWeekday('2026-10-25')).toBe(7);
    expect(addMonthsIso('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsIso('2026-10-20', 18)).toBe('2028-04-20');
    expect(countWeekdays(2, '2026-10-20', '2026-11-03')).toBe(3);
    expect(countWeekdays(1, '2026-10-20', '2026-10-26')).toBe(1);
    expect(countWeekdays(1, '2026-10-20', '2026-10-25')).toBe(0);
  });
});

describe('Planung: Dokument', () => {
  it('überspringt unbrauchbare Serien und sortiert', () => {
    const base = { durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: '2026-10-20', endDate: '2027-01-01' };
    const doc = {
      series: {
        b: { ...base, weekday: 4, startTime: '18:00' },
        a: { ...base, weekday: 2, startTime: '17:30', locationCoords: { lat: 999, lon: 0, name: 'x' } },
        kaputt: { ...base, weekday: 2, startTime: 'abends' },
        leer: null,
      },
    };
    const series = seriesFromPlanningDoc(doc);
    expect(series.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(series[0].locationCoords).toBeNull();
    expect(seriesFromPlanningDoc(null)).toEqual([]);
    expect(seriesFromPlanningDoc({ series: [1] })).toEqual([]);
  });
});

describe('PlanningService (Speichern und Laden)', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const service = TestBed.inject(PlanningService);
    service.start();
    if (role === 'trainer') await vi.waitFor(() => expect(service.load()).toBe('ready'));
    return service;
  }

  it('speichert eine Serie, lädt sie wieder und ändert sie unter derselben ID', async () => {
    const service = await setup();
    expect(service.series()).toEqual([]);
    expect(service.saveSeries(valid)).toEqual({});
    await vi.waitFor(() => expect(service.series()).toHaveLength(1));
    const [saved] = service.series();
    expect(saved).toMatchObject({ weekday: 2, startTime: '17:30', durationMinutes: 90, endDate: '2027-03-30' });
    expect(Object.keys(firebase.planning.series)).toEqual([saved.id]);
    expect(firebase.planning.series[saved.id]).not.toHaveProperty('id');

    expect(service.saveSeries({ ...valid, id: saved.id, startTime: '18:00', title: ' Tempo ' })).toEqual({});
    await vi.waitFor(() => expect(service.series()[0].startTime).toBe('18:00'));
    expect(service.series()).toHaveLength(1);
    expect(service.series()[0].title).toBe('Tempo');
  });

  it('speichert nichts bei ungültigen Eingaben', async () => {
    const service = await setup();
    expect(service.saveSeries({ ...valid, endDate: '' }).endDate).toBeDefined();
    expect(firebase.calls).not.toContain('saveSeries');
  });

  it('löscht eine Serie, ohne die anderen anzufassen', async () => {
    const service = await setup();
    service.saveSeries(valid);
    service.saveSeries({ ...valid, weekday: 4 });
    await vi.waitFor(() => expect(service.series()).toHaveLength(2));
    expect(service.deleteSeries(service.series()[0].id)).toBe(true);
    await vi.waitFor(() => expect(service.series()).toHaveLength(1));
    expect(service.series()[0].weekday).toBe(4);
  });

  it('meldet einen Speicherfehler verständlich', async () => {
    const service = await setup();
    firebase.planning.saveError = { code: 'permission-denied' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.saveSeries(valid);
    const sync = TestBed.inject((await import('../shell/sync.service')).SyncService);
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.detail()).toContain('Die Serie konnte nicht gespeichert werden.');
  });

  it('liest und schreibt nur als Trainer', async () => {
    const service = await setup('player');
    expect(firebase.planning.watchers).toBe(0);
    expect(service.saveSeries(valid).startDate).toBeDefined();
    expect(service.deleteSeries('x')).toBe(false);
    expect(firebase.calls).not.toContain('saveSeries');
  });

  it('speichert nicht, solange die Planung nicht geladen ist', () => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(PlanningService);
    expect(Object.keys(service.saveSeries(valid))).toHaveLength(1);
    expect(firebase.calls).not.toContain('saveSeries');
  });

  it('verwirft die Daten beim Abmelden und meldet Ladefehler', async () => {
    const service = await setup();
    service.saveSeries(valid);
    await vi.waitFor(() => expect(service.series()).toHaveLength(1));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(service.series()).toEqual([]);
    expect(firebase.planning.watchers).toBe(0);
  });

  it('zeigt einen Ladefehler und erlaubt einen neuen Versuch', async () => {
    firebase = new FakeFirebase();
    firebase.planning.watchError = new Error('x');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(PlanningService);
    service.start();
    await vi.waitFor(() => expect(service.load()).toBe('error'));
    firebase.planning.watchError = null;
    service.retry();
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
  });
});
