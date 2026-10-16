import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { type GeocodingResult, GeocodingService } from '../../core/geocoding/geocoding.service';
import { EventsService } from '../../core/events/events.service';
import { FakeFirebase, provideFakeFirebase } from '../../core/testing/fake-firebase';
import { EventDialog } from './event-dialog';

const KOENIGSTEIN = { name: 'Königstein im Taunus', region: 'Hessen', country: 'Deutschland', lat: 50.1806, lon: 8.4597 };

describe('EventDialog: Ortssuche (SCRUM-97) und Standardort Königstein (SCRUM-153)', () => {
  let firebase: FakeFirebase;
  let searches: { query: string; language: string | undefined }[];
  let answer: () => Promise<GeocodingResult>;

  async function render(options: { defaults?: Record<string, unknown> | null } = {}) {
    firebase = new FakeFirebase();
    firebase.settings.settings = options.defaults ?? null;
    searches = [];
    answer = async () => ({ status: 'ok', places: [KOENIGSTEIN] });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakeFirebase(firebase),
        {
          provide: GeocodingService,
          useValue: {
            search: (query: string, language?: string) => {
              searches.push({ query, language });
              return answer();
            },
          } satisfies GeocodingService,
        },
      ],
    });
    TestBed.inject(SessionService).role.set('trainer');
    const events = TestBed.inject(EventsService);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    const fixture = TestBed.createComponent(EventDialog);
    fixture.componentRef.setInput('open', true);
    await flush(fixture);
    return fixture;
  }

  type Fixture = Awaited<ReturnType<typeof render>>;
  const flush = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const el = (fixture: Fixture) => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(fixture: Fixture, selector: string) => el(fixture).querySelector<T>(selector);
  const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = (fixture: Fixture) => q<HTMLFormElement>(fixture, 'form')!.dispatchEvent(new Event('submit'));
  const savedEvent = (title: string) => [...firebase.events.events.values()].find((data) => data['title'] === title);

  async function search(fixture: Fixture, location: string) {
    type(q<HTMLInputElement>(fixture, 'input[name="location"]')!, location);
    fixture.detectChanges();
    q<HTMLButtonElement>(fixture, '.search-place')!.click();
    await flush(fixture);
  }

  it('sucht nur auf Klick, nicht beim Tippen, und schickt nur Ortstext und Sprache', async () => {
    const fixture = await render();
    type(q<HTMLInputElement>(fixture, 'input[name="location"]')!, 'Hauptplatz');
    await flush(fixture);
    expect(searches).toHaveLength(0);
    q<HTMLButtonElement>(fixture, '.search-place')!.click();
    await flush(fixture);
    expect(searches).toEqual([{ query: 'Hauptplatz', language: 'de' }]);
  });

  it('zeigt Treffer; Auswahl speichert Koordinaten und Ortsname im Event und behält den Ortstext', async () => {
    const fixture = await render();
    await search(fixture, 'Hauptplatz');
    const options = [...el(fixture).querySelectorAll<HTMLButtonElement>('.place-option')];
    expect(options).toHaveLength(1);
    expect(text(options[0])).toContain('Königstein im Taunus');
    expect(text(options[0])).toContain('Hessen');
    options[0].click();
    await flush(fixture);
    expect(text(q(fixture, '.place-chosen'))).toContain('Königstein im Taunus, Hessen, Deutschland');
    expect(el(fixture).querySelector('.place-option')).toBeNull();

    type(q<HTMLInputElement>(fixture, 'input[name="title"]')!, 'Training mit Ort');
    submit(fixture);
    await vi.waitFor(() =>
      expect(savedEvent('Training mit Ort')).toMatchObject({
        location: 'Hauptplatz',
        locationCoords: { lat: 50.1806, lon: 8.4597, name: 'Königstein im Taunus, Hessen, Deutschland' },
      }),
    );
  });

  it('ohne Auswahl bleibt der Ort reiner Text und das Event lässt sich speichern', async () => {
    const fixture = await render();
    await search(fixture, 'Hauptplatz');
    type(q<HTMLInputElement>(fixture, 'input[name="title"]')!, 'Nur Text');
    submit(fixture);
    await vi.waitFor(() => expect(savedEvent('Nur Text')).toMatchObject({ location: 'Hauptplatz', locationCoords: null }));
  });

  it('„Auswahl entfernen“ nimmt die Koordinaten wieder weg', async () => {
    const fixture = await render();
    await search(fixture, 'Hauptplatz');
    q<HTMLButtonElement>(fixture, '.place-option')!.click();
    await flush(fixture);
    q<HTMLButtonElement>(fixture, '.remove-coords')!.click();
    await flush(fixture);
    expect(q(fixture, '.place-chosen')).toBeNull();
    type(q<HTMLInputElement>(fixture, 'input[name="title"]')!, 'Ohne Koordinaten');
    submit(fixture);
    await vi.waitFor(() => expect(savedEvent('Ohne Koordinaten')).toMatchObject({ locationCoords: null }));
  });

  it('meldet „kein Treffer“ verständlich', async () => {
    const fixture = await render();
    answer = async () => ({ status: 'ok', places: [] });
    await search(fixture, 'Xyzzy');
    expect(text(q(fixture, '.no-places'))).toContain('Kein Treffer');
  });

  it('meldet Fehler und Offline-Zustand verständlich und lässt das Speichern zu', async () => {
    const fixture = await render();
    answer = async () => ({ status: 'error', reason: 'offline' });
    await search(fixture, 'Hauptplatz');
    expect(text(q(fixture, '.search-error'))).toContain('offline');
    answer = async () => ({ status: 'error', reason: 'network' });
    q<HTMLButtonElement>(fixture, '.search-place')!.click();
    await flush(fixture);
    expect(text(q(fixture, '.search-error'))).toContain('nicht erreichbar');
    type(q<HTMLInputElement>(fixture, 'input[name="title"]')!, 'Trotz Fehler');
    submit(fixture);
    await vi.waitFor(() => expect(savedEvent('Trotz Fehler')).toMatchObject({ location: 'Hauptplatz' }));
  });

  it('erlaubt die Suche erst ab 2 Zeichen', async () => {
    const fixture = await render();
    type(q<HTMLInputElement>(fixture, 'input[name="location"]')!, 'H');
    fixture.detectChanges();
    expect(q<HTMLButtonElement>(fixture, '.search-place')!.disabled).toBe(true);
  });

  it('fragt nicht nach einem Standardort und nennt Königstein als Ort fürs Wetter (SCRUM-153)', async () => {
    const fixture = await render({ defaults: { defaultLocation: { text: 'Heimplatz', coords: null } } });
    await flush(fixture);
    expect(q(fixture, '.save-default')).toBeNull();
    expect(q(fixture, '.clear-default')).toBeNull();
    // Neues Event bleibt ohne Ort; das Wetter nimmt dann den Standardort.
    expect(q<HTMLInputElement>(fixture, 'input[name="location"]')!.value).toBe('');
    expect(text(q(fixture, '.home-hint'))).toContain('Königstein im Taunus');
    type(q<HTMLInputElement>(fixture, 'input[name="title"]')!, 'Ohne Ort');
    submit(fixture);
    await vi.waitFor(() => expect(savedEvent('Ohne Ort')).toMatchObject({ location: '', locationCoords: null }));
  });
});
