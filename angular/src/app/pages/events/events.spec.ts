import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FirebaseService } from '../../core/firebase.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { FakeFirebase } from '../../core/testing';
import { Events } from './events';

describe('Events (Events-Seite)', () => {
  let firebase: FakeFirebase;
  const isMobile = signal(false);

  async function render(role: 'trainer' | 'medical' = 'trainer', mobile = false) {
    isMobile.set(mobile);
    firebase = new FakeFirebase();
    firebase.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2, location: 'Kunstrasen' });
    firebase.events.set('e2', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, intensity: 3 });
    firebase.events.set('e3', { type: 'Training', title: 'Training September', date: '2026-09-28' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }],
    });
    TestBed.inject(SessionService).role.set(role);
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
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  describe('Desktop', () => {
    it('zeigt Events als Tabelle, neueste zuerst, mit Ergebnis und Gegner', async () => {
      const fixture = await render();
      const rows = qa(fixture, 'tbody tr').map(text);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toContain('Heimspiel');
      expect(rows[0]).toContain('10.10.2026');
      expect(rows[0]).toContain('vs. SV Nord');
      expect(rows[0]).toContain('3:1');
      expect(rows[1]).toContain('Kunstrasen');
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
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);

      const [typeSelect, sortSelect] = qa<HTMLSelectElement>(fixture, '.filters select');
      type(typeSelect, 'Spiel', 'change');
      fixture.detectChanges();
      expect(qa(fixture, 'tbody tr')).toHaveLength(1);
      type(typeSelect, 'all', 'change');
      type(sortSelect, 'date-asc', 'change');
      fixture.detectChanges();
      expect(text(qa(fixture, 'tbody tr')[0])).toContain('Training September');
    });

    it('legt ein Training an', async () => {
      const fixture = await render();
      qa<HTMLButtonElement>(fixture, '.head button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Event anlegen');
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, '  Training Freitag  ');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect([...firebase.events.values()].some((data) => data['title'] === 'Training Freitag')).toBe(true));
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
        const saved = [...firebase.events.values()].find((data) => data['title'] === 'Auswärtsspiel');
        expect(saved).toMatchObject({ type: 'Spiel', opponent: 'TSV Süd', goalsFor: 2, goalsAgainst: 2 });
      });
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
      qa<HTMLButtonElement>(fixture, 'tbody tr button').find((button) => text(button) === 'Bearbeiten' && button.getAttribute('aria-label') === 'Bearbeiten: Training Montag')!.click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Event bearbeiten');
      expect(dialog.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Training Montag');
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Training Dienstag');
      type(dialog.querySelector<HTMLInputElement>('input[name="date"]')!, '2026-10-06');
      type(dialog.querySelector<HTMLInputElement>('input[name="location"]')!, 'Halle');
      type(dialog.querySelector<HTMLTextAreaElement>('textarea[name="notes"]')!, 'Passspiel');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(firebase.events.get('e1')).toMatchObject({ title: 'Training Dienstag', date: '2026-10-06', location: 'Halle', notes: 'Passspiel' }));
      expect(firebase.events.size).toBe(3);
    });

    it('löscht erst nach Bestätigung', async () => {
      const fixture = await render();
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
      firebase.deleteEventError = { code: 'unavailable' };
      qa<HTMLButtonElement>(fixture, 'tbody tr button').find((button) => button.getAttribute('aria-label') === 'Löschen: Heimspiel')!.click();
      await flush(fixture);
      qa<HTMLButtonElement>(fixture, '.confirm-actions button').find((button) => text(button) === 'Endgültig löschen')!.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(text(q(fixture, '.confirm-actions')?.parentElement?.querySelector('.error'))).toContain('Löschen fehlgeschlagen');
      });
      expect(firebase.events.has('e2')).toBe(true);
    });

    it('maskiert Eingaben aus Nutzertexten (keine unmaskierte HTML-Ausgabe)', async () => {
      const fixture = await render();
      firebase.events.set('e4', { type: 'Spiel', title: '<img src=x onerror=alert(1)>', date: '2026-10-11', opponent: '<b>Gegner</b>' });
      firebase.emitEvents();
      await flush(fixture);
      expect(root(fixture).querySelector('img')).toBeNull();
      expect(root(fixture).querySelector('tbody b')).toBeNull();
      expect(text(root(fixture).querySelector('tbody'))).toContain('<img src=x onerror=alert(1)>');
    });

    it('zeigt Ladefehler mit „Erneut versuchen“', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      isMobile.set(false);
      firebase = new FakeFirebase();
      firebase.watchEventsError = { code: 'permission-denied' };
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: FirebaseService, useValue: firebase }, { provide: LayoutService, useValue: { isMobile } }],
      });
      TestBed.inject(SessionService).role.set('trainer');
      const fixture = TestBed.createComponent(Events);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.notice')).not.toBeNull();
      });
      expect(text(q(fixture, '.notice'))).toContain('Die Events konnten nicht geladen werden');
      firebase.watchEventsError = null;
      q<HTMLButtonElement>(fixture, '.notice button')!.click();
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(q(fixture, '.filters')).not.toBeNull();
      });
    });
  });

  describe('Rollen', () => {
    it('Medizin sieht die Liste, aber keine Schreib-Schaltflächen', async () => {
      const fixture = await render('medical');
      expect(qa(fixture, 'tbody tr')).toHaveLength(3);
      expect(q(fixture, '.head button')).toBeNull();
      expect(qa(fixture, 'tbody tr button')).toHaveLength(0);
      expect(q(fixture, 'tk-event-dialog')).toBeNull();
    });
  });

  describe('Handy', () => {
    it('gruppiert nach Monat, öffnet das Bewerten per Tipp und das Bearbeiten über die Schaltfläche', async () => {
      const fixture = await render('trainer', true);
      expect(qa(fixture, '.group').map(text)).toEqual(['Oktober 2026 · 2', 'September 2026 · 1']);
      expect(q(fixture, 'table')).toBeNull();
      expect(q(fixture, '.fab')).not.toBeNull();
      expect(qa<HTMLAnchorElement>(fixture, 'a.event-card')[0].getAttribute('href')).toBe('/events/e2');
      qa<HTMLButtonElement>(fixture, '.row button')[0].click();
      await flush(fixture);
      expect(text(q(fixture, 'tk-event-dialog h2'))).toBe('Event bearbeiten');
    });

    it('zeigt für Medizin weder Anlegen noch Bearbeiten', async () => {
      const fixture = await render('medical', true);
      expect(q(fixture, '.fab')).toBeNull();
      expect(qa(fixture, '.row button')).toHaveLength(0);
    });
  });
});
