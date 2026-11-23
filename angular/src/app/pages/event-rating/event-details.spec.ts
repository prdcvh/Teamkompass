import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventRating } from './event-rating';

/**
 * Eventdetails oben auf der Bewertungsseite mit Stift zum Bearbeiten (SCRUM-285; vorher Leseansicht „Anschauen“ im
 * Event-Dialog, SCRUM-144).
 */
describe('Bewertungsseite: Eventdetails und Bearbeiten über den Stift (SCRUM-285)', () => {
  let firebase: FakeFirebase;

  async function render(role: 'trainer' | 'physio' = 'trainer', data: Record<string, unknown> = {}) {
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Montag', date: '2026-10-05', intensity: 2, location: 'Kunstrasen', notes: 'Erste Zeile\n<b>zweite</b> Zeile', ...data });
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...provideFakeFirebase(firebase),
        { provide: LayoutService, useValue: { isMobile: signal(false) } },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'e1' })) } },
      ],
    });
    TestBed.inject(SessionService).role.set(role);
    const fixture = TestBed.createComponent(EventRating);
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(root(fixture).querySelector('tk-event-details')).not.toBeNull();
    });
    return fixture;
  }

  const root = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: { nativeElement: unknown }, selector: string) => root(fixture).querySelector<T>(selector);
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
  const details = (fixture: { nativeElement: unknown }) => q<HTMLElement>(fixture, 'tk-event-details')!;
  const dialog = (fixture: { nativeElement: unknown }) => q<HTMLElement>(fixture, 'tk-event-dialog')!;
  const openEdit = async (fixture: Awaited<ReturnType<typeof render>>) => {
    details(fixture).querySelector<HTMLButtonElement>('.edit-pen')!.click();
    await flush(fixture);
    return dialog(fixture);
  };

  it('zeigt die Details oberhalb des Bewertungsformulars: nur Text, leere Felder fehlen, Notizen nie als HTML', async () => {
    const fixture = await render();
    const section = details(fixture);
    // Reihenfolge im Dokument: Details vor der Bewertung (Werkzeugleiste/Matrix).
    expect(section.compareDocumentPosition(q(fixture, '.toolbar')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text(section.querySelector('h2'))).toBe('Eventdetails');
    expect(section.querySelector('form, textarea, input:not([name=warmup])')).toBeNull(); // der Aufwärmprogramm-Haken ist der einzige Schalter (SCRUM-178)
    const content = text(section.querySelector('dl'));
    expect(content).toContain('Training Montag');
    expect(content).toContain('Kunstrasen');
    expect(content).toContain('05.10.2026');
    expect(content).toContain('Anstrengung5 · schwer'); // alte Intensität 2 → Anstrengung 5 (SCRUM-137)
    for (const missing of ['Gegner', 'Startzeit', '–']) expect(content).not.toContain(missing);
    const notes = section.querySelector<HTMLElement>('.notes')!;
    expect(notes.textContent).toBe('Erste Zeile\n<b>zweite</b> Zeile');
    expect(notes.querySelector('b')).toBeNull();
    expect(getComputedStyle(notes).whiteSpace).toBe('pre-wrap');
  });

  it('Spiel: Gegner, Ergebnis und Punkte stehen in den Details', async () => {
    const fixture = await render('trainer', { type: 'Spiel', title: 'Heimspiel', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1, startTime: '10:30', matchDuration: 70 });
    const content = text(details(fixture).querySelector('dl'));
    for (const part of ['GegnerSV Nord', 'Ergebnis3:1', 'Startzeit10:30 Uhr', 'Dauer70 Minuten', 'Punkte vergebenNein']) expect(content).toContain(part);
  });

  it('der Stift ist ein Knopf mit Namen, nur für Trainer; Medizin sieht die Details ohne Stift und ohne Formular', async () => {
    const trainer = await render();
    const pen = details(trainer).querySelector<HTMLButtonElement>('.edit-pen')!;
    expect(pen.tagName).toBe('BUTTON');
    expect(pen.getAttribute('aria-label')).toBe('Event bearbeiten');
    TestBed.resetTestingModule();

    const medical = await render('physio');
    expect(text(details(medical).querySelector('dl'))).toContain('Training Montag');
    expect(details(medical).querySelector('.edit-pen')).toBeNull();
    expect(q(medical, 'tk-event-dialog')).toBeNull();
    expect(q(medical, '.warmup')).toBeNull();
  });

  it('Stift öffnet das Formular mit den gespeicherten Werten; Speichern schreibt und zeigt die neuen Werte sofort oben', async () => {
    const fixture = await render();
    const form = await openEdit(fixture);
    expect(text(form.querySelector('h2'))).toBe('Event bearbeiten');
    expect(form.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Training Montag');
    type(form.querySelector<HTMLInputElement>('input[name="title"]')!, 'Training Mittwoch');
    type(form.querySelector<HTMLInputElement>('input[name="location"]')!, 'Halle');
    form.querySelector('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(firebase.events.events.get('e1')).toMatchObject({ title: 'Training Mittwoch', location: 'Halle' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(text(details(fixture).querySelector('dl'))).toContain('Training Mittwoch');
    });
    expect(text(details(fixture).querySelector('dl'))).toContain('Halle');
    expect(text(q(fixture, 'h1'))).toBe('Training Mittwoch');
    expect(dialog(fixture).querySelector('dialog')!.open).toBe(false);
  });

  it('Abbrechen verwirft die Eingaben; erneutes Öffnen zeigt wieder die gespeicherten Werte', async () => {
    const fixture = await render();
    let form = await openEdit(fixture);
    type(form.querySelector<HTMLInputElement>('input[name="title"]')!, 'Verworfen');
    qa<HTMLButtonElement>(fixture, 'tk-event-dialog menu button').find((button) => text(button) === 'Abbrechen')!.click();
    await flush(fixture);
    expect(form.querySelector('dialog')!.open).toBe(false);
    expect(firebase.events.events.get('e1')).toMatchObject({ title: 'Training Montag' });
    expect(text(details(fixture).querySelector('dl'))).toContain('Training Montag');
    form = await openEdit(fixture);
    expect(form.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('Training Montag');
  });

  it('ein neuer Firestore-Stand überschreibt die Eingaben im offenen Formular nicht', async () => {
    const fixture = await render();
    const form = await openEdit(fixture);
    type(form.querySelector<HTMLInputElement>('input[name="title"]')!, 'In Arbeit');
    firebase.events.events.set('e1', { ...firebase.events.events.get('e1'), warmup: '11+' });
    firebase.events.emitEvents();
    await flush(fixture);
    expect(form.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe('In Arbeit');
  });

  it('Trainer setzen den Aufwärmprogramm-Haken und wählen das Programm; er wird am Event gespeichert (SCRUM-178)', async () => {
    const fixture = await render();
    const section = details(fixture);
    const box = section.querySelector<HTMLInputElement>('input[name=warmup]')!;
    const select = section.querySelector<HTMLSelectElement>('select[name=warmupProgram]')!;
    expect(box.checked).toBe(false);
    expect(select.disabled).toBe(true);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await flush(fixture);
    expect(firebase.events.events.get('e1')?.['warmup']).toBe('11+ Kids');
    expect(select.disabled).toBe(false);
    select.value = '11+';
    select.dispatchEvent(new Event('change'));
    await flush(fixture);
    expect(firebase.events.events.get('e1')?.['warmup']).toBe('11+');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await flush(fixture);
    expect(firebase.events.events.get('e1')?.['warmup']).toBeNull();
  });

  it('der Link zur Anleitung öffnet in neuem Tab mit rel noopener noreferrer (SCRUM-178)', async () => {
    const fixture = await render();
    const link = details(fixture).querySelector<HTMLAnchorElement>('.warmup a')!;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.href).toMatch(/^https:\/\//);
  });

  it('das Bearbeiten-Formular lässt ein gesetztes Aufwärmprogramm unverändert (SCRUM-178)', async () => {
    const fixture = await render('trainer', { warmup: '11+' });
    const form = await openEdit(fixture);
    form.querySelector('form')!.dispatchEvent(new Event('submit'));
    await flush(fixture);
    expect(firebase.events.events.get('e1')?.['warmup']).toBe('11+');
  });

  it('„Event löschen“ ist über den Stift erreichbar und fragt erst nach', async () => {
    const fixture = await render();
    const form = await openEdit(fixture);
    form.querySelector<HTMLButtonElement>('button.delete')!.click();
    await flush(fixture);
    expect(text(q(fixture, 'tk-event-delete-dialog h2'))).toBe('Event löschen?');
    expect(firebase.calls.some((call) => call.startsWith('deleteEvent'))).toBe(false);
  });

  it('der Zurück-Link führt in die Eventliste', async () => {
    const fixture = await render();
    expect(q<HTMLAnchorElement>(fixture, 'a.back')!.getAttribute('href')).toBe('/events');
  });
});
