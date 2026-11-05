import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { addDays, todayIso } from '../../core/shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { AlertsPanel } from './alerts-panel';

/** Automatische Hinweise (SCRUM-195): Trainer und Medizin sehen sie, alle anderen Rollen nicht. */
describe('AlertsPanel (Wenn-dann-Regeln)', () => {
  let firebase: FakeFirebase;
  const day = (offset: number) => addDays(todayIso(), offset);

  async function render(role: 'trainer' | 'physio' | 'player' | 'scout', mutate?: (firebase: FakeFirebase) => void) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit', consentStatus: 'granted' });
    firebase.players.players.set('p2', { name: 'Ben Berg', positions: ['IV'], number: 4, birthdate: '2012-06-06', status: 'Verletzt', consentStatus: 'revoked' });
    // Ali meldet zweimal starken Muskelkater.
    firebase.selfReports.set('p1', 'wellness', 'e1', { date: day(-3), fatigue: 4, sleep: 4, soreness: 2, stress: 4 });
    firebase.selfReports.set('p1', 'wellness', 'e2', { date: day(-1), fatigue: 4, sleep: 4, soreness: 1, stress: 4 });
    mutate?.(firebase);
    TestBed.configureTestingModule({ providers: [provideRouter([]), ...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    if (role === 'player') session.playerId.set('p1');
    const fixture = TestBed.createComponent(AlertsPanel);
    await fixture.whenStable();
    return fixture;
  }
  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const text = (fixture: { nativeElement: unknown }) => root(fixture).textContent?.replace(/\s+/g, ' ') ?? '';
  const hints = (fixture: { nativeElement: unknown }) => [...root(fixture).querySelectorAll('[data-testid="alert-hint"]')].map((el) => el.getAttribute('data-rule'));
  const ready = (fixture: { detectChanges: () => void; nativeElement: unknown }) =>
    vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(fixture)).not.toContain('werden berechnet');
      expect(root(fixture).querySelector('[data-testid="alerts-panel"]')).not.toBeNull();
    });

  it('Trainer: Hinweis „Schmerz wiederholt“ mit Link zum Profil, Einwilligung widerrufen, und das Protokoll', async () => {
    const fixture = await render('trainer');
    await ready(fixture);
    expect(hints(fixture)).toEqual(['pain', 'consentRevoked']);
    const pain = root(fixture).querySelector('[data-rule="pain"]')!;
    expect(pain.textContent).toContain('Ali Adler');
    expect(pain.querySelector('a')?.getAttribute('href')).toBe('/profile/p1');
    expect(text(fixture)).toContain('Regeln einstellen');
    expect(root(fixture).querySelectorAll('[data-testid="alert-log-entry"]')).toHaveLength(2);
    // Das Befinden wird nur für das Fenster der Regeln geladen.
    expect(firebase.calls.some((call) => call.startsWith('watchSelfReports:p1:wellness:'))).toBe(true);
  });

  it('Trainer: ausgeschaltete Vorlagen erscheinen nicht', async () => {
    const fixture = await render('trainer', (fake) => (fake.settings.settings = { alertRules: { pain: false, consentRevoked: false } }));
    await ready(fixture);
    expect(hints(fixture)).toEqual([]);
    expect(root(fixture).querySelector('[data-testid="alerts-empty"]')).not.toBeNull();
  });

  it('Medizin: nur Schmerz/Befinden, ohne Link und ohne Teameinstellungen oder Bewertungen zu lesen', async () => {
    const fixture = await render('physio');
    await ready(fixture);
    expect(hints(fixture)).toEqual(['pain']);
    expect(root(fixture).querySelector('[data-rule="pain"] a')).toBeNull();
    expect(text(fixture)).not.toContain('Regeln einstellen');
    expect(text(fixture)).not.toContain('Ben Berg');
    expect(firebase.calls).not.toContain('watchSettings');
    expect(firebase.calls.some((call) => call.startsWith('watchRatings') || call.startsWith('watchPlayerStats'))).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('watchSelfReports:p2'))).toBe(false);
  });

  for (const role of ['player', 'scout'] as const) {
    it(`${role}: keine Hinweise und kein Abo auf das Befinden`, async () => {
      const fixture = await render(role);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(root(fixture).querySelector('[data-testid="alerts-panel"]')).toBeNull();
      expect(firebase.calls.some((call) => call.includes(':wellness'))).toBe(false);
    });
  }
});
