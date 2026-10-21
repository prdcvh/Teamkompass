import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { WeatherService } from '../../core/weather/weather.service';
import { Events } from './events';

/** Leseansicht und Stift-Umschaltung der Event-Maske (SCRUM-144). */
describe('Events: Anschauen und Bearbeiten über den Stift', () => {
  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'physio' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2, location: 'Kunstrasen', notes: 'Erste Zeile\n<b>zweite</b> Zeile' });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...provideFakeFirebase(firebase), { provide: LayoutService, useValue: { isMobile: signal(false) } }],
    });
    TestBed.inject(SessionService).role.set(role);
    // Feste Uhr in der Woche des Events, damit es in „Diese Woche“ (aufgeklappt) steht (SCRUM-140).
    TestBed.inject(WeatherService).now = () => new Date('2026-10-05T07:00:00Z');
    const fixture = TestBed.createComponent(Events);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('.filters')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const qa = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => [...root(fixture).querySelectorAll<T>(selector)];
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);

    const openView = async (fixture: Awaited<ReturnType<typeof render>>) => {
      qa<HTMLButtonElement>(fixture, 'tbody tr button')[0].click();
      await flush(fixture);
      return q<HTMLElement>(fixture, 'tk-event-dialog')!;
    };

    it('Anschauen zeigt nur Text ohne Eingabefelder, lässt leere Felder weg und zeigt Notizen nie als HTML (SCRUM-144)', async () => {
      const fixture = await render();
      const dialog = await openView(fixture);
      expect(text(dialog.querySelector('h2'))).toBe('Event ansehen');
      expect(dialog.querySelector('input, select, textarea, form')).toBeNull();
      const content = text(dialog.querySelector('dl'));
      expect(content).toContain('Training Montag');
      expect(content).toContain('Kunstrasen');
      expect(content).toContain('Anstrengung5 · schwer'); // alte Intensität 2 → Anstrengung 5 (SCRUM-137)
      for (const missing of ['Gegner', 'Startzeit', '–']) expect(content).not.toContain(missing);
      const notes = dialog.querySelector<HTMLElement>('.notes')!;
      expect(notes.textContent).toBe('Erste Zeile\n<b>zweite</b> Zeile');
      expect(notes.querySelector('b')).toBeNull();
      expect(getComputedStyle(notes).whiteSpace).toBe('pre-wrap');
    });

    it('der Stift schaltet in den Bearbeiten-Modus, Abbrechen verwirft die Eingaben (SCRUM-144)', async () => {
      const fixture = await render();
      const dialog = await openView(fixture);
      const pen = dialog.querySelector<HTMLButtonElement>('.edit-pen')!;
      expect(pen.getAttribute('aria-label')).toBe('Event bearbeiten');
      pen.click();
      await flush(fixture);
      expect(text(dialog.querySelector('h2'))).toBe('Event bearbeiten');
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Verworfen');
      qa<HTMLButtonElement>(fixture, 'tk-event-dialog menu button').find((button) => text(button) === 'Abbrechen')!.click();
      await flush(fixture);
      expect(text(dialog.querySelector('h2'))).toBe('Event ansehen');
      expect(dialog.querySelector('input')).toBeNull();
      expect(text(dialog.querySelector('dl'))).toContain('Training Montag');
      expect(firebase.events.events.get('e1')).toMatchObject({ title: 'Training Montag' });
      // Erneut bearbeiten: Formular zeigt wieder die gespeicherten Werte, nicht den verworfenen Text
      dialog.querySelector<HTMLButtonElement>('.edit-pen')!.click();
      await flush(fixture);
      expect(dialog.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Training Montag');
    });

    it('Speichern führt zurück in die Leseansicht mit den neuen Werten (SCRUM-144)', async () => {
      const fixture = await render();
      const dialog = await openView(fixture);
      dialog.querySelector<HTMLButtonElement>('.edit-pen')!.click();
      await flush(fixture);
      type(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, 'Training Mittwoch');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      await vi.waitFor(() => expect(firebase.events.events.get('e1')).toMatchObject({ title: 'Training Mittwoch' }));
      await flush(fixture);
      expect(text(dialog.querySelector('h2'))).toBe('Event ansehen');
      expect(dialog.querySelector('input')).toBeNull();
      expect(text(dialog.querySelector('dl'))).toContain('Training Mittwoch');
    });

    it('Medizin bekommt beim Anschauen nur die Leseansicht, ohne Stift (SCRUM-144)', async () => {
      const fixture = await render('physio');
      qa<HTMLButtonElement>(fixture, 'tbody tr button')[0].click();
      await flush(fixture);
      const dialog = q<HTMLElement>(fixture, 'tk-event-dialog')!;
      expect(text(dialog.querySelector('h2'))).toBe('Event ansehen');
      expect(dialog.querySelector('.edit-pen')).toBeNull();
      expect(dialog.querySelector('input, form')).toBeNull();
    });
});
