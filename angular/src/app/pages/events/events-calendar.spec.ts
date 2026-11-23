import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FileOutput } from '../../core/export/file-output';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WeatherService } from '../../core/weather/weather.service';
import { Events } from './events';

/** Kalenderdatei-Button auf der Events-Seite (SCRUM-179). */
describe('Events: Kalenderdatei (SCRUM-179)', () => {
  /** Feste Uhr: Montag, 5.10.2026, 09:00 Berlin. */
  const CLOCK = new Date('2026-10-05T07:00:00Z');
  const saved: { name: string; text: string; mime?: string }[] = [];

  async function render(role: 'trainer' | 'physio' | 'player' | 'parent' | 'scout') {
    saved.length = 0;
    const firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', startTime: '18:00', durationMinutes: 60, intensity: 2, location: 'Kunstrasen', notes: 'Max fehlt <b>zweite</b> Zeile' });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    firebase.events.events.set('e3', { type: 'Training', title: 'Training September', date: '2026-09-28' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(false) } },
        { provide: FileOutput, useValue: { saveText: (name: string, text: string, mime?: string) => saved.push({ name, text, mime }) } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(WeatherService).now = () => CLOCK;
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.filters')).not.toBeNull();
    });
    return fixture.nativeElement as HTMLElement;
  }

  for (const role of ['trainer', 'physio', 'player', 'parent', 'scout'] as const) {
    it(`${role} sieht den Button und lädt nur kommende Termine ohne Personendaten`, async () => {
      const root = await render(role);
      const box = root.querySelector('[data-testid="calendar-export"]')!;
      expect(box.textContent).toContain('aktualisiert sich nicht');
      box.querySelector('button')!.click();
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toMatch(/^teamkompass-.+\.ics$/);
      expect(saved[0].mime).toBe('text/calendar;charset=utf-8');
      expect(saved[0].text).toContain('SUMMARY:Training Montag');
      expect(saved[0].text).toContain('SUMMARY:Heimspiel (vs. SV Nord)');
      expect(saved[0].text).not.toContain('Training September');
      expect(saved[0].text).not.toContain('zweite');
      expect(saved[0].text).not.toContain('Max');
    });
  }
});
