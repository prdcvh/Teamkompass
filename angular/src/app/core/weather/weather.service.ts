import { Injectable, inject } from '@angular/core';
import { type Coordinates, type WeatherResult, forecastFor, localMoment, unavailable, validCoordinates, withinHorizon } from './weather';
import { WeatherProvider } from './weather-provider';

export const WEATHER_CACHE_MS = 30 * 60 * 1000;

interface CacheEntry {
  readonly at: number;
  readonly response: unknown;
}

/**
 * Wetter für Ort und Zeitpunkt. Gibt nie einen Fehler weiter, sondern `unavailable`. Antworten werden
 * pro gerundetem Ort und Tag 30 Minuten im Speicher gehalten; parallele Anfragen teilen sich einen Abruf.
 * Fehlschläge werden nicht gecacht, damit der nächste Versuch es erneut probiert.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly provider = inject(WeatherProvider);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /** Für Tests austauschbar. */
  now: () => Date = () => new Date();

  async forecast(coords: Coordinates, isoDateTime: string): Promise<WeatherResult> {
    if (!validCoordinates(coords)) return unavailable('invalid-input');
    const moment = localMoment(isoDateTime);
    if (!moment) return unavailable('invalid-input');
    if (!withinHorizon(moment.date, this.now())) return unavailable('outside-horizon');

    const key = `${coords.lat.toFixed(2)},${coords.lon.toFixed(2)}|${moment.date}`;
    let response: unknown;
    try {
      response = await this.load(key, coords, moment.date);
    } catch {
      return unavailable('network');
    }
    const snapshot = forecastFor(response, isoDateTime);
    return snapshot ? { status: 'ok', snapshot } : unavailable('bad-response');
  }

  private load(key: string, coords: Coordinates, date: string): Promise<unknown> {
    const hit = this.cache.get(key);
    if (hit && this.now().getTime() - hit.at < WEATHER_CACHE_MS) return Promise.resolve(hit.response);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const rounded = { lat: Number(coords.lat.toFixed(2)), lon: Number(coords.lon.toFixed(2)) };
    const request = this.provider
      .fetchDay(rounded, date)
      .then((response) => {
        // Nur brauchbare Antworten cachen: eine Antwort ohne Stundenwerte wäre sonst 30 Minuten "kaputt".
        if (forecastFor(response, `${date}T12:00`)) this.cache.set(key, { at: this.now().getTime(), response });
        return response;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }
}
