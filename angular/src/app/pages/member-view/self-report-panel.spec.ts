import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { type ConsentStatus, playerFromDoc } from '../../core/player/player';
import { ProfileService } from '../../core/profile/profile.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { SelfReportPanel } from './self-report-panel';

/** „Wie anstrengend war das heute?“ (SCRUM-138) mit fester Uhr: Mittwoch, 04.11.2026, 10:00 Uhr. */
describe('SelfReportPanel: Anstrengung und Befinden nach dem Termin', () => {
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T10:00:00+01:00'));
  });
  afterEach(() => vi.useRealTimers());

  async function render(role: Role, consent: ConsentStatus = 'granted', mutate?: (firebase: FakeFirebase) => void) {
    const firebase = new FakeFirebase();
    const player = { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: consent };
    firebase.players.players.set('p1', player);
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Dienstag', date: '2026-11-03', exertion: 4, startTime: '18:00', durationMinutes: 90 });
    firebase.events.events.set('e2', { type: 'Training', title: 'Training Montag', date: '2026-11-02', exertion: 4, startTime: '18:00', durationMinutes: 90 });
    firebase.events.events.set('e3', { type: 'Training', title: 'Training gefehlt', date: '2026-11-03', exertion: 4, startTime: '17:00', durationMinutes: 60 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
    firebase.ratings.ratings.set('e2', new Map([['p1', { attendance: 'present', playerId: 'p1' }]]));
    firebase.ratings.ratings.set('e3', new Map([['p1', { attendance: 'absent', playerId: 'p1' }]]));
    mutate?.(firebase);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(role === 'player' || role === 'parent' ? 'p1' : null);
    TestBed.inject(ProfileService).start('p1');
    TestBed.inject(RecordsStateService).start('p1');
    TestBed.inject(SelfReportsService).start('p1');
    const fixture = TestBed.createComponent(SelfReportPanel);
    fixture.componentRef.setInput('player', playerFromDoc('p1', player));
    const root = fixture.nativeElement as HTMLElement;
    await vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      if (role === 'player' || role === 'parent') expect(root.querySelector('#sr-week')).not.toBeNull();
    });
    return { fixture, root, firebase };
  }

  it('Spieler: nur der gestrige Termin mit Teilnahme ist offen; Anstrengung und Befinden werden gespeichert', async () => {
    const { fixture, root, firebase } = await render('player');
    const forms = root.querySelectorAll('form.sr-form');
    expect(forms).toHaveLength(1);
    expect(text(root.querySelector('.sr-head'))).toContain('Training Dienstag');
    expect(text(root)).toContain('Offen bis Mittwoch, 04.11. um 24 Uhr');
    expect(text(root)).toContain('Sie sehen nur du, dein Trainerteam und ggf. die medizinische Betreuung. Die Fragen zum Befinden sind freiwillig.');
    expect([...root.querySelectorAll('legend + label .sr-label, fieldset .sr-label')].map(text)).toEqual(['Müdigkeit', 'Schlafqualität', 'Muskelkater', 'Stress']);
    const select = (name: string, value: string) => {
      const element = root.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
      element.value = value;
    };
    select('exertion', '7');
    select('fatigue', '3');
    select('stress', '6');
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(firebase.selfReports.docs.get('p1/wellness')?.get('e1')).toBeDefined());
    expect(firebase.selfReports.docs.get('p1/selfReports')?.get('e1')).toMatchObject({ playerId: 'p1', eventId: 'e1', date: '2026-11-03', exertion: 7, by: 'player' });
    expect(firebase.selfReports.docs.get('p1/wellness')?.get('e1')).toMatchObject({ fatigue: 3, sleep: null, soreness: null, stress: 6, by: 'player' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(root.querySelector('.sr-done'))).toBe('Gespeichert');
    });
    // Belastung der Woche rechnet mit dem Spielerwert: Montag 90 × 4 + Dienstag 90 × 7.
    expect(text(root.querySelector('.sr-week'))).toContain('990');
  });

  it('Befinden übersprungen: nur die Anstrengung wird gespeichert', async () => {
    const { root, firebase } = await render('player');
    root.querySelector<HTMLSelectElement>('select[name="exertion"]')!.value = '2';
    root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(firebase.selfReports.docs.get('p1/selfReports')?.get('e1')).toMatchObject({ exertion: 2 }));
    expect(firebase.selfReports.docs.get('p1/wellness')).toBeUndefined();
  });

  it('ohne dokumentierte Einwilligung: keine Befindensfragen, Anstrengung geht', async () => {
    for (const consent of ['pending', 'revoked'] as const) {
      TestBed.resetTestingModule();
      const { root, firebase } = await render('player', consent);
      expect(root.querySelector('fieldset')).toBeNull();
      expect(text(root)).not.toContain('Befinden sind freiwillig');
      root.querySelector<HTMLSelectElement>('select[name="exertion"]')!.value = '5';
      root.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await vi.waitFor(() => expect(firebase.selfReports.docs.get('p1/selfReports')?.get('e1')).toMatchObject({ exertion: 5 }));
      expect(firebase.calls).not.toContain('saveSelfReport:p1:wellness:e1');
    }
  });

  it('Befinden nicht lesbar (z. B. Regeln): keine Befindensfragen', async () => {
    const { root } = await render('player', 'granted', (firebase) => firebase.selfReports.watchErrors.set('wellness', { code: 'permission-denied' }));
    expect(root.querySelector('form.sr-form')).not.toBeNull();
    expect(root.querySelector('fieldset')).toBeNull();
  });

  it('Eltern antworten für ihr Kind; die eigene Angabe ist vorausgewählt', async () => {
    const { root } = await render('parent', 'granted', (firebase) => firebase.selfReports.set('p1', 'selfReports', 'e1', { exertion: 8, date: '2026-11-03', updatedAt: new Date() }));
    expect(text(root.querySelector('.sr-form .sr-label'))).toBe('Anstrengung (für Jonas Keller)');
    expect(root.querySelector<HTMLSelectElement>('select[name="exertion"]')!.value).toBe('8');
    expect(text(root.querySelector('.sr-done'))).toBe('Beantwortet');
  });

  it('nach Ende des Folgetags ist die Frage weg', async () => {
    vi.setSystemTime(new Date('2026-11-05T00:00:00+01:00'));
    const { root } = await render('player');
    expect(root.querySelector('form.sr-form')).toBeNull();
  });

  it('Trainer, Medizin und Scout sehen hier nichts', async () => {
    for (const role of ['trainer', 'physio', 'scout'] as const) {
      TestBed.resetTestingModule();
      const { root } = await render(role);
      expect(root.querySelector('.sr')).toBeNull();
    }
  });
});
