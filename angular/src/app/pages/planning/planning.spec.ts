import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { trainerGuard } from '../../core/auth/auth.guard';
import { MORE_GROUPS, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { routes } from '../../app.routes';
import { addMonthsIso, isoWeekday } from '../../core/planning/planning';
import { formatDate, todayIso } from '../../core/shared/dates';
import { Planning } from './planning';

describe('Planung (Seite)', () => {
  let firebase: FakeFirebase;

  async function render() {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Planning], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Planning);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const field = (fixture: { nativeElement: unknown }, name: string) => root(fixture).querySelector(`[name="${name}"]`) as HTMLInputElement;
  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('zeigt eine leere Planung und legt eine Serie über das Formular an', async () => {
    const fixture = await render();
    expect(root(fixture).textContent).toContain('Noch keine Serie angelegt.');
    (root(fixture).querySelector('.head button') as HTMLButtonElement).click();
    await fixture.whenStable();

    type(field(fixture, 'startTime'), '17:30');
    const end = addMonthsIso(todayIso(), 3);
    type(field(fixture, 'endDate'), end);
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    await vi.waitFor(() => expect(Object.keys(firebase.planning.series)).toHaveLength(1));
    await fixture.whenStable();
    const row = root(fixture).querySelector('.list .what')?.textContent ?? '';
    expect(row).toContain('17:30 Uhr');
    expect(row).toContain('Training');
    expect(row).toContain(formatDate(end));
  });

  it('zeigt vor dem Speichern die Vorschau und legt danach die Trainings an', async () => {
    const fixture = await render();
    (root(fixture).querySelector('.head button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root(fixture).querySelector('[data-testid="series-preview"]')).toBeNull();
    // Heute plus 8 Wochen, gleicher Wochentag wie heute: genau 9 Termine (heute eingeschlossen).
    const today = todayIso();
    type(field(fixture, 'startTime'), '17:30');
    type(field(fixture, 'endDate'), new Date(Date.parse(`${today}T00:00:00Z`) + 56 * 86_400_000).toISOString().slice(0, 10));
    await fixture.whenStable();
    expect(root(fixture).querySelector('[data-testid="series-preview"]')?.textContent).toContain('9 Trainings werden angelegt.');

    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    await vi.waitFor(() => expect(firebase.events.events.size).toBe(9));
    await fixture.whenStable();
    expect(root(fixture).querySelector('.run')?.textContent).toContain('9 Trainings wurden angelegt.');
  });

  it('zeigt Prüfmeldungen und speichert dann nichts', async () => {
    const fixture = await render();
    (root(fixture).querySelector('.head button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root(fixture).querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const messages = [...root(fixture).querySelectorAll('.error')].map((el) => el.textContent);
    expect(messages.some((text) => text?.includes('Startzeit'))).toBe(true);
    expect(messages.some((text) => text?.includes('Enddatum'))).toBe(true);
    expect(firebase.calls).not.toContain('saveSeries');
  });

  it('löscht eine Serie nach Bestätigung', async () => {
    const fixture = await render();
    firebase.planning.doc = {
      series: { s1: { weekday: 2, startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', exertion: 2, startDate: '2026-01-05', endDate: '2026-06-30' } },
    };
    firebase.planning.emit();
    await fixture.whenStable();
    (root(fixture).querySelector('.list button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root(fixture).querySelector('tk-series-dialog .delete') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(firebase.calls).not.toContain('deleteSeries');
    const confirm = [...root(fixture).querySelectorAll('.confirm-actions button')].find((b) => b.textContent?.includes('Endgültig')) as HTMLButtonElement;
    confirm.click();
    await vi.waitFor(() => expect(firebase.calls).toContain('deleteSeries'));
    expect(firebase.planning.series).toEqual({});
  });
  it('nennt beim Bearbeiten und Löschen die Folgen für die künftigen Termine (SCRUM-147)', async () => {
    const fixture = await render();
    const day = (offset: number) => new Date(Date.parse(`${todayIso()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const dates = [day(7), day(14), day(21)];
    firebase.planning.doc = {
      series: { s1: { weekday: isoWeekday(day(7)), startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: day(-30), endDate: day(21) } },
    };
    for (const date of dates) firebase.events.events.set(`serie-s1-${date}`, { type: 'Training', title: 'Training', date, intensity: 2, location: '', trainingFocus: 'Umschalten', startTime: '17:30', durationMinutes: 90, locationCoords: null });
    firebase.ratings.ratings.set(`serie-s1-${dates[1]}`, new Map([['p1', { attendance: 'present' }]]));
    firebase.events.emitEvents();
    firebase.planning.emit();
    await fixture.whenStable();
    (root(fixture).querySelector('.list button') as HTMLButtonElement).click();
    await fixture.whenStable();
    type(field(fixture, 'startTime'), '18:00');
    await vi.waitFor(() => {
      expect(root(fixture).querySelector('[data-testid="series-preview"]')?.textContent).toContain('2 Termine werden angepasst; 1 Termin bleibt, weil er schon bewertet ist.');
    });

    (root(fixture).querySelector('tk-series-dialog .delete') as HTMLButtonElement).click();
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(root(fixture).querySelector('[data-testid="delete-preview"]')?.textContent).toContain('2 Termine werden entfernt; 1 Termin bleibt, weil er schon bewertet ist.');
    });
  });
});

describe('Planung: Pausen (Seite, SCRUM-148)', () => {
  let firebase: FakeFirebase;
  const day = (offset: number) => new Date(Date.parse(`${todayIso()}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

  async function render() {
    firebase = new FakeFirebase();
    await TestBed.configureTestingModule({ imports: [Planning], providers: [...provideFakeFirebase(firebase)] }).compileComponents();
    TestBed.inject(SessionService).role.set('trainer');
    const fixture = TestBed.createComponent(Planning);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const field = (fixture: { nativeElement: unknown }, name: string) => root(fixture).querySelector(`tk-break-dialog [name="${name}"]`) as HTMLInputElement;
  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const addBreakButton = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll('.section-head button')].find((b) => b.textContent?.includes('Pause anlegen')) as HTMLButtonElement;

  it('zeigt einen leeren Pausen-Teil, prüft die Eingaben und legt eine Pause an', async () => {
    const fixture = await render();
    expect(root(fixture).textContent).toContain('Noch keine Pause eingetragen.');
    addBreakButton(fixture).click();
    await fixture.whenStable();
    const form = root(fixture).querySelector('tk-break-dialog form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    const messages = [...root(fixture).querySelectorAll('tk-break-dialog .error')].map((el) => el.textContent);
    expect(messages.some((text) => text?.includes('Namen'))).toBe(true);
    expect(messages.some((text) => text?.includes('Bis'))).toBe(true);
    expect(firebase.calls).not.toContain('saveBreak');

    type(field(fixture, 'name'), 'Herbstferien');
    type(field(fixture, 'endDate'), day(-1));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect([...root(fixture).querySelectorAll('tk-break-dialog .error')].some((el) => el.textContent?.includes('nicht vor dem Von-Datum'))).toBe(true);

    type(field(fixture, 'endDate'), day(13));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    await vi.waitFor(() => expect(Object.keys(firebase.planning.breaks)).toHaveLength(1));
    await fixture.whenStable();
    const row = root(fixture).querySelector('[data-testid="break-list"] .what')?.textContent ?? '';
    expect(row).toContain('Herbstferien');
    expect(row).toContain(formatDate(day(13)));
  });

  it('nennt in der Vorschau die wegfallenden Trainings und entfernt sie beim Speichern', async () => {
    const fixture = await render();
    const dates = [day(7), day(14), day(21)];
    firebase.planning.doc = {
      series: { s1: { weekday: isoWeekday(day(7)), startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: day(-30), endDate: day(21) } },
    };
    for (const date of dates) firebase.events.events.set(`serie-s1-${date}`, { type: 'Training', title: 'Training', date, intensity: 2, location: '', trainingFocus: 'Umschalten', startTime: '17:30', durationMinutes: 90, locationCoords: null });
    firebase.events.events.set('spiel', { type: 'Spiel', title: 'Testspiel', date: dates[1], opponent: 'SG' });
    firebase.events.emitEvents();
    firebase.planning.emit();
    await fixture.whenStable();
    addBreakButton(fixture).click();
    await fixture.whenStable();
    type(field(fixture, 'name'), 'Herbstferien');
    type(field(fixture, 'startDate'), day(10));
    type(field(fixture, 'endDate'), day(30));
    await vi.waitFor(() => {
      expect(root(fixture).querySelector('[data-testid="break-preview"]')?.textContent).toBe('In der Pause „Herbstferien“: 2 Trainings fallen weg.');
    });
    (root(fixture).querySelector('tk-break-dialog form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect([...firebase.events.events.keys()].sort()).toEqual([`serie-s1-${dates[0]}`, 'spiel']));
    await fixture.whenStable();
    expect(root(fixture).querySelector('.run')?.textContent).toContain('2 Trainings sind weggefallen.');
  });

  it('löscht eine Pause nach Rückfrage, und die Trainings entstehen wieder', async () => {
    const fixture = await render();
    const date = day(7);
    firebase.planning.doc = {
      series: { s1: { weekday: isoWeekday(date), startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: day(-30), endDate: day(14) } },
    };
    firebase.planning.breaksDoc = { breaks: { b1: { name: 'Sommerpause', startDate: day(1), endDate: day(10) } } };
    firebase.planning.emit();
    firebase.planning.emitBreaks();
    await fixture.whenStable();
    (root(fixture).querySelector('[data-testid="break-list"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root(fixture).querySelector('tk-break-dialog .delete') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(firebase.calls).not.toContain('deleteBreak');
    await vi.waitFor(() => expect(root(fixture).querySelector('[data-testid="delete-break-preview"]')?.textContent).toBe('Pause „Sommerpause“ wird gelöscht: 1 Training entsteht wieder.'));
    const confirm = [...root(fixture).querySelectorAll('.confirm-actions button')].filter((b) => b.textContent?.includes('Endgültig')).at(-1) as HTMLButtonElement; // der Pausen-Dialog steht nach dem Serien-Dialog
    confirm.click();
    await vi.waitFor(() => expect(firebase.calls).toContain('deleteBreak'));
    expect(firebase.planning.breaks).toEqual({});
    await vi.waitFor(() => expect(firebase.events.events.has(`serie-s1-${date}`)).toBe(true));
  });
});

describe('Planung: Zugang nur für Trainer', () => {
  it('liegt in der Navigation (Sidebar und Mehr-Blatt) und hinter dem Trainer-Wächter', () => {
    expect(SIDEBAR_ITEMS.map((item) => item.path)).toContain('/planung');
    expect(MORE_GROUPS.flatMap((group) => group.items).map((item) => item.path)).toContain('/planung');
    const trainerArea = routes.flatMap((route) => route.children ?? []).find((route) => route.canActivateChild?.includes(trainerGuard));
    expect(trainerArea?.children?.some((route) => route.path === 'planung')).toBe(true);
    // Nicht außerhalb des Trainerbereichs doppelt eingetragen.
    expect(routes.flatMap((route) => route.children ?? []).filter((route) => route.path === 'planung')).toHaveLength(0);
  });
});
