import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { addDays } from '../shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { BreakNotice } from '../../ui/break-notice/break-notice';
import { breakNotice } from './breaks';
import { BreaksStore } from './breaks-store';
import { PlanningService } from './planning.service';

/** Feste Uhr: Dienstag, 20.10.2026 (Ortszeit mittags, damit keine Zeitzone den Tag verschiebt). */
const NOW = new Date(2026, 9, 20, 12, 0, 0);
const TODAY = '2026-10-20';

const herbst = { name: 'Herbstferien', startDate: '2026-10-27', endDate: '2026-11-07' };
const winter = { name: 'Winterpause', startDate: '2026-12-20', endDate: '2027-01-10' };

describe('breakNotice (SCRUM-150)', () => {
  it('nennt eine laufende Pause mit ihrem Ende', () => {
    expect(breakNotice([winter], '2026-12-25')).toBe('Winterpause bis 10.01.');
  });

  it('nennt den ersten und den letzten Tag der Pause als laufend', () => {
    expect(breakNotice([winter], '2026-12-20')).toBe('Winterpause bis 10.01.');
    expect(breakNotice([winter], '2027-01-10')).toBe('Winterpause bis 10.01.');
  });

  it('kündigt eine Pause an, die in 14 Tagen beginnt, aber nicht eine in 15 Tagen', () => {
    expect(addDays(TODAY, 14)).toBe('2026-11-03');
    expect(breakNotice([{ ...herbst, startDate: '2026-11-03' }], TODAY)).toBe('Ab 03.11. Herbstferien (bis 07.11.)');
    expect(breakNotice([{ ...herbst, startDate: '2026-11-04' }], TODAY)).toBeNull();
  });

  it('kündigt die Pause von nächster Woche an', () => {
    expect(breakNotice([herbst], TODAY)).toBe('Ab 27.10. Herbstferien (bis 07.11.)');
  });

  it('zeigt am Tag nach dem Ende nichts mehr', () => {
    expect(breakNotice([herbst], '2026-11-07')).toBe('Herbstferien bis 07.11.');
    expect(breakNotice([herbst], '2026-11-08')).toBeNull();
  });

  it('zeigt ohne Pausen oder bei ferner Pause nichts', () => {
    expect(breakNotice([], TODAY)).toBeNull();
    expect(breakNotice([winter], TODAY)).toBeNull();
  });

  it('bevorzugt die laufende vor der kommenden Pause; bei Überlappung zählt das spätere Ende, bei Ankündigungen der frühere Beginn', () => {
    expect(breakNotice([herbst, { name: 'Brückentag', startDate: '2026-10-19', endDate: '2026-10-21' }], TODAY)).toBe('Brückentag bis 21.10.');
    expect(breakNotice([{ name: 'A', startDate: '2026-10-18', endDate: '2026-10-22' }, { name: 'B', startDate: '2026-10-19', endDate: '2026-10-30' }], TODAY)).toBe('B bis 30.10.');
    expect(breakNotice([{ ...winter, startDate: '2026-11-01', endDate: '2026-11-02' }, herbst], TODAY)).toBe('Ab 27.10. Herbstferien (bis 07.11.)');
  });
});

describe('Pausen-Hinweis: Daten und Rollen (SCRUM-150)', () => {
  let firebase: FakeFirebase;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    firebase = new FakeFirebase();
    firebase.planning.breaksDoc = { breaks: { b1: { name: 'Herbstferien', startDate: '2026-10-27', endDate: '2026-11-07' } } };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
  });
  afterEach(() => vi.useRealTimers());

  async function render(role: 'trainer' | 'player') {
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(BreakNotice);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(TestBed.inject(BreaksStore).load()).toBe('ready');
    });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt Spielern den Hinweis, ohne die Planung (Serien) zu lesen', async () => {
    const el = await render('player');
    expect(el.textContent?.trim()).toBe('Ab 27.10. Herbstferien (bis 07.11.)');
    expect(firebase.calls).toContain('watchBreaks');
    expect(firebase.calls).not.toContain('watchPlanning');
  });

  it('zeigt Trainern denselben Hinweis', async () => {
    const el = await render('trainer');
    expect(el.querySelector('[data-testid="break-notice"]')?.textContent).toBe('Ab 27.10. Herbstferien (bis 07.11.)');
  });

  it('zeigt nichts ohne Pausen und nichts, wenn die Pausen nicht gelesen werden dürfen', async () => {
    firebase.planning.breaksDoc = null;
    expect((await render('player')).querySelector('[data-testid="break-notice"]')).toBeNull();
  });

  it('zeigt bei Lesefehler nichts (kein Dialog, keine Meldung)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.planning.breaksWatchError = { code: 'permission-denied' };
    TestBed.inject(SessionService).role.set('player');
    const fixture = TestBed.createComponent(BreakNotice);
    await vi.waitFor(() => expect(TestBed.inject(BreaksStore).load()).toBe('error'));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

  it('der Hinweis wechselt, wenn der Trainer eine Pause ändert, und verschwindet beim Abmelden', async () => {
    const el = await render('trainer');
    firebase.planning.breaksDoc = { breaks: { b1: { name: 'Herbstferien', startDate: '2026-10-19', endDate: '2026-11-07' } } };
    firebase.planning.emitBreaks();
    await vi.waitFor(() => expect(TestBed.inject(BreaksStore).breaks()[0].startDate).toBe('2026-10-19'));
    const fixture = TestBed.createComponent(BreakNotice);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('Herbstferien bis 07.11.');
    expect(el).toBeTruthy();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(TestBed.inject(BreaksStore).breaks()).toEqual([]);
    expect(firebase.planning.breaksWatchers).toBe(0);
  });

  it('die Planung gilt erst als bereit, wenn auch die Pausen gelesen sind', async () => {
    TestBed.inject(SessionService).role.set('trainer');
    const planning = TestBed.inject(PlanningService);
    planning.start();
    await vi.waitFor(() => expect(planning.load()).toBe('ready'));
    expect(planning.breaks().map((entry) => entry.name)).toEqual(['Herbstferien']);
    firebase.planning.breaksWatchError = new Error('x');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    planning.retry();
    await vi.waitFor(() => expect(planning.load()).toBe('error'));
  });
});
