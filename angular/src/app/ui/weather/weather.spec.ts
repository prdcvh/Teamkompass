import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { type TeamEvent } from '../../core/events/event';
import { weatherDescription, weatherKind, weatherParts, weatherSpokenText, weatherSummary } from '../../core/weather/weather-display';
import { WeatherProvider } from '../../core/weather/weather-provider';
import { WeatherService } from '../../core/weather/weather.service';
import { Weather } from './weather';

const NOW = new Date('2026-10-16T10:00:00Z');

function dayResponse(date: string): unknown {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => 14.4),
      apparent_temperature: time.map(() => 12),
      precipitation_probability: time.map(() => 60),
      precipitation: time.map(() => 0.2),
      wind_speed_10m: time.map(() => 10),
      weather_code: time.map(() => 61),
    },
  };
}

function makeEvent(patch: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'e1', type: 'Training', title: 'Training', date: '2026-10-17', intensity: 2, exertion: 5, location: 'Platz', trainingFocus: '', opponent: '',
    goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: '18:00', durationMinutes: 90,
    locationCoords: { lat: 50.18, lon: 8.46, name: 'Königstein' }, notes: '', ...patch,
  };
}

@Component({ imports: [Weather], template: '<tk-weather [event]="event" [showSource]="true" [showClothing]="clothing" />' })
class Host {
  event = makeEvent();
  clothing = false;
}

class FakeProvider extends WeatherProvider {
  mode: 'ok' | 'fail' | 'pending' = 'ok';
  calls = 0;
  lastCoords: unknown = null;
  resolve: (v: unknown) => void = () => undefined;
  async fetchDay(coords: unknown, date: string): Promise<unknown> {
    this.calls++;
    this.lastCoords = coords;
    if (this.mode === 'fail') throw new Error('offline');
    if (this.mode === 'pending') return new Promise((r) => (this.resolve = () => r(dayResponse(date))));
    return dayResponse(date);
  }
}

