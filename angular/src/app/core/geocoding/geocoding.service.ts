import { Injectable } from '@angular/core';
import { MAX_COORDS_NAME_LENGTH, type LocationCoords } from '../events/event';

/** Ein Treffer der Ortssuche. */
export interface GeocodedPlace {
  readonly name: string;
  /** Bundesland/Region, falls bekannt (sonst leer). */
  readonly region: string;
  readonly country: string;
  readonly lat: number;
  readonly lon: number;
}

export type GeocodingFailure = 'invalid-input' | 'offline' | 'network' | 'bad-response';

export type GeocodingResult =
  | { readonly status: 'ok'; readonly places: readonly GeocodedPlace[] }
  | { readonly status: 'error'; readonly reason: GeocodingFailure };

export const GEOCODING_MAX_RESULTS = 5;
export const GEOCODING_MIN_QUERY = 2;
export const GEOCODING_TIMEOUT_MS = 8000;
export const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Austauschbare Ortssuche. Wird nur auf Nutzeraktion hin aufgerufen und bekommt nur den Ortstext
 * und die Sprache – nie Spieler- oder Teamdaten.
 */
@Injectable({ providedIn: 'root', useFactory: () => new OpenMeteoGeocodingService() })
export abstract class GeocodingService {
  abstract search(query: string, language?: string): Promise<GeocodingResult>;
}

/** Verständliche Meldung für die Oberfläche. */
export function geocodingMessage(reason: GeocodingFailure): string {
  switch (reason) {
    case 'invalid-input':
      return `Bitte mindestens ${GEOCODING_MIN_QUERY} Zeichen eingeben.`;
    case 'offline':
      return 'Du bist offline. Die Ortssuche braucht eine Internetverbindung; der Ort bleibt als Text gespeichert.';
    case 'network':
      return 'Die Ortssuche ist gerade nicht erreichbar. Bitte später erneut versuchen; der Ort kann als Text gespeichert werden.';
    case 'bad-response':
      return 'Die Ortssuche hat eine unerwartete Antwort geliefert. Der Ort kann als Text gespeichert werden.';
  }
}

/** Anzeigename eines Treffers, z. B. „Königstein im Taunus, Hessen, Deutschland“. */
export function placeLabel(place: GeocodedPlace): string {
  return [place.name, place.region, place.country].filter((part, index, all) => part !== '' && all.indexOf(part) === index).join(', ');
}

/** Treffer → im Event gespeicherter Ort (Name auf die erlaubte Länge gekürzt). */
export function coordsFromPlace(place: GeocodedPlace): LocationCoords {
  return { lat: place.lat, lon: place.lon, name: placeLabel(place).slice(0, MAX_COORDS_NAME_LENGTH) };
}

export function openMeteoGeocodingUrl(query: string, language: string): string {
  const params = new URLSearchParams({ name: query, count: String(GEOCODING_MAX_RESULTS), language, format: 'json' });
  return `${OPEN_METEO_GEOCODING_URL}?${params.toString()}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Rohe Open-Meteo-Antwort → höchstens 5 gültige Treffer; null, wenn die Antwort keine Form hat. */
export function placesFromResponse(response: unknown): GeocodedPlace[] | null {
  if (typeof response !== 'object' || response === null) return null;
  const results = (response as { results?: unknown }).results;
  if (results === undefined) return []; // Open-Meteo lässt `results` bei „kein Treffer“ weg
  if (!Array.isArray(results)) return null;
  const places: GeocodedPlace[] = [];
  for (const entry of results) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const lat = raw['latitude'];
    const lon = raw['longitude'];
    const name = text(raw['name']);
    if (name === '' || typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    places.push({ name, region: text(raw['admin1']), country: text(raw['country']), lat, lon });
    if (places.length === GEOCODING_MAX_RESULTS) break;
  }
  return places;
}

/** Open-Meteo-Geocoding direkt aus dem Browser; braucht `connect-src https://geocoding-api.open-meteo.com` in der CSP (SCRUM-96). */
@Injectable()
export class OpenMeteoGeocodingService extends GeocodingService {
  async search(query: string, language = 'de'): Promise<GeocodingResult> {
    const name = query.trim();
    if (name.length < GEOCODING_MIN_QUERY) return { status: 'error', reason: 'invalid-input' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'error', reason: 'offline' };
    let body: unknown;
    try {
      const response = await fetch(openMeteoGeocodingUrl(name, language), { signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS) });
      if (!response.ok) return { status: 'error', reason: 'network' };
      body = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) return { status: 'error', reason: 'bad-response' };
      return { status: 'error', reason: 'network' };
    }
    const places = placesFromResponse(body);
    return places === null ? { status: 'error', reason: 'bad-response' } : { status: 'ok', places };
  }
}
