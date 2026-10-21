/**
 * Schulferien Hessen als feste Liste (kein Abruf aus dem Internet). Nur ein Hinweis für die Pausenplanung (SCRUM-149).
 *
 * Quelle: Hessisches Kultusministerium, „Ferientermine“ (https://kultus.hessen.de/schulsystem/ferien/ferientermine),
 * Schuljahre 2026/2027 bis 2029/2030. Die Seite nennt jeweils den ersten und letzten Ferientag.
 * Das Schuljahr 2025/2026 führt die Seite nicht mehr; die Termine bis 07.08.2026 stammen aus dem
 * Ferienkalender der Kultusministerkonferenz (https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2025_26.pdf),
 * die Sommerferien 2026 stehen zusätzlich in der Pressemitteilung des Ministeriums vom 13.12.2021.
 * Nicht enthalten: bewegliche Ferientage (legen die Staatlichen Schulämter fest) und Ferien anderer Bundesländer.
 */
export interface SchoolHoliday {
  name: string;
  /** Erster Ferientag (JJJJ-MM-TT). */
  from: string;
  /** Letzter Ferientag (JJJJ-MM-TT). */
  to: string;
}

/** Stand der Liste: Tag, an dem die Quellen geprüft wurden. */
export const SCHOOL_HOLIDAYS_CHECKED = '2026-10-21';

export const SCHOOL_HOLIDAYS_SOURCE = 'Hessisches Kultusministerium (Ferientermine), für 2026 bis zu den Sommerferien Kultusministerkonferenz';

/** Jahre, deren Ferien vollständig in der Liste stehen. Bei der jährlichen Aktualisierung hier ergänzen. */
export const COVERED_HOLIDAY_YEARS: readonly number[] = [2026, 2027, 2028, 2029];

export const SCHOOL_HOLIDAYS: readonly SchoolHoliday[] = [
  { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-10' },
  { name: 'Osterferien', from: '2026-03-30', to: '2026-04-10' },
  { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
  { name: 'Herbstferien', from: '2026-10-05', to: '2026-10-17' },
  { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-12' },
  { name: 'Osterferien', from: '2027-03-22', to: '2027-04-02' },
  { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-06' },
  { name: 'Herbstferien', from: '2027-10-04', to: '2027-10-16' },
  { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-11' },
  { name: 'Osterferien', from: '2028-04-03', to: '2028-04-14' },
  { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
  { name: 'Herbstferien', from: '2028-10-09', to: '2028-10-20' },
  { name: 'Weihnachtsferien', from: '2028-12-27', to: '2029-01-12' },
  { name: 'Osterferien', from: '2029-03-29', to: '2029-04-13' },
  { name: 'Sommerferien', from: '2029-07-16', to: '2029-08-24' },
  { name: 'Herbstferien', from: '2029-10-15', to: '2029-10-26' },
  { name: 'Weihnachtsferien', from: '2029-12-24', to: '2030-01-11' },
  // 2030: Herbstferien (Schuljahr 2030/31) noch nicht veröffentlicht, daher steht 2030 nicht in COVERED_HOLIDAY_YEARS.
  { name: 'Osterferien', from: '2030-04-08', to: '2030-04-22' },
  { name: 'Sommerferien', from: '2030-07-22', to: '2030-08-30' },
];

/**
 * Ferien, die das Jahr berühren (Weihnachtsferien über den Jahreswechsel stehen in beiden Jahren), nach Beginn sortiert.
 * `null`, wenn das Jahr nicht vollständig hinterlegt ist – dann darf nichts Halbes angezeigt werden.
 */
export function schoolHolidaysForYear(
  year: number,
  list: readonly SchoolHoliday[] = SCHOOL_HOLIDAYS,
  covered: readonly number[] = COVERED_HOLIDAY_YEARS,
): SchoolHoliday[] | null {
  if (!covered.includes(year)) return null;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return list.filter((holiday) => holiday.from <= end && holiday.to >= start).sort((a, b) => a.from.localeCompare(b.from));
}
