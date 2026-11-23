import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { addDays } from '../../core/shared/dates';
import { clickByText, renderProfileExtras, q, qa, settle, text, typeInto } from './testing/profile-fixture';

/** Wachstum, Belastung und Befinden zusammen im Trainerprofil (SCRUM-257). */
describe('Profil: Wachstum, Belastung und Befinden', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') }));
  afterEach(() => vi.useRealTimers());

  const withLoad = (firebase: Parameters<NonNullable<Parameters<typeof renderProfileExtras>[1]>>[0]) => {
    // 122 Tage Abstand: gültige Rate (die Standardmessungen der Fixture liegen nur 61 Tage auseinander).
    firebase.records.playerRecords.set('p1/measurements', new Map([
      ['me1', { date: '2026-06-01', height: '150' }],
      ['me2', { date: '2026-10-01', height: '154' }],
    ]));
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-09-01', exertion: 5, durationMinutes: 60 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 3, technique: 3, tactics: 3, comprehension: 3 }]]));
  };

  it('zeigt Zeitachse und je Messintervall Wachstum, Belastung und Befinden; fehlendes Befinden heißt „keine Angaben“', async () => {
    const { fixture } = await renderProfileExtras('trainer', withLoad);
    const card = q(fixture, 'tk-growth-load-card')!;
    expect(card.querySelector('svg')).not.toBeNull();
    expect(text(card)).toContain('keine Bewertung');
    const row = text(card.querySelector('tbody tr'));
    expect(row).toContain('01.06.2026 – 01.10.2026');
    expect(row).toContain('cm/Jahr');
    expect(row).toContain('Ø ');
    expect(row).toContain('keine Angaben');
    expect(row).not.toContain('unauffällig');
  });

  it('Befinden mit Antworten wird je Zeitraum gemittelt', async () => {
    const { fixture } = await renderProfileExtras('trainer', (firebase) => {
      withLoad(firebase);
      firebase.selfReports.set('p1', 'wellness', 'e1', { date: '2026-09-01', fatigue: 5, sleep: 5, soreness: 5, stress: 5 });
    });
    await vi.waitFor(() => {
      TestBed.tick();
      fixture.detectChanges();
      expect(text(q(fixture, 'tk-growth-load-card tbody tr'))).toContain('Ø 20 von 28');
    });
  });

  it('ohne Belastung steht „keine Belastung erfasst“, nicht 0', async () => {
    const { fixture } = await renderProfileExtras('trainer');
    expect(text(q(fixture, 'tk-growth-load-card tbody tr'))).toContain('keine Belastung erfasst');
    expect(text(q(fixture, 'tk-growth-load-card tbody tr'))).not.toMatch(/Ø 0\b/);
  });

  it('der Wachstumshinweis lässt sich öffnen und nennt Intervall, Aktualität und Messqualität', async () => {
    const { fixture } = await renderProfileExtras('trainer', withLoad);
    const details = q<HTMLDetailsElement>(fixture, 'tk-growth-load-card details.hint');
    expect(details).not.toBeNull();
    expect(text(details)).toContain('Aktualität');
    expect(text(details)).toContain('Messqualität');
    expect(qa(fixture, 'tk-growth-load-card .check').length).toBeGreaterThan(0);
  });

  describe('Hinweis „Wachstum und Belastung gemeinsam ansehen“ und Trainerprüfung', () => {
    const TODAY = '2026-10-20';
    /** Zwölf normale Wochen (2 Trainings à 90 × 5), dann eine Belastungsspitze (4 Termine mit Anstrengung 6). */
    const withSpike = (quality: string | null) => (firebase: Parameters<NonNullable<Parameters<typeof renderProfileExtras>[1]>>[0]) => {
      const q1 = quality ? { quality } : {};
      firebase.records.playerRecords.set('p1/measurements', new Map([
        ['me1', { date: '2026-06-01', height: '150', ...q1 }],
        ['me2', { date: '2026-10-10', height: '154', ...q1 }],
      ]));
      const days = [...Array.from({ length: 12 }, (_, week) => [7 + week * 7, 9 + week * 7]).flat().map((ago) => [ago, 5]), [5, 6], [3, 6], [1, 6], [0, 6]];
      days.forEach(([ago, exertion], index) => {
        firebase.events.events.set(`s${index}`, { type: 'Training', title: 'Training', date: addDays(TODAY, -ago), exertion, durationMinutes: 90 });
        firebase.ratings.ratings.set(`s${index}`, new Map([['p1', { attendance: 'present' }]]));
      });
    };
    const ready = async (fixture: Awaited<ReturnType<typeof renderProfileExtras>>['fixture'], selector: string) =>
      vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, selector)).not.toBeNull();
      });

    it('offener Hinweis: Prüfung mit Förderplan, Datum und Maßnahme dokumentieren; danach geprüft und ohne erneute Aufforderung', async () => {
      const { fixture, firebase } = await renderProfileExtras('trainer', withSpike('verified'));
      const session = TestBed.inject(SessionService);
      session.uid.set('uid-trainer');
      session.displayName.set('Pascal Trainer');
      await ready(fixture, '[data-testid="growth-load-open"]');
      const open = text(q(fixture, '[data-testid="growth-load-open"]'));
      expect(open).toContain('Belastungsspitze');
      expect(open).toContain('Befinden: keine Angaben');
      expect(open).not.toMatch(/verletzt|nicht einsetzen|unauffällig/i);
      clickByText(fixture, 'tk-growth-load-card button', 'Prüfung dokumentieren');
      await settle(fixture);
      const dialog = q(fixture, 'tk-growth-review-dialog')!;
      expect(text(dialog)).toContain('Pascal Trainer');
      typeInto(dialog.querySelector<HTMLSelectElement>('select[name="planId"]')!, 'dp1', 'change');
      typeInto(dialog.querySelector<HTMLTextAreaElement>('textarea[name="action"]')!, 'Sprungumfang zwei Wochen reduziert');
      dialog.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect([...(firebase.records.playerRecords.get('p1/growthReviews')?.values() ?? [])]).toHaveLength(1);
      });
      const saved = [...firebase.records.playerRecords.get('p1/growthReviews')!.values()][0];
      expect(saved).toMatchObject({ planId: 'dp1', date: TODAY, by: 'Pascal Trainer', byUid: 'uid-trainer', action: 'Sprungumfang zwei Wochen reduziert', playerId: 'p1' });
      expect(String(saved['hintKey'])).toContain('growthLoad:p1:me1@2026-06-01@150>me2@2026-10-10@154');
      await ready(fixture, '[data-testid="growth-load-done"]');
      expect(q(fixture, '[data-testid="growth-load-open"]')).toBeNull();
      expect(text(q(fixture, '[data-testid="growth-review-entry"]'))).toContain('Förderplan: Orientierung');
      // Die App ändert dabei nichts am Spieler (Status/Verfügbarkeit).
      expect(firebase.players.players.get('p1')).toMatchObject({ status: 'Fit' });
    });

    it('ohne dokumentierte Messqualität zuerst „Messung prüfen“, ohne Knopf zum Dokumentieren', async () => {
      const { fixture } = await renderProfileExtras('trainer', withSpike(null));
      await ready(fixture, '[data-testid="growth-load-check"]');
      expect(text(q(fixture, '[data-testid="growth-load-check"]'))).toMatch(/^Messung prüfen/);
      expect(qa<HTMLButtonElement>(fixture, 'tk-growth-load-card button').some((button) => text(button) === 'Prüfung dokumentieren')).toBe(false);
    });

    it('ohne Belastungshinweis kein Hinweis', async () => {
      const { fixture } = await renderProfileExtras('trainer', withLoad);
      await ready(fixture, '[data-testid="growth-load-none"]');
    });

    it('Medizin sieht weder Hinweis noch Prüfungen', async () => {
      const { fixture, firebase } = await renderProfileExtras('physio', withSpike('verified'));
      await settle(fixture);
      expect(q(fixture, '[data-testid="growth-load-review"]')).toBeNull();
      expect(firebase.calls.some((call) => call.includes('growthReviews'))).toBe(false);
    });
  });
});
