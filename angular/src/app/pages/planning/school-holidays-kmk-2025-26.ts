// Schulferien Schuljahr 2025/26 laut Ferienkalender der Kultusministerkonferenz (SCRUM-186):
// https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2025_26.pdf („Stand: 09.10.2025“, abgerufen am 30.10.2026).
// Aus dem PDF übertragen und Zeile für Zeile gegen das PDF geprüft. Angegeben ist der erste und letzte Ferientag;
// kursiv gedruckte Termine (schul- bzw. unterrichtsfreie Tage) tragen `schoolFreeDays: true`. Die Namen folgen den
// Spalten des Ferienkalenders. Hessen steht nicht hier (Quelle Hessisches Kultusministerium, school-holidays.ts).
import type { KmkSchoolYear } from './school-holidays';

export const KMK_2025_26: KmkSchoolYear = {
  // Baden-Württemberg
  BW: [
    { name: 'Herbstferien', from: '2025-10-27', to: '2025-10-30' },
    { name: 'Herbstferien', from: '2025-10-31', to: '2025-10-31', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-06-05' },
    { name: 'Sommerferien', from: '2026-07-30', to: '2026-09-12' },
  ],
  // Bayern
  BY: [
    { name: 'Herbstferien', from: '2025-11-03', to: '2025-11-07', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-02-16', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-06-05' },
    { name: 'Sommerferien', from: '2026-08-03', to: '2026-09-14' },
  ],
  // Berlin
  BE: [
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-11-01' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-22' },
  ],
  // Brandenburg
  BB: [
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-11-01' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-22' },
  ],
  // Bremen
  HB: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-23', to: '2026-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-02', to: '2026-08-12' },
  ],
  // Hamburg
  HH: [
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-31' },
    { name: 'Weihnachtsferien', from: '2025-12-17', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-01-30', to: '2026-01-30' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-02', to: '2026-03-13' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-11', to: '2026-05-15' },
    { name: 'Sommerferien', from: '2026-07-09', to: '2026-08-19' },
  ],
  // Mecklenburg-Vorpommern
  MV: [
    { name: 'Herbstferien', from: '2025-10-02', to: '2025-10-02' },
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-24' },
    { name: 'Herbstferien', from: '2025-11-03', to: '2025-11-03' },
    { name: 'Weihnachtsferien', from: '2025-12-20', to: '2026-01-03' },
    { name: 'Winterferien', from: '2026-02-09', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-08' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-22', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-13', to: '2026-08-22' },
  ],
  // Niedersachsen
  NI: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-02-02', to: '2026-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-23', to: '2026-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-02', to: '2026-08-12' },
  ],
  // Nordrhein-Westfalen
  NW: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-11' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-26' },
    { name: 'Sommerferien', from: '2026-07-20', to: '2026-09-01' },
  ],
  // Rheinland-Pfalz
  RP: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-24' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-10' },
    { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
  ],
  // Saarland
  SL: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-24' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-16', to: '2026-02-20' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-07', to: '2026-04-17' },
    { name: 'Sommerferien', from: '2026-06-29', to: '2026-08-07' },
  ],
  // Sachsen
  SN: [
    { name: 'Herbstferien', from: '2025-10-06', to: '2025-10-18' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-02' },
    { name: 'Winterferien', from: '2026-02-09', to: '2026-02-21' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-03', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
  ],
  // Sachsen-Anhalt
  ST: [
    { name: 'Herbstferien', from: '2025-10-13', to: '2025-10-25' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-05' },
    { name: 'Winterferien', from: '2026-01-31', to: '2026-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-30', to: '2026-04-04' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-26', to: '2026-05-29' },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
  ],
  // Schleswig-Holstein
  SH: [
    { name: 'Herbstferien', from: '2025-10-20', to: '2025-10-30' },
    { name: 'Weihnachtsferien', from: '2025-12-19', to: '2026-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-03-26', to: '2026-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15' },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-15' },
  ],
  // Thüringen
  TH: [
    { name: 'Herbstferien', from: '2025-10-06', to: '2025-10-18' },
    { name: 'Weihnachtsferien', from: '2025-12-22', to: '2026-01-03' },
    { name: 'Winterferien', from: '2026-02-16', to: '2026-02-21' },
    { name: 'Oster-/Frühjahrsferien', from: '2026-04-07', to: '2026-04-17' },
    { name: 'Himmelfahrt/Pfingsten', from: '2026-05-15', to: '2026-05-15', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2026-07-04', to: '2026-08-14' },
  ],
};
