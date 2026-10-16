import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { trainerGuard } from '../../core/auth/auth.guard';
import { MORE_GROUPS, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { routes } from '../../app.routes';
import { addMonthsIso } from '../../core/planning/planning';
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
      series: { s1: { weekday: 2, startTime: '17:30', durationMinutes: 90, location: '', locationCoords: null, title: '', trainingFocus: 'Umschalten', intensity: 2, startDate: '2026-01-05', endDate: '2026-06-30' } },
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
