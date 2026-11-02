import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { SelfReportHistory } from './self-report-history';

/** Anstrengung (Trainer/Spieler je Termin) und Befindensverlauf mit Hinweisen (SCRUM-138). */
describe('SelfReportHistory', () => {
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const dates = ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-27', '2026-10-29'];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00+01:00'));
  });
  afterEach(() => vi.useRealTimers());

  async function render(role: Role, compare: boolean, mutate?: (firebase: FakeFirebase) => void) {
    const firebase = new FakeFirebase();
    dates.forEach((date, i) => {
      firebase.events.events.set(`e${i}`, { type: 'Training', title: `Training ${i}`, date, exertion: 4, startTime: '18:00', durationMinutes: 90 });
      // Spieler empfindet 4 von 5 Terminen um 2–3 Stufen härter.
      firebase.selfReports.set('p1', 'selfReports', `e${i}`, { exertion: i === 0 ? 4 : 6 + (i % 2), date, updatedAt: null });
    });
    // Befinden: 6 Antworten mit Summe 21 vor dem 29.10., dann 16.
    ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19', '2026-10-22'].forEach((date, i) => {
      firebase.events.events.set(`w${i}`, { type: 'Training', title: `Alt ${i}`, date, exertion: 5 });
      firebase.selfReports.set('p1', 'wellness', `w${i}`, { date, fatigue: 6, sleep: 5, soreness: 5, stress: 5 });
    });
    firebase.selfReports.set('p1', 'wellness', 'e4', { date: '2026-10-29', fatigue: 4, sleep: 4, soreness: 4, stress: 4 });
    mutate?.(firebase);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(role === 'player' ? 'p1' : null);
    TestBed.inject(SelfReportsService).start('p1');
    const fixture = TestBed.createComponent(SelfReportHistory);
    fixture.componentRef.setInput('compare', compare);
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      expect(root.querySelectorAll('.sr-list li').length).toBeGreaterThan(0);
    });
    return { fixture, root };
  }

  it('Trainer: beide Werte je Termin, Hinweise zu Abweichung und Befinden, Verlauf', async () => {
    const { root } = await render('trainer', true);
    expect([...root.querySelectorAll('.sr-alert')].map(text)).toEqual(['Empfindet das Training deutlich härter als geplant', 'Befinden schlechter als üblich']);
    const first = root.querySelector('.sr-list li')!;
    expect(text(first)).toContain('Training 4');
    expect(text(first.querySelector('.sr-values'))).toBe('Trainer4Spieler6Befinden16');
    expect(first.querySelector('.sr-diff')).not.toBeNull();
    expect(text(root)).toContain('Befinden zuletzt 16 von 28 · eigener Normalwert 21 (letzte 4 Wochen)');
    expect(root.querySelectorAll('.sr-bar')).toHaveLength(7);
    // 11 Termine mit Angaben, 8 sichtbar.
    expect(root.querySelectorAll('.sr-list li')).toHaveLength(8);
    root.querySelector<HTMLButtonElement>('.sr-more')!.click();
  });

  it('Spieler: nur die eigenen Werte, kein Trainerwert und keine Hinweise', async () => {
    const { root } = await render('player', false);
    expect(root.querySelector('.sr-alert')).toBeNull();
    expect(text(root.querySelector('.sr-list li .sr-values'))).toBe('Anstrengung6Befinden16');
    expect(text(root)).not.toContain('Trainer');
  });

  it('Befinden nicht lesbar (Einwilligung widerrufen): nur die Anstrengung', async () => {
    const { root } = await render('physio', true, (firebase) => firebase.selfReports.watchErrors.set('wellness', { code: 'permission-denied' }));
    expect([...root.querySelectorAll('.sr-alert')].map(text)).toEqual(['Empfindet das Training deutlich härter als geplant']);
    expect(root.querySelector('.sr-trend')).toBeNull();
    expect(text(root)).not.toContain('Befinden zuletzt');
    expect([...root.querySelectorAll('dt')].map(text)).not.toContain('Befinden');
  });
});
