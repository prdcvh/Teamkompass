// Schulferien Schuljahr 2028/29 laut Ferienkalender der Kultusministerkonferenz (SCRUM-186):
// https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2028_29.pdf („Stand: 09.10.2025“, abgerufen am 30.10.2026).
// Aus dem PDF übertragen und Zeile für Zeile gegen das PDF geprüft. Angegeben ist der erste und letzte Ferientag;
// kursiv gedruckte Termine (schul- bzw. unterrichtsfreie Tage) tragen `schoolFreeDays: true`. Die Namen folgen den
// Spalten des Ferienkalenders. Hessen steht nicht hier (Quelle Hessisches Kultusministerium, school-holidays.ts).
import type { KmkSchoolYear } from './school-holidays';

export const KMK_2028_29: KmkSchoolYear = {
  // Baden-Württemberg
  BW: [
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-06-01' },
    { name: 'Sommerferien', from: '2029-07-26', to: '2029-09-08' },
  ],
  // Bayern
  BY: [
    { name: 'Herbstferien', from: '2028-10-30', to: '2028-11-03', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-02-12', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-06-01' },
    { name: 'Sommerferien', from: '2029-07-30', to: '2029-09-10' },
  ],
  // Berlin
  BE: [
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
    { name: 'Herbstferien', from: '2028-10-02', to: '2028-10-14' },
    { name: 'Weihnachtsferien', from: '2028-12-22', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-01-29', to: '2029-02-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-06-28', to: '2029-08-11' },
  ],
  // Bremen
  HB: [
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
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-04' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-22' },
    { name: 'Sommerferien', from: '2029-07-02', to: '2029-08-14' },
  ],
  // Rheinland-Pfalz
  RP: [
    { name: 'Herbstferien', from: '2028-10-09', to: '2028-10-20' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Sommerferien', from: '2029-07-16', to: '2029-08-24' },
  ],
  // Saarland
  SL: [
    { name: 'Herbstferien', from: '2028-10-09', to: '2028-10-20' },
    { name: 'Weihnachtsferien', from: '2028-12-20', to: '2029-01-02' },
    { name: 'Winterferien', from: '2029-02-12', to: '2029-02-16' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-22', to: '2029-05-25' },
    { name: 'Sommerferien', from: '2029-07-16', to: '2029-08-24' },
  ],
  // Sachsen
  SN: [
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
    { name: 'Herbstferien', from: '2028-10-16', to: '2028-10-30' },
    { name: 'Weihnachtsferien', from: '2028-12-21', to: '2029-01-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-23', to: '2029-04-06' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Sommerferien', from: '2029-06-23', to: '2029-08-03' },
  ],
  // Thüringen
  TH: [
    { name: 'Herbstferien', from: '2028-10-23', to: '2028-11-03' },
    { name: 'Weihnachtsferien', from: '2028-12-23', to: '2029-01-05' },
    { name: 'Winterferien', from: '2029-02-12', to: '2029-02-17' },
    { name: 'Oster-/Frühjahrsferien', from: '2029-03-26', to: '2029-04-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2029-05-11', to: '2029-05-11' },
    { name: 'Sommerferien', from: '2029-07-21', to: '2029-08-31' },
  ],
};
