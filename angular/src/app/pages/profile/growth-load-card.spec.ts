import { TestBed } from '@angular/core/testing';
import { renderProfileExtras, q, qa, text } from './testing/profile-fixture';

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
});
