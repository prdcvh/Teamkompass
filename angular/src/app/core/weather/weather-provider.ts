import { Injectable } from '@angular/core';
import { type Coordinates, WEATHER_TIME_ZONE } from './weather';

/** Austauschbarer Wetteranbieter (Open-Meteo jetzt, später z. B. DWD oder eine Cloud Function). */
export abstract class WeatherProvider {
  /** Liefert die rohe Stundenvorhersage (Open-Meteo-Form) für einen Tag, `YYYY-MM-DD`. Wirft bei Fehlern. */
  abstract fetchDay(coords: Coordinates, date: string): Promise<unknown>;
}

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const HOURLY = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'wind_speed_10m', 'weather_code'];

export function openMeteoUrl(coords: Coordinates, date: string): string {
  const params = new URLSearchParams({
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    hourly: HOURLY.join(','),
    timezone: WEATHER_TIME_ZONE,
    start_date: date,
    end_date: date,
    // Am Service Worker vorbei: Ein unter einer älteren CSP installierter Worker würde den Aufruf sonst blockieren (SCRUM-151).
    'ngsw-bypass': 'true',
  });
  return `${OPEN_METEO_FORECAST_URL}?${params.toString()}`;
}

export const OPEN_METEO_TIMEOUT_MS = 8000;

/** Open-Meteo direkt aus dem Browser; braucht `connect-src https://api.open-meteo.com` in der CSP. */
@Injectable({ providedIn: 'root' })
export class OpenMeteoProvider extends WeatherProvider {
  async fetchDay(coords: Coordinates, date: string): Promise<unknown> {
    const response = await fetch(openMeteoUrl(coords, date), { signal: AbortSignal.timeout(OPEN_METEO_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Open-Meteo antwortete mit ${response.status}`);
    return response.json();
  }
}
