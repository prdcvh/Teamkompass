import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { MeasurementPlanService } from './measurement-plan.service';

describe('MeasurementPlanService (SCRUM-255)', () => {
  let firebase: FakeFirebase;

  // Feste Uhr: die Status hängen vom heutigen Tag ab.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T12:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  async function setup(role: 'trainer' | 'physio' | 'player' = 'trainer') {
    firebase = new FakeFirebase();
    const base = { positions: ['ZM'], number: 8, birthdate: '2012-05-05', status: 'Fit' };
    firebase.players.players.set('p1', { ...base, name: 'Ali Adler', consentStatus: 'granted' });
    firebase.players.players.set('p2', { ...base, name: 'Ben Bauer', consentStatus: 'granted' });
    firebase.players.players.set('p3', { ...base, name: 'Cem Celik', consentStatus: 'pending' });
    firebase.players.players.set('p4', { ...base, name: 'Dan Dorn', consentStatus: 'revoked' });
    firebase.records.playerRecords.set('p1/measurements', new Map([['m1', { date: '2026-08-01', height: '150', weight: '' }]]));
    firebase.records.playerRecords.set('p3/measurements', new Map([['m3', { date: '2026-08-01', height: '150', weight: '' }]]));
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    if (role === 'player') TestBed.inject(SessionService).playerId.set('p1');
    const squad = TestBed.inject(SquadService);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    return TestBed.inject(MeasurementPlanService);
  }

  const status = (plan: MeasurementPlanService, id: string) => plan.rows().find((row) => row.playerId === id)?.status;

  it('lädt nur Messungen von Spielern mit dokumentierter Einwilligung', async () => {
    const plan = await setup();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    const reads = firebase.calls.filter((call) => call.startsWith('readPlayerRecords:'));
    expect(reads.sort()).toEqual(['readPlayerRecords:p1:measurements', 'readPlayerRecords:p2:measurements']);
    expect(status(plan, 'p1')).toBe('overdue');
    expect(status(plan, 'p2')).toBe('baseline-missing');
    expect(status(plan, 'p3')).toBe('no-consent');
    expect(status(plan, 'p4')).toBe('no-consent');
  });

  it('andere Rollen bekommen weder Abo noch Daten', async () => {
    for (const role of ['physio', 'player'] as const) {
      TestBed.resetTestingModule();
      const plan = await setup(role);
      plan.start();
      expect(plan.load()).toBe('idle');
      expect(firebase.calls).not.toContain('watchPlan');
      expect(firebase.calls.filter((call) => call.startsWith('readPlayerRecords:'))).toEqual([]);
      expect(plan.setPaused('p1', true)).not.toBe('');
      expect(firebase.measurementPlan.plan).toEqual({});
    }
  });

  it('Rhythmus, Termin und Pause bleiben beim erneuten Laden erhalten', async () => {
    const plan = await setup();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    expect(plan.setInterval('p1', 4)).toBe('');
    expect(plan.setDueDate('p2', '2999-01-31')).toBe('');
    expect(plan.setPaused('p2', true)).toBe('');
    await vi.waitFor(() => expect(Object.keys(firebase.measurementPlan.plan).sort()).toEqual(['p1', 'p2']));
    expect(firebase.measurementPlan.plan['p1']).toEqual({ intervalMonths: 4 });
    expect(firebase.measurementPlan.plan['p2']).toMatchObject({ paused: true, dueDate: '2999-01-31' });

    // "Neu laden": Dienst verwerfen und neu starten, die gespeicherten Entscheidungen kommen aus der Datenbank
    plan.stop();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    expect(plan.rows().find((row) => row.playerId === 'p1')).toMatchObject({ intervalMonths: 4, nextDue: '2026-12-01' });
    expect(status(plan, 'p2')).toBe('paused');
    // Pause beenden: heute fällig; Vorschlag/Termin zurück entfernt den Eintrag
    expect(plan.setPaused('p2', false)).toBe('');
    expect(status(plan, 'p2')).toBe('due');
    expect(plan.setDueDate('p2', '')).toBe('');
    expect(plan.setInterval('p1', 3)).toBe('');
    await vi.waitFor(() => expect(firebase.measurementPlan.plan).toEqual({}));
  });

  it('prüft Eingaben: Rhythmus, Vergangenheit, fremde Spieler', async () => {
    const plan = await setup();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    expect(plan.setInterval('p1', 0)).toContain('zwischen');
    expect(plan.setInterval('p1', 7)).toContain('zwischen');
    expect(plan.setInterval('p1', 2.5)).toContain('zwischen');
    expect(plan.setDueDate('p1', '2020-01-01')).toContain('Vergangenheit');
    expect(plan.setDueDate('p1', 'morgen')).toContain('gültiges Datum');
    expect(plan.setPaused('unbekannt', true)).toContain('Kader');
    expect(firebase.calls.filter((call) => call.startsWith('savePlayerPlan:'))).toEqual([]);
  });

  it('eine in der Messrunde gespeicherte Messung rückt nur diesen Spieler weiter', async () => {
    const plan = await setup();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    const before2 = plan.rows().find((row) => row.playerId === 'p2');
    plan.applyMeasurements('p1', [{ id: 'm9', date: '2026-11-16', height: 152, weight: null }]);
    expect(plan.rows().find((row) => row.playerId === 'p1')).toMatchObject({ lastDate: '2026-11-16', nextDue: '2027-02-16', status: 'planned' });
    expect(plan.rows().find((row) => row.playerId === 'p2')).toEqual(before2);
    // Nichts wird dafür geschrieben: der Termin ist abgeleitet.
    expect(firebase.calls.filter((call) => call.startsWith('savePlayerPlan:'))).toEqual([]);
  });

  it('Ladefehler: error und erneut versuchen', async () => {
    const plan = await setup();
    firebase.measurementPlan.watchError = new Error('offline');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('error'));
    firebase.measurementPlan.watchError = null;
    plan.retry();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
  });

  it('Abmelden verwirft Daten', async () => {
    const plan = await setup();
    plan.start();
    await vi.waitFor(() => expect(plan.load()).toBe('ready'));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(plan.load()).toBe('idle');
    expect(plan.rows().filter((row) => row.lastDate)).toEqual([]);
  });
});
