// Schulferien Schuljahr 2026/27 laut Ferienkalender der Kultusministerkonferenz (SCRUM-186):
// https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2026_27.pdf („Stand: 09.10.2025“, abgerufen am 30.10.2026).
// Aus dem PDF übertragen und Zeile für Zeile gegen das PDF geprüft. Angegeben ist der erste und letzte Ferientag;
// kursiv gedruckte Termine (schul- bzw. unterrichtsfreie Tage) tragen `schoolFreeDays: true`. Die Namen folgen den
// Spalten des Ferienkalenders. Hessen steht nicht hier (Quelle Hessisches Kultusministerium, school-holidays.ts).
import type { KmkSchoolYear } from './school-holidays';

export const KMK_2026_27: KmkSchoolYear = {
  // Baden-Württemberg
  BW: [
    { name: 'Herbstferien', from: '2026-10-26', to: '2026-10-30' },
    { name: 'Herbstferien', from: '2026-10-31', to: '2026-10-31', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-25', to: '2027-03-25', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-29' },
    { name: 'Sommerferien', from: '2027-07-29', to: '2027-09-11' },
  ],
  // Bayern
  BY: [
    { name: 'Herbstferien', from: '2026-11-02', to: '2026-11-06', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2026-12-24', to: '2027-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-02-08', to: '2027-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-28' },
    { name: 'Sommerferien', from: '2027-08-02', to: '2027-09-13' },
  ],
  // Berlin
  BE: [
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-31' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-19' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-14' },
  ],
  // Brandenburg
  BB: [
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-14' },
  ],
  // Bremen
  HB: [
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-08', to: '2027-08-18' },
  ],
  // Hamburg
  HH: [
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-01' },
    { name: 'Winterferien', from: '2027-01-29', to: '2027-01-29' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-01', to: '2027-03-12' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-14' },
    { name: 'Sommerferien', from: '2027-07-01', to: '2027-08-11' },
  ],
  // Mecklenburg-Vorpommern
  MV: [
    { name: 'Herbstferien', from: '2026-10-15', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-19' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-24', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-14', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-05', to: '2027-08-14' },
  ],
  // Niedersachsen
  NI: [
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-09' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-02' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-08', to: '2027-08-18' },
  ],
  // Nordrhein-Westfalen
  NW: [
    { name: 'Herbstferien', from: '2026-10-17', to: '2026-10-31' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-18', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-19', to: '2027-08-31' },
  ],
  // Rheinland-Pfalz
  RP: [
    { name: 'Herbstferien', from: '2026-10-05', to: '2026-10-16' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-02' },
    { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-06' },
  ],
  // Saarland
  SL: [
    { name: 'Herbstferien', from: '2026-10-05', to: '2026-10-16' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2026-12-31' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-09' },
    { name: 'Sommerferien', from: '2027-06-28', to: '2027-08-06' },
  ],
  // Sachsen
  SN: [
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-08', to: '2027-02-19' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-26', to: '2027-04-02' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-15', to: '2027-05-18' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
  ],
  // Sachsen-Anhalt
  ST: [
    { name: 'Herbstferien', from: '2026-10-19', to: '2026-10-30' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-03-27' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-15', to: '2027-05-22' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
  ],
  // Schleswig-Holstein
  SH: [
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-21', to: '2027-01-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-30', to: '2027-04-10' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Sommerferien', from: '2027-07-03', to: '2027-08-14' },
  ],
  // Thüringen
  TH: [
    { name: 'Herbstferien', from: '2026-10-12', to: '2026-10-24' },
    { name: 'Weihnachtsferien', from: '2026-12-23', to: '2027-01-02' },
    { name: 'Winterferien', from: '2027-02-01', to: '2027-02-06' },
    { name: 'Oster-/Frühjahrsferien', from: '2027-03-22', to: '2027-04-03' },
    { name: 'Himmelfahrt/Pfingsten', from: '2027-05-07', to: '2027-05-07' },
    { name: 'Sommerferien', from: '2027-07-10', to: '2027-08-20' },
  ],
};
