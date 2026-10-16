/**
 * Wetter-Datenmodell und reine Funktionen (SCRUM-96). Der Anbieter (Open-Meteo) ist nur hier und im
 * Provider bekannt; Oberfläche und Service arbeiten ausschließlich mit `WeatherSnapshot`.
 */

export const WEATHER_TIME_ZONE = 'Europe/Berlin';
/** Open-Meteo liefert stündliche Vorhersagen für höchstens 16 Tage; darüber hinaus gibt es nichts. */
export const FORECAST_HORIZON_DAYS = 16;

/** Pflicht-Hinweis laut Open-Meteo-Lizenz (CC BY 4.0); die Oberfläche zeigt ihn neben dem Wetter. */
export const WEATHER_ATTRIBUTION = { text: 'Wetterdaten von Open-Meteo.com', url: 'https://open-meteo.com/' } as const;

export interface WeatherSnapshot {
  /** Stunde der Vorhersage, lokale Zeit Europe/Berlin, z. B. `2026-10-16T18:00`. */
  readonly time: string;
  readonly temperature: number;
  readonly apparentTemperature: number | null;
  /** Niederschlagswahrscheinlichkeit in Prozent. */
  readonly precipitationProbability: number | null;
  /** Niederschlagsmenge in mm pro Stunde. */
  readonly precipitation: number | null;
  /** Windgeschwindigkeit in km/h. */
  readonly windSpeed: number | null;
  /** WMO-Wettercode. */
  readonly weatherCode: number | null;
}

export type UnavailableReason = 'invalid-input' | 'outside-horizon' | 'network' | 'bad-response';

export type WeatherResult =
  | { readonly status: 'ok'; readonly snapshot: WeatherSnapshot }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason };

export const unavailable = (reason: UnavailableReason): WeatherResult => ({ status: 'unavailable', reason });

export interface Coordinates {
  readonly lat: number;
  readonly lon: number;
}

export const validCoordinates = (c: Coordinates): boolean =>
  Number.isFinite(c.lat) && Number.isFinite(c.lon) && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180;

export interface LocalMoment {
  /** `YYYY-MM-DD` in Europe/Berlin. */
  readonly date: string;
  /** Stunde 0-23 in Europe/Berlin. */
  readonly hour: number;
}

const LOCAL_ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

const berlinFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: WEATHER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function berlinMoment(date: Date): LocalMoment {
  const parts = Object.fromEntries(berlinFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts['year']}-${parts['month']}-${parts['day']}`, hour: Number(parts['hour']) };
}

/** Wandelt einen ISO-Zeitpunkt in Datum und Stunde der Zeitzone Europe/Berlin; ohne Zeitzonenangabe gilt er als Berliner Ortszeit. */
export function localMoment(iso: string): LocalMoment | null {
  const text = iso.trim();
  if (!HAS_OFFSET.test(text)) {
    const m = LOCAL_ISO.exec(text);
    if (!m) return null;
    const hour = Number(m[2]);
    const probe = new Date(`${m[1]}T00:00:00Z`);
    if (hour > 23 || Number(m[3]) > 59 || Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== m[1]) return null;
    return { date: m[1], hour };
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : berlinMoment(parsed);
}

export const berlinNow = (now: Date): LocalMoment => berlinMoment(now);

const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Liegt der Tag zwischen heute und dem Ende des Vorhersagehorizonts (Berliner Datum)? */
export function withinHorizon(date: string, now: Date): boolean {
  const diff = dayNumber(date) - dayNumber(berlinNow(now).date);
  return diff >= 0 && diff < FORECAST_HORIZON_DAYS;
}

const numberAt = (values: unknown, index: number): number | null => {
  if (!Array.isArray(values)) return null;
  const v: unknown = values[index];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/**
 * Wählt aus einer Open-Meteo-Antwort (`hourly`, Zeitzone Europe/Berlin) die Stunde, in der der Zeitpunkt
 * liegt. Liefert `null`, wenn die Antwort unbrauchbar ist, die Stunde fehlt oder keine Temperatur hat.
 */
export function forecastFor(response: unknown, isoDateTime: string): WeatherSnapshot | null {
  const moment = localMoment(isoDateTime);
  if (!moment || typeof response !== 'object' || response === null) return null;
  const hourly = (response as { hourly?: unknown }).hourly;
  if (typeof hourly !== 'object' || hourly === null) return null;
  const h = hourly as Record<string, unknown>;
  if (!Array.isArray(h['time'])) return null;
  const wanted = `${moment.date}T${String(moment.hour).padStart(2, '0')}:00`;
  const index = h['time'].indexOf(wanted);
  if (index < 0) return null;
  const temperature = numberAt(h['temperature_2m'], index);
  if (temperature === null) return null;
  return {
    time: wanted,
    temperature,
    apparentTemperature: numberAt(h['apparent_temperature'], index),
    precipitationProbability: numberAt(h['precipitation_probability'], index),
    precipitation: numberAt(h['precipitation'], index),
    windSpeed: numberAt(h['wind_speed_10m'], index),
    weatherCode: numberAt(h['weather_code'], index),
  };
}
