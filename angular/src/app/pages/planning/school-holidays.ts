import { DEFAULT_FEDERAL_STATE, type FederalState } from '../../core/team-settings/federal-states';
import { KMK_SCHOOL_HOLIDAYS } from './school-holidays-kmk';

/**
 * Schulferien aller 16 Bundesländer als feste Liste (kein Abruf aus dem Internet). Nur ein Hinweis für die
 * Pausenplanung (SCRUM-149, für alle Länder SCRUM-186). Welches Land gilt, steht in den Teameinstellungen.
 *
 * Quellen:
 * - Hessen: Hessisches Kultusministerium, „Ferientermine“ (https://kultus.hessen.de/schulsystem/ferien/ferientermine),
 *   Schuljahre 2026/2027 bis 2029/2030 (am 30.10.2026 erneut abgerufen und verglichen, alle Termine gleich). Das
 *   Schuljahr 2025/2026 führt die Seite nicht mehr; die Termine bis 07.08.2026 stammen aus dem Ferienkalender der
 *   Kultusministerkonferenz (FER2025_26.pdf). Die KMK-Termine 2025/26 bis 2028/29 für Hessen stimmen mit dieser Liste
 *   überein (Test in school-holidays.spec.ts).
 * - Alle anderen Länder: Ferienkalender der Kultusministerkonferenz, Schuljahre 2025/26 bis 2028/29
 *   (school-holidays-kmk.ts, Quelle je Schuljahr dort). Neuere Schuljahre hatte die KMK am 30.10.2026 noch nicht
 *   veröffentlicht (FER2029_30.pdf gab es nicht).
 * Nicht enthalten: bewegliche Ferientage (legen Länder bzw. Schulen fest).
 *
 * Jährliche Aktualisierung (früher SCRUM-160, jetzt für alle Länder): neues KMK-PDF (bzw. die Seite des Hessischen
 * Kultusministeriums) lesen, Termine in school-holidays-kmk.ts bzw. hier ergänzen, `covered` und
 * SCHOOL_HOLIDAYS_CHECKED anpassen, Stichproben-Tests in school-holidays.spec.ts ergänzen.
 */
export interface SchoolHoliday {
  name: string;
  /** Erster Ferientag (JJJJ-MM-TT). */
  from: string;
  /** Letzter Ferientag (JJJJ-MM-TT). */
  to: string;
  /** In der KMK-Liste kursiv: schul- bzw. unterrichtsfreie Tage statt regulärer Ferien. */
  schoolFreeDays?: boolean;
}

/** Ferien eines Landes samt Quelle und den Jahren, die vollständig hinterlegt sind. */
export interface StateSchoolHolidays {
  readonly list: readonly SchoolHoliday[];
  /** Kalenderjahre, deren Ferien vollständig in der Liste stehen. Bei der jährlichen Aktualisierung ergänzen. */
  readonly covered: readonly number[];
  readonly source: string;
  /** Zusatzhinweis der Quelle für dieses Land (z. B. Sonderregeln für Inseln). */
  readonly note?: string;
}

/** Stand der Liste: Tag, an dem die Quellen geprüft wurden. */
export const SCHOOL_HOLIDAYS_CHECKED = '2026-10-30';

const KMK_SOURCE = 'Ferienkalender der Kultusministerkonferenz, Schuljahre 2025/26 bis 2028/29';
/** Ab 2029 fehlen bei der KMK noch Herbst- und Weihnachtsferien (Schuljahr 2029/30). */
const KMK_COVERED: readonly number[] = [2026, 2027, 2028];

const HESSEN: readonly SchoolHoliday[] = [
  // Schuljahr 2025/26 (KMK FER2025_26.pdf)
  { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-10' },
  { name: 'Osterferien', from: '2026-03-30', to: '2026-04-10' },
  { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
  // Schuljahre 2026/27 bis 2029/30 (Hessisches Kultusministerium)
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
  // 2030: Herbstferien (Schuljahr 2030/31) noch nicht veröffentlicht, daher ist 2030 nicht vollständig.
  { name: 'Osterferien', from: '2030-04-08', to: '2030-04-22' },
  { name: 'Sommerferien', from: '2030-07-22', to: '2030-08-30' },
];

function kmk(state: Exclude<FederalState, 'HE'>, note?: string): StateSchoolHolidays {
  return { list: KMK_SCHOOL_HOLIDAYS[state], covered: KMK_COVERED, source: KMK_SOURCE, note };
}

export const SCHOOL_HOLIDAYS_BY_STATE: Readonly<Record<FederalState, StateSchoolHolidays>> = {
  BW: kmk('BW'),
  BY: kmk('BY'),
  BE: kmk('BE'),
  BB: kmk('BB'),
  HB: kmk('HB'),
  HH: kmk('HH'),
  HE: {
    list: HESSEN,
    covered: [2026, 2027, 2028, 2029],
    source:
      'Hessisches Kultusministerium (Ferientermine), für 2026 bis zu den Sommerferien Kultusministerkonferenz',
  },
  MV: kmk('MV'),
  NI: kmk('NI'),
  NW: kmk('NW'),
  RP: kmk('RP'),
  SL: kmk('SL'),
  SN: kmk('SN'),
  ST: kmk('ST'),
  // Fußnote im KMK-Ferienkalender.
  SH: kmk(
    'SH',
    'Auf Sylt, Föhr, Amrum, Helgoland und den Halligen gelten für Sommer- und Herbstferien Sonderregelungen.',
  ),
  TH: kmk('TH'),
};

/**
 * Ferien, die das Jahr berühren (Weihnachtsferien über den Jahreswechsel stehen in beiden Jahren), nach Beginn sortiert.
 * `null`, wenn das Jahr für das Land nicht vollständig hinterlegt ist – dann darf nichts Halbes angezeigt werden.
 */
export function schoolHolidaysForYear(
  year: number,
  holidays: StateSchoolHolidays = SCHOOL_HOLIDAYS_BY_STATE[DEFAULT_FEDERAL_STATE],
): SchoolHoliday[] | null {
  if (!holidays.covered.includes(year)) return null;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return holidays.list
    .filter((holiday) => holiday.from <= end && holiday.to >= start)
    .sort((a, b) => a.from.localeCompare(b.from));
}
