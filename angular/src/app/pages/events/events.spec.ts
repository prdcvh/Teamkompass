import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WeatherService } from '../../core/weather/weather.service';
import { Events } from './events';

describe('Events (Events-Seite)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  /** Feste Uhr: Montag, 5.10.2026, 09:00 Berlin → Woche bis 11.10.; Training Montag + Heimspiel diese Woche, September vergangen. */
  const CLOCK = new Date('2026-10-05T07:00:00Z');

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2, location: 'Kunstrasen', notes: 'Erste Zeile\n<b>zweite</b> Zeile' });
    firebase.events.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    firebase.events.events.set('e3', { type: 'Training', title: 'Training September', date: '2026-09-28' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }],
    });
    TestBed.inject(SessionService).role.set(role);
    TestBed.inject(WeatherService).now = () => CLOCK;
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.filters')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const type = (input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, event = 'input') => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** Klappt „Vergangene“/„Später“ per Klick auf. */
  const openAll = (fixture: { detectChanges: () => void; nativeElement: unknown }) => {
    for (const toggle of qa<HTMLButtonElement>(fixture, 'button.toggle[aria-expanded="false"]')) toggle.click();
    fixture.detectChanges();
  };
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  describe('Desktop', () => {
    it('zeigt Events als Tabelle (chronologisch), mit Ergebnis und Gegner', async () => {
      const fixture = await render();
      openAll(fixture);
      const rows = qa(fixture, 'tbody tr').map(text);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toContain('Training September'); // vergangen
      expect(rows[1]).toContain('Kunstrasen'); // Diese Woche: Montag zuerst
      expect(rows[2]).toContain('Heimspiel');
      expect(rows[2]).toContain('10.10.2026');
      expect(rows[2]).toContain('vs. SV Nord');
      expect(rows[2]).toContain('3:1');
      expect(text(q(fixture, '.meta'))).toBe('3 Events');
      expect(q(fixture, '.sync')?.getAttribute('data-state')).toBe('saved');
    });

    it('sucht, filtert nach Typ, sortiert und setzt Filter zurück', async () => {
      const fixture = await render();
      type(q<HTMLInputElement>(fixture, 'input[type="search"]')!, 'nord');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
      type(q<HTMLInputElement>(fixture, 'input[type="search"]')!, 'xyz');
      fixture.detectChanges();
      expect(text(q(fixture, '.empty'))).toContain('Kein Event passt');
      qa<HTMLButtonElement>(fixture, '.empty button')[0].click();
      fixture.detectChanges();
      openAll(fixture);
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);

      const [typeSelect, sortSelect] = qa<HTMLSelectElement>(fixture, '.filters select');
      type(typeSelect, 'Spiel', 'change');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
      type(typeSelect, 'all', 'change');
      type(sortSelect, 'date-desc', 'change');
      fixture.detectChanges();
      openAll(fixture);
      expect(text(qa(fixture, 'tbody tr')[1])).toContain('Heimspiel'); // Diese Woche: neueste zuerst
    });

    it('legt ein Training an', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Event anlegen');
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, '  Training Freitag  ');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect([...firebase.events.events.values()].some((data) => data['title'] === 'Training Freitag')).toBe(true));
    });

    it('zeigt Spielfelder nur bei Spielen und legt ein Spiel mit Ergebnis an', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(dialog.querySelector('[name="opponent"]')).toBeNull();
      expect(dialog.querySelector('[name="trainingFocus"]')).not.toBeNull();
      type(dialog.querySelector<HTMLSelectElement>('select[name="type"]')!, 'Spiel', 'change');
      await flush(fixture);
      expect(dialog.querySelector('[name="trainingFocus"]')).toBeNull();
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Auswärtsspiel');
      type(dialog.querySelector<HTMLInputElement>('input[name="opponent"]')!, 'TSV Süd');
      type(dialog.querySelector<HTMLInputElement>('input[name="goalsFor"]')!, '2');
      type(dialog.querySelector<HTMLInputElement>('input[name="goalsAgainst"]')!, '2');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        const saved = [...firebase.events.events.values()].find((data) => data['title'] === 'Auswärtsspiel');
        expect(saved).toMatchObject({ type: 'Spiel', opponent: 'TSV Süd', goalsFor: 2, goalsAgainst: 2 });
      });
    });

    it('speichert Startzeit und Trainingsdauer; Dauerfeld nur bei Training; ohne beides weiter möglich (SCRUM-95)', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(dialog.querySelector('input[name="startTime"]')).not.toBeNull();
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Abendtraining');
      type(dialog.querySelector<HTMLInputElement>('input[name="startTime"]')!, '18:00');
      type(dialog.querySelector<HTMLInputElement>('input[name="durationMinutes"]')!, '90');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        const saved = [...firebase.events.events.values()].find((data) => data['title'] === 'Abendtraining');
        expect(saved).toMatchObject({ startTime: '18:00', durationMinutes: 90 });
      });
    });

    it('meldet eine ungültige Startzeit', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Zeittest');
      type(dialog.querySelector<HTMLInputElement>('input[name="durationMinutes"]')!, '301');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await flush(fixture);
      expect(text(dialog.querySelector('#err-training-duration'))).toContain('300');
      expect([...firebase.events.events.values()].some((data) => data['title'] === 'Zeittest')).toBe(false);
    });

    it('zeigt Eingabefehler und speichert dann nichts', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await flush(fixture);
      expect(text(dialog.querySelector('#err-title'))).toBe('Bitte einen Titel eingeben.');
      expect(dialog.querySelector('input[name="title"]')?.getAttribute('aria-invalid')).toBe('true');
      expect(firebase.calls.some((call) => call.startsWith('saveEvent'))).toBe(false);
    });

    it('bearbeitet ein Event nachträglich (Titel, Datum, Ort, Notiz)', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, 'tbody tr button').find((button) => text(button) === 'Anschauen' && button.getAttribute('aria-label') === 'Anschauen: Training Montag')!.click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      dialog.querySelector<HTMLButtonElement>('.edit-pen')!.click();
      await flush(fixture);
      expect(text(dialog.querySelector('h2'))).toBe('Event bearbeiten');
      expect(dialog.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Training Montag');
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Training Dienstag');
      type(dialog.querySelector<HTMLInputElement>('input[name="date"]')!, '2026-10-06');
      type(dialog.querySelector<HTMLInputElement>('input[name="location"]')!, 'Halle');
      type(dialog.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!, 'Passspiel');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(firebase.events.events.get('e1')).toMatchObject({ title: 'Training Dienstag', date: '2026-10-06', location: 'Halle', notes: 'Passspiel' }));
      expect(firebase.events.events.size).toBe(3);
    });

    it('löscht erst nach Bestätigung', async () => {
      const fixture = await render();
      openAll(fixture);
      const deleteButton = qa<HTMLButtonElement>(fixture, 'tbody tr button').find((button) => button.getAttribute('aria-label') === 'Löschen: Heimspiel')!;
      deleteButton.click();
      await flush(fixture);
      expect(firebase.calls.some((call) => call.startsWith('deleteEvent'))).toBe(false);
      const confirm = qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Endgültig löschen')!;
      confirm.click();
      await vi.waitFor(() => expect(firebase.calls).toContain('deleteEvent:e2'));
      await flush(fixture);
      expect(qa(fixture, 'tbody tr')).toHaveLength(2);
    });

    it('bleibt beim Löschen fehlgeschlagen im Dialog und zeigt den Fehler', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fixture = await render();
      firebase.events.deleteEventError = { code: 'unavailable' };
      qa<HTMLButtonElement>(fixture, 'tbody tr button').find((button) => button.getAttribute('aria-label') === 'Löschen: Heimspiel')!.click();
      await flush(fixture);
      qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Endgültig löschen')!.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(text(q(fixture, '.confirm-actions')?.parentElement?.querySelector('.error'))).toContain('Löschen fehlgeschlagen');
      });
      expect(firebase.events.events.has('e2')).toBe(true);
    });

    it('maskiert Eingaben aus Nutzertexten (keine unmaskierte HTML-Ausgabe)', async () => {
      const fixture = await render();
      firebase.events.events.set('e4', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-10-11', opponent: '<b>Gegner</b>' });
      firebase.events.emitEvents();
      await flush(fixture);
      expect(root(fixture).querySelector('img')).toBeNull();
      expect(root(fixture).querySelector('tbody b')).toBeNull();
      expect(text(root(fixture).querySelector('tbody'))).toContain('<img src=x onerror=alert(1)>');
    });

    it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      isMobile.set(false);
      firebase = new FakeFirebase();
      firebase.events.watchEventsError = { code: 'permission-denied' };
      TestBed.configureTestingModule({
        providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile } }],
      });
      TestBed.inject(SessionService).role.set('trainer');
      const fixture = TestBed.createComponent(Events);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.notice')).not.toBeNull();
      });
      expect(text(q(fixture, '.notice'))).toContain('Die Events konnten nicht geladen werden');
      firebase.events.watchEventsError = null;
      q<HTMLButtonElement>(fixture, '.notice button')!.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.filters')).not.toBeNull();
      });
    });
  });

  describe('Bereiche (SCRUM-140/141)', () => {
    const headings = (fixture: { nativeElement: unknown }) => qa(fixture, '.sec-head').map(text);

    it('startet mit „Vergangene“ und „Später“ zu und „Diese Woche“ offen; Umschalten meldet aria-expanded', async () => {
      const fixture = await render();
      firebase.events.events.set('e5', { type: 'Training', title: 'Training nächste Woche', date: '2026-10-12' });
      firebase.events.emitEvents();
      await flush(fixture);
      expect(headings(fixture)).toEqual(['Vergangene Events (1)', 'Diese Woche (2)', 'Später (1)']);
      const toggles = qa<HTMLButtonElement>(fixture, 'button.toggle');
      expect(toggles.map((toggle) => toggle.getAttribute('aria-expanded'))).toEqual(['false', 'false']);
      expect(qa(fixture, 'tbody tr')).toHaveLength(2);
      toggles[1].click();
      fixture.detectChanges();
      expect(qa<HTMLButtonElement>(fixture, 'button.toggle')[1].getAttribute('aria-expanded')).toBe('true');
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);
      qa<HTMLButtonElement>(fixture, 'button.toggle')[1].click();
      fixture.detectChanges();
      expect(qa<HTMLButtonElement>(fixture, 'button.toggle')[1].getAttribute('aria-expanded')).toBe('false');
    });

    it('zeigt „Diese Woche keine Events“ und blendet leere Bereiche aus', async () => {
      const fixture = await render();
      firebase.events.events.clear();
      firebase.events.events.set('x', { type: 'Training', title: 'Altes Training', date: '2026-09-01' });
      firebase.events.emitEvents();
      await flush(fixture);
      expect(headings(fixture)).toEqual(['Vergangene Events (1)', 'Diese Woche (0)']);
      expect(text(q(fixture, '.week-empty'))).toBe('Diese Woche keine Events');
    });

    it('klappt bei aktiver Suche Bereiche mit Treffern auf', async () => {
      const fixture = await render();
      type(q<HTMLInputElement>(fixture, 'input[type="search"]')!, 'september');
      fixture.detectChanges();
      expect(headings(fixture)).toEqual(['Vergangene Events (1)', 'Diese Woche (0)']);
      expect(qa<HTMLButtonElement>(fixture, 'button.toggle')[0].getAttribute('aria-expanded')).toBe('true');
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
    });

    it('Handy: Wochenliste ohne Monatsüberschrift, Chronologisch mit nächstem Event oben', async () => {
      const fixture = await render('trainer', true);
      expect(qa(fixture, '.group')).toHaveLength(0);
      expect(qa<HTMLAnchorElement>(fixture, 'a.event-card').map((link) => link.getAttribute('href'))).toEqual(['/events/e1', '/events/e2']);
    });
  });

  describe('Rollen', () => {
    it('Medizin sieht die Liste, aber keine Schreib-Schaltflächen', async () => {
      const fixture = await render('medical');
      openAll(fixture);
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);
      expect(q(fixture, '.head button')).toBeNull();
      expect(qa(fixture, 'tbody tr button').map(text)).toEqual(['Anschauen', 'Anschauen', 'Anschauen']);
      expect(qa(fixture, 'tbody tr a')).toHaveLength(0);
    });
  });

  describe('Handy', () => {
    it('gruppiert nach Monat, öffnet das Bewerten per Tipp und das Bearbeiten über die Schaltfläche', async () => {
      const fixture = await render('trainer', true);
      openAll(fixture);
      expect(qa(fixture, '.group').map(text)).toEqual(['September 2026 · 1']);
      expect(q(fixture, 'table')).toBeNull();
      expect(q(fixture, '.fab')).not.toBeNull();
      expect(qa<HTMLAnchorElement>(fixture, 'a.event-card')[1].getAttribute('href')).toBe('/events/e1');
      qa<HTMLButtonElement>(fixture, '.row button')[0].click();
      await flush(fixture);
      expect(text(q(fixture, 'tk-event-dialog h2'))).toBe('Event ansehen');
      expect(q(fixture, 'tk-event-dialog .edit-pen')).not.toBeNull();
    });

    it('zeigt für Medizin weder Anlegen noch Bearbeiten', async () => {
      const fixture = await render('medical', true);
      expect(q(fixture, '.fab')).toBeNull();
      expect(qa(fixture, '.row button').map(text)).toEqual(['Anschauen', 'Anschauen']); // nur „Diese Woche“ ist offen
    });
  });
});
