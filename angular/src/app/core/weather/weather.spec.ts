import { TestBed } from '@angular/core/testing';
import { type Coordinates, forecastFor, localMoment, withinHorizon } from './weather';
import { WeatherProvider, openMeteoUrl } from './weather-provider';
import { WEATHER_CACHE_MS, WeatherService } from './weather.service';

/** Gekürzte, echte Form einer Open-Meteo-Antwort (timezone=Europe/Berlin, ein Tag). */
function fixture(date = '2026-10-16'): unknown {
  const time = Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
  return {
    latitude: 50.18,
    longitude: 8.46,
    timezone: 'Europe/Berlin',
    hourly: {
      time,
      temperature_2m: time.map((_, h) => 5 + h / 2),
      apparent_temperature: time.map((_, h) => 3 + h / 2),
      precipitation_probability: time.map((_, h) => h * 3),
      precipitation: time.map((_, h) => (h === 18 ? 0.4 : 0)),
      wind_speed_10m: time.map(() => 12.5),
      weather_code: time.map(() => 61),
    },
  };
}

describe('forecastFor', () => {
  it('wählt die Stunde des Zeitpunkts', () => {
    const s = forecastFor(fixture(), '2026-10-16T18:30');
    expect(s).toEqual({
      time: '2026-10-16T18:00',
      temperature: 14,
      apparentTemperature: 12,
      precipitationProbability: 54,
      precipitation: 0.4,
      windSpeed: 12.5,
      weatherCode: 61,
    });
  });

  it('rechnet Zeitpunkte mit Zeitzone nach Europe/Berlin um (Sommer- und Winterzeit)', () => {
    expect(forecastFor(fixture(), '2026-10-16T16:00:00Z')?.time).toBe('2026-10-16T18:00');
    expect(forecastFor(fixture('2026-12-01'), '2026-12-01T17:00:00+00:00')?.time).toBe('2026-12-01T18:00');
    // 23:30 UTC ist in Berlin schon der nächste Tag.
    expect(forecastFor(fixture('2026-10-17'), '2026-10-16T22:30:00Z')?.time).toBe('2026-10-17T00:00');
  });

  it('liefert null bei fehlender Stunde, kaputter Antwort oder ungültigem Zeitpunkt', () => {
    expect(forecastFor(fixture(), '2026-10-17T10:00')).toBeNull();
    expect(forecastFor(null, '2026-10-16T10:00')).toBeNull();
    expect(forecastFor('x', '2026-10-16T10:00')).toBeNull();
    expect(forecastFor({}, '2026-10-16T10:00')).toBeNull();
    expect(forecastFor({ hourly: { time: 'x' } }, '2026-10-16T10:00')).toBeNull();
    expect(forecastFor(fixture(), 'morgen')).toBeNull();
    expect(forecastFor(fixture(), '2026-13-40T10:00')).toBeNull();
    expect(forecastFor(fixture(), '2026-10-16T25:00')).toBeNull();
  });

  it('verlangt eine Temperatur, toleriert fehlende Nebenwerte', () => {
    const noTemp = { hourly: { time: ['2026-10-16T10:00'], temperature_2m: [null] } };
    expect(forecastFor(noTemp, '2026-10-16T10:00')).toBeNull();
    const partial = { hourly: { time: ['2026-10-16T10:00'], temperature_2m: [7.5], precipitation_probability: [null] } };
    expect(forecastFor(partial, '2026-10-16T10:00')).toEqual({
      time: '2026-10-16T10:00',
      temperature: 7.5,
      apparentTemperature: null,
      precipitationProbability: null,
      precipitation: null,
      windSpeed: null,
      weatherCode: null,
    });
  });
});

describe('Zeit-Helfer', () => {
  it('localMoment', () => {
    expect(localMoment('2026-10-16 09:05:00')).toEqual({ date: '2026-10-16', hour: 9 });
    expect(localMoment('2026-02-30T10:00')).toBeNull();
  });

  it('withinHorizon: heute bis 15 Tage voraus, nach Berliner Datum', () => {
    const now = new Date('2026-10-15T22:30:00Z'); // in Berlin bereits 16.10., 00:30
    expect(withinHorizon('2026-10-15', now)).toBe(false);
    expect(withinHorizon('2026-10-16', now)).toBe(true);
    expect(withinHorizon('2026-10-31', now)).toBe(true);
    expect(withinHorizon('2026-11-01', now)).toBe(false);
  });
});

