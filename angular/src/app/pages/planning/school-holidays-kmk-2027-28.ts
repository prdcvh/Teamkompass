// Schulferien Schuljahr 2027/28 laut Ferienkalender der Kultusministerkonferenz (SCRUM-186):
// https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2027_28.pdf („Stand: 09.10.2025“, abgerufen am 30.10.2026).
// Aus dem PDF übertragen und Zeile für Zeile gegen das PDF geprüft. Angegeben ist der erste und letzte Ferientag;
// kursiv gedruckte Termine (schul- bzw. unterrichtsfreie Tage) tragen `schoolFreeDays: true`. Die Namen folgen den
// Spalten des Ferienkalenders. Hessen steht nicht hier (Quelle Hessisches Kultusministerium, school-holidays.ts).
import type { KmkSchoolYear } from './school-holidays';

export const KMK_2027_28: KmkSchoolYear = {
  // Baden-Württemberg
  BW: [
    { name: 'Herbstferien', from: '2027-11-02', to: '2027-11-06' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-13', to: '2028-04-13', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-18', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-17' },
    { name: 'Sommerferien', from: '2028-07-27', to: '2028-09-09' },
  ],
  // Bayern
  BY: [
    { name: 'Herbstferien', from: '2027-11-02', to: '2027-11-05', schoolFreeDays: true },
    { name: 'Weihnachtsferien', from: '2027-12-24', to: '2028-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-02-28', to: '2028-03-03' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-21' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-16' },
    { name: 'Sommerferien', from: '2028-07-31', to: '2028-09-11' },
  ],
  // Berlin
  BE: [
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-22', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26', schoolFreeDays: true },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-01', to: '2028-06-02' },
    { name: 'Sommerferien', from: '2028-07-01', to: '2028-08-12' },
  ],
  // Brandenburg
  BB: [
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-05' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Sommerferien', from: '2028-06-29', to: '2028-08-12' },
  ],
  // Bremen
  HB: [
    { name: 'Herbstferien', from: '2027-10-18', to: '2027-10-30' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-01' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-07-20', to: '2028-08-30' },
  ],
  // Hamburg
  HH: [
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-22' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-01-28', to: '2028-01-28' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-03-06', to: '2028-03-17' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-22', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
  ],
  // Mecklenburg-Vorpommern
  MV: [
    { name: 'Herbstferien', from: '2027-10-14', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-22', to: '2028-01-04' },
    { name: 'Winterferien', from: '2028-02-05', to: '2028-02-17' },
    { name: 'Winterferien', from: '2028-02-18', to: '2028-02-18', schoolFreeDays: true },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-12', to: '2028-04-21' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-02', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-06-26', to: '2028-08-05' },
  ],
  // Niedersachsen
  NI: [
    { name: 'Herbstferien', from: '2027-10-16', to: '2027-10-30' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Winterferien', from: '2028-01-31', to: '2028-02-01' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-06', to: '2028-06-06' },
    { name: 'Sommerferien', from: '2028-07-20', to: '2028-08-30' },
  ],
  // Nordrhein-Westfalen
  NW: [
    { name: 'Herbstferien', from: '2027-10-23', to: '2027-11-06' },
    { name: 'Weihnachtsferien', from: '2027-12-24', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Sommerferien', from: '2028-07-10', to: '2028-08-22' },
  ],
  // Rheinland-Pfalz
  RP: [
    { name: 'Herbstferien', from: '2027-10-04', to: '2027-10-15' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-07' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-21' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
  ],
  // Saarland
  SL: [
    { name: 'Herbstferien', from: '2027-10-04', to: '2027-10-15' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-21', to: '2028-02-29' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-12', to: '2028-04-21' },
    { name: 'Sommerferien', from: '2028-07-03', to: '2028-08-11' },
  ],
  // Sachsen
  SN: [
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-01' },
    { name: 'Winterferien', from: '2028-02-14', to: '2028-02-26' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-14', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26', schoolFreeDays: true },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
  ],
  // Sachsen-Anhalt
  ST: [
    { name: 'Herbstferien', from: '2027-10-18', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-20', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-07', to: '2028-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-10', to: '2028-04-22' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-06-03', to: '2028-06-10' },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
  ],
  // Schleswig-Holstein
  SH: [
    { name: 'Herbstferien', from: '2027-10-11', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2028-01-08' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-03', to: '2028-04-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-06-24', to: '2028-08-04' },
  ],
  // Thüringen
  TH: [
    { name: 'Herbstferien', from: '2027-10-09', to: '2027-10-23' },
    { name: 'Weihnachtsferien', from: '2027-12-23', to: '2027-12-31' },
    { name: 'Winterferien', from: '2028-02-07', to: '2028-02-12' },
    { name: 'Oster-/Frühjahrsferien', from: '2028-04-03', to: '2028-04-15' },
    { name: 'Himmelfahrt/Pfingsten', from: '2028-05-26', to: '2028-05-26' },
    { name: 'Sommerferien', from: '2028-07-22', to: '2028-09-01' },
  ],
};
