import { type LocationCoords, MAX_TEXT_LENGTH, isLocationCoords } from '../events/event';
import { DEFAULT_FEDERAL_STATE, type FederalState, isFederalState } from './federal-states';

/**
 * Standardort des Teams für das Wetter (SCRUM-153): gilt für jedes Event ohne über „Ort suchen“ gewählten Ort,
 * z. B. Trainings mit „Kunstrasen - heim“. Laut PO immer Königstein im Taunus.
 */
export const TEAM_HOME_LOCATION: LocationCoords = { lat: 50.17943, lon: 8.47132, name: 'Königstein im Taunus, Hessen' };
/** Kurzname für die Anzeige am Wetter. */
export const TEAM_HOME_SHORT_NAME = 'Königstein';

/** Ort fürs Wetter: der gewählte Ort des Events, sonst der Standardort des Teams. */
export function weatherLocation(coords: LocationCoords | null): LocationCoords {
  return coords ?? TEAM_HOME_LOCATION;
}

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

/** Dokument `meta/settings` → Bundesland; fehlt das Feld (bestehende Teams) oder ist es unbekannt, gilt Hessen (SCRUM-186). */
export function federalStateFromDoc(doc: Readonly<Record<string, unknown>> | null): FederalState {
  const raw = doc?.['federalState'];
  return isFederalState(raw) ? raw : DEFAULT_FEDERAL_STATE;
}

export function docFromFederalState(state: FederalState): Record<string, unknown> {
  return { federalState: state };
}
