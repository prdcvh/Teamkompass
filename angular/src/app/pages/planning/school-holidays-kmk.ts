// Automatisch aus den KMK-PDFs übertragen und Zeile für Zeile gegen die PDFs geprüft (SCRUM-186).
// Quelle je Schuljahr: Ferienkalender der Kultusministerkonferenz, jeweils „Stand: 09.10.2025“:
//   2025/26: https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2025_26.pdf
//   2026/27: https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2026_27.pdf
//   2027/28: https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2027_28.pdf
//   2028/29: https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2028_29.pdf
// Die KMK nennt je Zeitraum den ersten und letzten Ferientag. Kursiv gedruckte Termine (schul- bzw. unterrichtsfreie Tage)
// tragen `schoolFreeDays: true`. Hessen steht nicht hier, sondern in school-holidays.ts (Quelle Hessisches Kultusministerium).
import type { FederalState } from '../../core/team-settings/federal-states';
import type { SchoolHoliday } from './school-holidays';

/** Ferien je Land laut KMK (ohne Hessen), nach Schuljahr gruppiert. */
export const KMK_SCHOOL_HOLIDAYS: Readonly<
  Record<Exclude<FederalState, 'HE'>, readonly SchoolHoliday[]>
> = {
  // Baden-Württemberg
  BW: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-27', to: '2025-10-30' },
    { name: 'Herbstferien', from: '2025-10-31', to: '2025-10-31', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-06-05' },
    { name: 'Sommerferien', from: '2026-07-30', to: '2026-09-12' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-26', to: '2026-10-30' },
    { name: 'Herbstferien', from: '2026-10-31', to: '2026-10-31', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-25', to: '2027-03-25', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-29' },
    { name: 'Sommerferien', from: '2027-07-29', to: '2027-09-11' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-11-02', to: '2027-11-06' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-13', to: '2028-04-13', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-18', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-17' },
    { name: 'Sommerferien', from: '2028-07-27', to: '2028-09-09' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-06-01' },
    { name: 'Sommerferien', from: '2029-07-26', to: '2029-09-08' },
  ],
  // Bayern
  BY: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-11-03', to: '2025-11-07', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-02-16', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-06-05' },
    { name: 'Sommerferien', from: '2026-08-03', to: '2026-09-14' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-11-02', to: '2026-11-06', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2026-12-24', to: '2027-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-02-08', to: '2027-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-28' },
    { name: 'Sommerferien', from: '2027-08-02', to: '2027-09-13' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-11-02', to: '2027-11-05', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2027-12-24', to: '2028-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-02-28', to: '2028-03-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-21' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-16' },
    { name: 'Sommerferien', from: '2028-07-31', to: '2028-09-11' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-11-03', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-02-12', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-06-01' },
    { name: 'Sommerferien', from: '2029-07-30', to: '2029-09-10' },
  ],
  // Berlin
  BE: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-11-01' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-22' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-31' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-19' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-14' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-22', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-01', to: '2028-06-02' },
    { name: 'Sommerferien', from: '2028-07-01', to: '2028-08-12' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-14' },
    { name: 'Weihnachtsferien', from: '2028-12-22', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-01-29', to: '2029-02-03' },
    { name: 'Winterferien', from: '2029-03-09', to: '2029-03-09', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-04-30', to: '2029-04-30', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-25' },
    { name: 'Sommerferien', from: '2029-07-01', to: '2029-08-11' },
  ],
  // Brandenburg
  BB: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-11-01' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-22' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-14' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Sommerferien', from: '2028-06-29', to: '2028-08-12' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-14' },
    { name: 'Weihnachtsferien', from: '2028-12-22', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-01-29', to: '2029-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-06-28', to: '2029-08-11' },
  ],
  // Bremen
  HB: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-23', to: '2026-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-02', to: '2026-08-12' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-08', to: '2027-08-18' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-18', to: '2027-10-30' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-01' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-07-20', to: '2028-08-30' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-02' },
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-04' },
    { name: 'Weihnachtsferien', from: '2028-12-27', to: '2029-01-06' },
    { name: 'Winterferien', from: '2029-02-01', to: '2029-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-19', to: '2029-04-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-04-30', to: '2029-04-30' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-07-19', to: '2029-08-29' },
  ],
  // Hamburg
  HH: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-31' },
    { name: 'Weihnachtsferien', from: '2025-12-17', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-01-30', to: '2026-01-30' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-02', to: '2026-03-13' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-11', to: '2026-05-15' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-19' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-01' },
    { name: 'Winterferien', from: '2027-01-29', to: '2027-01-29' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-01', to: '2027-03-12' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-14' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-11' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-22' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-28', to: '2028-01-28' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-03-06', to: '2028-03-17' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-22', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-13' },
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-10-30' },
    { name: 'Weihnachtsferien', from: '2028-12-18', to: '2028-12-29' },
    { name: 'Winterferien', from: '2029-02-02', to: '2029-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-05', to: '2029-03-16' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-18' },
    { name: 'Sommerferien', from: '2029-07-02', to: '2029-08-10' },
  ],
  // Mecklenburg-Vorpommern
  MV: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-02', to: '2025-10-02' },
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-24' },
    { name: 'Herbstferien', from: '2025-11-03', to: '2025-11-03' },
    { name: 'Weihnachtsferien', from: '2025-12-20', to: '2026-01-03' },
    { name: 'Winterferien', from: '2026-02-09', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-08' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-22', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-13', to: '2026-08-22' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-15', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-19' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-24', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-14', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-05', to: '2027-08-14' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-14', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-22', to: '2028-01-04' },
    { name: 'Winterferien', from: '2028-02-05', to: '2028-02-17' },
    { name: 'Winterferien', from: '2028-02-18', to: '2028-02-18', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-12', to: '2028-04-21' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-02', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-06-26', to: '2028-08-05' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-02' },
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-10-28' },
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-10-30' },
    { name: 'Weihnachtsferien', from: '2028-12-22', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-02-05', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-09', to: '2029-03-09' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-28', to: '2029-04-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-04-30', to: '2029-04-30' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-18', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-06-18', to: '2029-07-28' },
  ],
  // Niedersachsen
  NI: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-23', to: '2026-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-02', to: '2026-08-12' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-08', to: '2027-08-18' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-16', to: '2027-10-30' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-01' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-07-20', to: '2028-08-30' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-02' },
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-04' },
    { name: 'Weihnachtsferien', from: '2028-12-27', to: '2029-01-06' },
    { name: 'Winterferien', from: '2029-02-01', to: '2029-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-19', to: '2029-04-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-04-30', to: '2029-04-30' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-07-19', to: '2029-08-29' },
  ],
  // Nordrhein-Westfalen
  NW: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-20', to: '2026-09-01' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-17', to: '2026-10-31' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-19', to: '2027-08-31' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-23', to: '2027-11-06' },
    { name: 'Weihnachtsferien', from: '2027-12-24', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Sommerferien', from: '2028-07-10', to: '2028-08-22' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-04' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-07-02', to: '2029-08-14' },
  ],
  // Rheinland-Pfalz
  RP: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-24' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-05', to: '2026-10-16' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-06' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-04', to: '2027-10-15' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-21' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-09', to: '2028-10-20' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Sommerferien', from: '2029-07-16', to: '2029-08-24' },
  ],
  // Saarland
  SL: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-24' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-16', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-07', to: '2026-04-17' },
    { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-05', to: '2026-10-16' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2026-12-31' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-09' },
    { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-06' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-04', to: '2027-10-15' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-21', to: '2028-02-29' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-12', to: '2028-04-21' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-09', to: '2028-10-20' },
    { name: 'Weihnachtsferien', from: '2028-12-20', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-02-12', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-25' },
    { name: 'Sommerferien', from: '2029-07-16', to: '2029-08-24' },
  ],
  // Sachsen
  SN: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-06', to: '2025-10-18' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-09', to: '2026-02-21' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-03', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-19' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-26', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-15', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-01' },
    { name: 'Winterferien', from: '2028-02-14', to: '2028-02-26' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-14', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-03' },
    { name: 'Winterferien', from: '2029-02-05', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-29', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-19', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-07-21', to: '2029-08-31' },
  ],
  // Sachsen-Anhalt
  ST: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-01-31', to: '2026-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-04' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-29' },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-03-27' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-15', to: '2027-05-22' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-18', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-07', to: '2028-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-03', to: '2028-06-10' },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-02' },
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-02-05', to: '2029-02-10' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-03-31' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-04-30', to: '2029-04-30' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-25' },
    { name: 'Sommerferien', from: '2029-07-21', to: '2029-08-31' },
  ],
  // Schleswig-Holstein
  SH: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-30' },
    { name: 'Weihnachtsferien', from: '2025-12-19', to: '2026-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-26', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-15' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Sommerferien', from: '2027-07-03', to: '2027-08-14' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-03', to: '2028-04-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-06-24', to: '2028-08-04' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-16', to: '2028-10-30' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-23', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Sommerferien', from: '2029-06-23', to: '2029-08-03' },
  ],
  // Thüringen
  TH: [
    // Schuljahr 2025/26: KMK FER2025_26.pdf
    { name: 'Herbstferien', from: '2025-10-06', to: '2025-10-18' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-03' },
    { name: 'Winterferien', from: '2026-02-16', to: '2026-02-21' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-07', to: '2026-04-17' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
    // Schuljahr 2026/27: KMK FER2026_27.pdf
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
    // Schuljahr 2027/28: KMK FER2027_28.pdf
    { name: 'Herbstferien', from: '2027-10-09', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-07', to: '2028-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-03', to: '2028-04-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
    // Schuljahr 2028/29: KMK FER2028_29.pdf
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Winterferien', from: '2029-02-12', to: '2029-02-17' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Sommerferien', from: '2029-07-21', to: '2029-08-31' },
  ],
};
