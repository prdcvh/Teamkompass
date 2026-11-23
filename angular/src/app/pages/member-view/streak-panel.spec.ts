import { TestBed } from '@angular/core/testing';
import type { Role } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { playerFromCard, playerFromDoc } from '../../core/player/player';
import { ProfileService } from '../../core/profile/profile.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { StreakPanel } from './streak-panel';

/** Serien in der Ansicht von Spieler und Eltern (SCRUM-194) mit fester Uhr: Mittwoch, 11.11.2026, 10:00 Uhr. */
describe('StreakPanel: eigene Serien mit Pause-Schutz', () => {
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T10:00:00+01:00'));
  });
  afterEach(() => vi.useRealTimers());

  const ratingPresent = new Map([['p1', { attendance: 'present', playerId: 'p1' }]]);

  async function render(role: Role, mutate?: (firebase: FakeFirebase) => void, withdrawn = false) {
    const firebase = new FakeFirebase();
    const data = { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' };
    firebase.players.players.set('p1', data);
    // Vier Trainings, alle mit Teilnahme; die Fristen der ersten drei sind abgelaufen.
    for (const [id, date] of [['e1', '2026-11-02'], ['e2', '2026-11-04'], ['e3', '2026-11-06'], ['e4', '2026-11-09']]) {
      firebase.events.events.set(id, { type: 'Training', title: `Training ${id}`, date, exertion: 4, startTime: '18:00', durationMinutes: 90 });
      firebase.ratings.ratings.set(id, ratingPresent);
    }
    // e1, e2 und e4 beantwortet, e3 nicht.
    for (const [id, date] of [['e1', '2026-11-02'], ['e2', '2026-11-04'], ['e4', '2026-11-09']]) {
      firebase.selfReports.docs.set('p1/selfReports', (firebase.selfReports.docs.get('p1/selfReports') ?? new Map()).set(id, { playerId: 'p1', eventId: id, date, exertion: 5 }));
    }
    mutate?.(firebase);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set('p1');
    TestBed.inject(ProfileService).start('p1');
    TestBed.inject(RecordsStateService).start('p1');
    TestBed.inject(SelfReportsService).start('p1');
    const fixture = TestBed.createComponent(StreakPanel);
    fixture.componentRef.setInput('player', withdrawn ? playerFromCard('p1', data) : playerFromDoc('p1', data));
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, firebase };
  }

  async function settle(fixture: Awaited<ReturnType<typeof render>>['fixture'], root: HTMLElement, expected: () => boolean) {
    await vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      expect(expected()).toBe(true);
    });
    return root;
  }

  it('ohne Pause reißt der verpasste Termin die Serie: nur der letzte zählt', async () => {
    const { fixture, root } = await render('player');
    await settle(fixture, root, () => root.querySelector('[data-testid="check-in-streak"]') !== null);
    expect(text(root.querySelector('[data-testid="check-in-streak"] .count'))).toBe('1');
    expect(root.querySelector('[data-testid="streak-pause"]')).toBeNull();
  });

  it('eine Pause über den verpassten Termin schützt die Serie (3 in Folge)', async () => {
    const { fixture, root } = await render('player', (firebase) => {
      firebase.planning.breaksDoc = { breaks: { b1: { name: 'Herbstferien', startDate: '2026-11-05', endDate: '2026-11-08' } } };
    });
    await settle(fixture, root, () => text(root.querySelector('[data-testid="check-in-streak"] .count')) === '3');
  });

  it('eine eingetragene Verletzung schützt die Serie und die Anzeige sagt, dass sie ruht', async () => {
    const { fixture, root } = await render('player', (firebase) => {
      firebase.records.playerRecords.set('p1/absences', new Map([['ab1', { kind: 'injury', label: 'Verletzung', detail: '', from: '2026-11-05', to: '', playerId: 'p1' }]]));
    });
    // e3 und e4 liegen in der Verletzung (offenes Ende) und zählen weder dafür noch dagegen: e1 + e2 bleiben.
    await settle(fixture, root, () => text(root.querySelector('[data-testid="check-in-streak"] .count')) === '2');
    expect(text(root.querySelector('[data-testid="streak-pause"]'))).toContain('Deine Serie ruht');
  });

  it('Eltern sehen die Serie ihres Kindes', async () => {
    const { fixture, root } = await render('parent');
    await settle(fixture, root, () => root.querySelector('[data-testid="streaks"]') !== null);
    expect(text(root.querySelector('h2'))).toBe('Serien von Jonas Keller');
  });

  it('Lern-Serie: Wochen mit bestätigter Stufe in Folge, Pause-Wochen zählen nicht', async () => {
    const { fixture, root } = await render('player', (firebase) => {
      firebase.learning.paths.set('lp1', {
        title: 'Torwart',
        position: 'TW',
        ageGroup: '',
        levels: [
          { id: 'a', title: 'A', unit: 'a', minutes: 3, url: null, homeTask: '' },
          { id: 'b', title: 'B', unit: 'b', minutes: 3, url: null, homeTask: '' },
          { id: 'c', title: 'C', unit: 'c', minutes: 3, url: null, homeTask: '' },
          { id: 'd', title: 'D', unit: 'd', minutes: 3, url: null, homeTask: '' },
        ],
      });
      // Bestätigt in der Woche vom 19.10., dann zwei Wochen Herbstferien, dann die Woche vom 09.11.
      firebase.learning.progress.set('p1', { playerId: 'p1', paths: { lp1: { a: '2026-10-20', b: '2026-11-10' } } });
      firebase.planning.breaksDoc = { breaks: { b1: { name: 'Herbstferien', startDate: '2026-10-26', endDate: '2026-11-08' } } };
    });
    await settle(fixture, root, () => root.querySelector('[data-testid="learning-streak"]') !== null);
    expect(text(root.querySelector('[data-testid="learning-streak"] .count'))).toBe('2');
    expect(text(root.querySelector('[data-testid="learning-streak"]'))).toContain('Wochen mit Lernfortschritt in Folge');
  });

  it('zeigt keine Rangliste, keine anderen Spieler und kein Wort von Vergleich', async () => {
    const { fixture, root } = await render('player');
    await settle(fixture, root, () => root.querySelector('[data-testid="streaks"]') !== null);
    expect(text(root)).toContain('Es gibt keine Rangliste');
    expect(root.querySelector('ol')).toBeNull();
    expect(root.querySelector('table')).toBeNull();
  });

  it('Trainer sehen dieses Panel nicht (nur eigene Serie von Spieler und Eltern)', async () => {
    const { fixture, root } = await render('trainer');
    TestBed.tick();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="streaks"]')).toBeNull();
  });

  it('ohne Einwilligung (Gesundheitsangaben nicht lesbar) erscheint keine Serie', async () => {
    const { fixture, root } = await render('player', undefined, true);
    TestBed.tick();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="streaks"]')).toBeNull();
  });
});