describe('openMeteoUrl', () => {
  it('fragt nur Ort, Zeitzone und Tag ab', () => {
    const url = new URL(openMeteoUrl({ lat: 50.18, lon: 8.46 }, '2026-10-16'));
    expect(url.origin).toBe('https://api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('50.18');
    expect(url.searchParams.get('timezone')).toBe('Europe/Berlin');
    expect(url.searchParams.get('start_date')).toBe('2026-10-16');
    expect(url.searchParams.get('hourly')).toContain('precipitation_probability');
  });

  it('geht am Service Worker vorbei, damit eine ältere CSP des Workers nicht blockiert (SCRUM-151)', () => {
    expect(new URL(openMeteoUrl({ lat: 50.18, lon: 8.46 }, '2026-10-16')).searchParams.get('ngsw-bypass')).toBe('true');
  });
});

describe('WeatherService', () => {
  const koenigstein: Coordinates = { lat: 50.1812, lon: 8.4602 };
  let calls: { coords: Coordinates; date: string }[];
  let behaviour: () => Promise<unknown>;
  let clock: Date;

  function setup() {
    calls = [];
    behaviour = () => Promise.resolve(fixture());
    clock = new Date('2026-10-15T10:00:00Z');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: WeatherProvider,
          useValue: {
            fetchDay: (coords: Coordinates, date: string) => {
              calls.push({ coords, date });
              return behaviour();
            },
          } satisfies WeatherProvider,
        },
      ],
    });
    const service = TestBed.inject(WeatherService);
    service.now = () => clock;
    return service;
  }

  it('liefert ok mit Snapshot', async () => {
    const service = setup();
    const r = await service.forecast(koenigstein, '2026-10-16T18:00');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.snapshot.temperature).toBe(14);
    expect(calls[0].date).toBe('2026-10-16');
    expect(calls[0].coords).toEqual({ lat: 50.18, lon: 8.46 });
  });

  it('ruft pro Ort und Tag nur einmal ab, auch parallel und für andere Uhrzeiten', async () => {
    const service = setup();
    await Promise.all([service.forecast(koenigstein, '2026-10-16T10:00'), service.forecast(koenigstein, '2026-10-16T18:00')]);
    await service.forecast({ lat: 50.1849, lon: 8.4551 }, '2026-10-16T12:00'); // gleicher gerundeter Ort
    expect(calls).toHaveLength(1);
    await service.forecast(koenigstein, '2026-10-17T12:00');
    expect(calls).toHaveLength(2);
    await service.forecast({ lat: 48.1, lon: 11.5 }, '2026-10-16T12:00');
    expect(calls).toHaveLength(3);
  });

  it('ruft nach Ablauf der Cache-Zeit erneut ab', async () => {
    const service = setup();
    await service.forecast(koenigstein, '2026-10-16T10:00');
    clock = new Date(clock.getTime() + WEATHER_CACHE_MS - 1000);
    await service.forecast(koenigstein, '2026-10-16T10:00');
    expect(calls).toHaveLength(1);
    clock = new Date(clock.getTime() + 2000);
    await service.forecast(koenigstein, '2026-10-16T10:00');
    expect(calls).toHaveLength(2);
  });

  it('außerhalb des Horizonts oder bei ungültiger Eingabe: unavailable ohne Abruf', async () => {
    const service = setup();
    expect(await service.forecast(koenigstein, '2026-10-14T10:00')).toEqual({ status: 'unavailable', reason: 'outside-horizon' });
    expect(await service.forecast(koenigstein, '2027-01-01T10:00')).toEqual({ status: 'unavailable', reason: 'outside-horizon' });
    expect(await service.forecast(koenigstein, 'bald')).toEqual({ status: 'unavailable', reason: 'invalid-input' });
    expect(await service.forecast({ lat: NaN, lon: 8 }, '2026-10-16T10:00')).toEqual({ status: 'unavailable', reason: 'invalid-input' });
    expect(await service.forecast({ lat: 95, lon: 8 }, '2026-10-16T10:00')).toEqual({ status: 'unavailable', reason: 'invalid-input' });
    expect(calls).toHaveLength(0);
  });

  it('wirft bei Netzwerkfehlern nicht und cacht den Fehler nicht', async () => {
    const service = setup();
    behaviour = () => Promise.reject(new Error('offline'));
    expect(await service.forecast(koenigstein, '2026-10-16T10:00')).toEqual({ status: 'unavailable', reason: 'network' });
    behaviour = () => Promise.resolve(fixture());
    expect((await service.forecast(koenigstein, '2026-10-16T10:00')).status).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('behandelt unbrauchbare Antworten als unavailable und cacht sie nicht', async () => {
    const service = setup();
    behaviour = () => Promise.resolve({ error: true, reason: 'Parameter fehlt' });
    expect(await service.forecast(koenigstein, '2026-10-16T10:00')).toEqual({ status: 'unavailable', reason: 'bad-response' });
    behaviour = () => Promise.resolve(null);
    expect((await service.forecast(koenigstein, '2026-10-16T10:00')).status).toBe('unavailable');
    expect(calls).toHaveLength(2);
  });

  it('wirft auch bei synchron werfendem Anbieter nicht', async () => {
    const service = setup();
    behaviour = () => {
      throw new Error('boom');
    };
    expect(await service.forecast(koenigstein, '2026-10-16T10:00')).toEqual({ status: 'unavailable', reason: 'network' });
  });
});