describe('tk-weather', () => {
  let provider: FakeProvider;

  async function render(event: TeamEvent) {
    provider = new FakeProvider();
    TestBed.configureTestingModule({ imports: [Host], providers: [{ provide: WeatherProvider, useValue: provider }] });
    TestBed.inject(WeatherService).now = () => NOW;
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.event = event;
    return fixture;
  }
  async function settle(f: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    f.detectChanges();
    await f.whenStable();
    // Der Abruf läuft aus einem Effect; ein paar Runden genügen, bis das Ergebnis gesetzt ist.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      f.detectChanges();
    }
  }
  const host = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('tk-weather') as HTMLElement;

  it('zeigt Temperatur, Regenwahrscheinlichkeit, Symbol, Textalternative und Quelle', async () => {
    const f = await render(makeEvent());
    await settle(f);
    const el = host(f);
    expect(el.dataset['state']).toBe('ok');
    expect(el.textContent).toContain('14 °C · 60 % Regen');
    expect(el.querySelector('tk-icon')?.getAttribute('data-icon')).toBe('weather-rain');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Wetter: Regen, 14 Grad Celsius, Regenwahrscheinlichkeit 60 Prozent');
    expect(el.querySelector('a')?.textContent).toContain('Open-Meteo');
  });

  it('zeigt beim Laden einen dezenten Hinweis und blockiert nichts', async () => {
    const f = await render(makeEvent());
    provider.mode = 'pending';
    f.detectChanges();
    await Promise.resolve();
    f.detectChanges();
    expect(host(f).dataset['state']).toBe('loading');
    expect(host(f).textContent).toContain('Wetter wird geladen');
    provider.resolve(null);
    await settle(f);
    expect(host(f).dataset['state']).toBe('ok');
  });

  it('zeigt „nicht verfügbar“, wenn der Abruf scheitert', async () => {
    const f = await render(makeEvent());
    provider.mode = 'fail';
    await settle(f);
    expect(host(f).dataset['state']).toBe('unavailable');
    expect(host(f).textContent).toContain('Wetter nicht verfügbar');
  });

  it('nimmt ohne gewählten Ort den Standardort Königstein und sagt das dazu (SCRUM-153)', async () => {
    const f = await render(makeEvent({ location: 'Kunstrasen - heim', locationCoords: null }));
    await settle(f);
    expect(host(f).dataset['state']).toBe('ok');
    // Der Dienst rundet auf 2 Stellen (Cache pro Gebiet).
    expect(provider.lastCoords).toMatchObject({ lat: 50.18, lon: 8.47 });
    expect(host(f).textContent).toContain('Königstein');
    expect(host(f).querySelector('.line')!.getAttribute('aria-label')).toContain('Standardort Königstein');
  });

  it('nimmt einen gewählten Ort und zeigt dann keinen Standardort-Hinweis', async () => {
    const f = await render(makeEvent({ locationCoords: { lat: 50.2, lon: 8.6, name: 'Bad Homburg' } }));
    await settle(f);
    expect(provider.lastCoords).toMatchObject({ lat: 50.2, lon: 8.6 });
    expect(host(f).querySelector('.home')).toBeNull();
  });

  it('weist auf die fehlende Startzeit hin und ruft nichts ab', async () => {
    const f = await render(makeEvent({ startTime: null }));
    await settle(f);
    expect(host(f).dataset['state']).toBe('no-time');
    expect(provider.calls).toBe(0);
  });

  it('zeigt nichts für vergangene Events', async () => {
    const f = await render(makeEvent({ date: '2026-10-15' }));
    await settle(f);
    expect(host(f).dataset['state']).toBe('hidden');
    expect(host(f).hidden).toBe(true);
    expect(provider.calls).toBe(0);
  });

  it('zeigt nichts außerhalb des Vorhersagehorizonts', async () => {
    const f = await render(makeEvent({ date: '2026-12-24' }));
    await settle(f);
    expect(host(f).dataset['state']).toBe('hidden');
    expect(provider.calls).toBe(0);
  });

  it('zeigt nichts, wenn die Startzeit heute schon vorbei ist', async () => {
    const f = await render(makeEvent({ date: '2026-10-16', startTime: '09:00' }));
    await settle(f);
    expect(host(f).dataset['state']).toBe('hidden');
  });

  it('zeigt die Kleidungsempfehlung nur auf Wunsch, mit Alternativtext, Text und Hinweis', async () => {
    const f = await render(makeEvent());
    f.componentInstance.clothing = true;
    await settle(f);
    const el = host(f);
    expect(el.querySelector('tk-clothing svg')?.getAttribute('aria-label')).toBe('Kleidungsempfehlung: lange Hose, Pulli, Regenjacke');
    expect(el.querySelector('tk-clothing .text')?.textContent).toBe('Am 17.10.: lange Hose, Pulli und Regenjacke');
    expect(el.querySelector('tk-clothing .hint')?.textContent).toContain('Trainer entscheidet');
  });

  it('zeigt ohne Wunsch keine Kleidungsempfehlung', async () => {
    const f = await render(makeEvent());
    await settle(f);
    expect(host(f).querySelector('tk-clothing')).toBeNull();
  });
});

describe('Wetteranzeige-Texte', () => {
  const snap = { time: 't', temperature: 13.6, apparentTemperature: null, precipitationProbability: null, precipitation: null, windSpeed: null, weatherCode: 0 };

  it('ordnet WMO-Codes Symbolen zu', () => {
    expect([0, 3, 45, 61, 81, 73, 86, 95, null].map(weatherKind)).toEqual(['sun', 'cloud', 'cloud', 'rain', 'rain', 'snow', 'snow', 'storm', 'cloud']);
    expect(weatherDescription(45)).toBe('Nebel');
  });

  it('lässt fehlende Regenwahrscheinlichkeit weg', () => {
    expect(weatherSummary(snap)).toBe('14 °C');
    expect(weatherSpokenText(snap)).toBe('Wetter: Klar, 14 Grad Celsius');
  });

  it('teilt die Anzeige in Teile, die beim Umbruch zusammenbleiben (SCRUM-155)', () => {
    expect(weatherParts({ ...snap, precipitationProbability: 79.6 })).toEqual(['14 °C', '80 % Regen']);
    expect(weatherSummary({ ...snap, precipitationProbability: 79.6 })).toBe('14 °C · 80 % Regen');
  });
});
