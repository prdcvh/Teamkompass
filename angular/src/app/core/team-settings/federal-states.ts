/** Bundesland des Teams (SCRUM-186): bestimmt, welche Schulferien die Planung als Hinweis zeigt. */
export const FEDERAL_STATES = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
] as const;

export type FederalState = (typeof FEDERAL_STATES)[number]['code'];

/** Bestehende Teams ohne gespeichertes Bundesland gelten als Hessen (keine Datenmigration nötig). */
export const DEFAULT_FEDERAL_STATE: FederalState = 'HE';

export function isFederalState(value: unknown): value is FederalState {
  return FEDERAL_STATES.some((state) => state.code === value);
}

export function federalStateName(code: FederalState): string {
  return FEDERAL_STATES.find((state) => state.code === code)?.name ?? code;
}
