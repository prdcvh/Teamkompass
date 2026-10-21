/**
 * Saison im Jugendfußball: beginnt am 1. Juli (PO-Entscheidung zu SCRUM-199) und endet am 30. Juni des Folgejahres.
 * Beispiel: 20.10.2026 → Saison 2026/27 (ab 2026-07-01); 30.06.2027 gehört noch dazu, ab 01.07.2027 gilt die neue.
 */
export const SEASON_START_MONTH = 7;

/** Kalenderjahr, in dem die Saison von `date` begonnen hat (Juli bis Dezember: dasselbe Jahr, Januar bis Juni: das Vorjahr). */
export function seasonStartYear(date: Date): number {
  return date.getMonth() + 1 >= SEASON_START_MONTH ? date.getFullYear() : date.getFullYear() - 1;
}

/** Erster Tag der laufenden Saison als ISO-Datum (JJJJ-MM-TT), z. B. „2026-07-01“. */
export function seasonStartIso(now: Date = new Date()): string {
  return `${seasonStartYear(now)}-${String(SEASON_START_MONTH).padStart(2, '0')}-01`;
}
