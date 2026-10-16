import { type LocationCoords, MAX_TEXT_LENGTH, isLocationCoords } from '../events/event';

/** Standardort (Heimplatz) des Teams: Ortstext wie im Event und – falls gewählt – Koordinaten. */
export interface DefaultLocation {
  readonly text: string;
  readonly coords: LocationCoords | null;
}

/** Dokument `meta/settings` → Standardort; null, wenn keiner gespeichert (oder das Dokument unbrauchbar) ist. */
export function defaultLocationFromDoc(doc: Readonly<Record<string, unknown>> | null): DefaultLocation | null {
  const raw = doc?.['defaultLocation'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { text, coords } = raw as Record<string, unknown>;
  const clean = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT_LENGTH) : '';
  const place = isLocationCoords(coords) ? { lat: coords.lat, lon: coords.lon, name: coords.name } : null;
  return clean === '' && place === null ? null : { text: clean, coords: place };
}

export function docFromDefaultLocation(location: DefaultLocation | null): Record<string, unknown> {
  return { defaultLocation: location === null ? null : { text: location.text.trim(), coords: location.coords } };
}
