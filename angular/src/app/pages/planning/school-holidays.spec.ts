import { TestBed } from '@angular/core/testing';
import { FEDERAL_STATES, type FederalState } from '../../core/team-settings/federal-states';
import {
  SCHOOL_HOLIDAYS_BY_STATE,
  type SchoolHoliday,
  schoolHolidaysForYear,
} from './school-holidays';
import { SchoolHolidaysHint } from './school-holidays-hint';

const HESSEN = SCHOOL_HOLIDAYS_BY_STATE.HE;

function has(state: FederalState, from: string, to: string, schoolFreeDays = false): boolean {
  return SCHOOL_HOLIDAYS_BY_STATE[state].list.some(
    (holiday: SchoolHoliday) =>
      holiday.from === from &&
      holiday.to === to &&
      (holiday.schoolFreeDays ?? false) === schoolFreeDays,
  );
}

describe('Schulferien (Hinweis)', () => {
  afterEach(() => vi.useRealTimers());

  it('wählt je Jahr die passenden Ferien, sortiert nach Beginn (Hessen)', () => {
    const names = (year: number) =>
      schoolHolidaysForYear(year, HESSEN)?.map((holiday) => `${holiday.name} ${holiday.from}`);
    expect(names(2026)).toEqual([
      'Weihnachtsferien 2025-12-22',
      'Osterferien 2026-03-30',
      'Sommerferien 2026-06-29',
      'Herbstferien 2026-10-05',
      'Weihnachtsferien 2026-12-23',
    ]);
    expect(names(2027)).toEqual([
      'Weihnachtsferien 2026-12-23',
      'Osterferien 2027-03-22',
      'Sommerferien 2027-06-28',
      'Herbstferien 2027-10-04',
      'Weihnachtsferien 2027-12-23',
    ]);
    // Ohne Land gilt Hessen (bestehende Teams ohne gespeichertes Bundesland).
    expect(schoolHolidaysForYear(2027)).toEqual(schoolHolidaysForYear(2027, HESSEN));
  });

  it('zeigt Ferien über den Jahreswechsel in beiden Jahren', () => {
    const in2026 = schoolHolidaysForYear(2026, HESSEN)!.filter(
      (holiday) => holiday.to === '2027-01-12',
    );
    const in2027 = schoolHolidaysForYear(2027, HESSEN)!.filter(
      (holiday) => holiday.to === '2027-01-12',
    );
    expect(in2026).toHaveLength(1);
    expect(in2027).toHaveLength(1);
  });

  it('liefert für ein nicht hinterlegtes Jahr null statt halber Daten', () => {
    expect(schoolHolidaysForYear(2025, HESSEN)).toBeNull();
    // Ostern/Sommer 2030 stehen schon in der Liste, aber 2030 ist erst vollständig, wenn auch die Herbstferien da sind.
    expect(HESSEN.list.some((holiday) => holiday.from.startsWith('2030-'))).toBe(true);
    expect(schoolHolidaysForYear(2030, HESSEN)).toBeNull();
    // Die KMK hat das Schuljahr 2029/30 noch nicht veröffentlicht: 2029 fehlen Herbst- und Weihnachtsferien.
    expect(
      SCHOOL_HOLIDAYS_BY_STATE.BY.list.some((holiday) => holiday.from.startsWith('2029-')),
    ).toBe(true);
    expect(schoolHolidaysForYear(2029, SCHOOL_HOLIDAYS_BY_STATE.BY)).toBeNull();
    expect(schoolHolidaysForYear(2028, SCHOOL_HOLIDAYS_BY_STATE.BY)).not.toBeNull();
  });

  it('hält die Listen aller 16 Länder in sich stimmig', () => {
    expect(Object.keys(SCHOOL_HOLIDAYS_BY_STATE).sort()).toEqual(
      FEDERAL_STATES.map((state) => state.code).sort(),
    );
    for (const { code } of FEDERAL_STATES) {
      const entry = SCHOOL_HOLIDAYS_BY_STATE[code];
      expect(entry.source, code).not.toBe('');
      for (const holiday of entry.list) {
        expect(holiday.from <= holiday.to, `${code} ${holiday.from}`).toBe(true);
        // Echte Kalendertage (kein 31.02. o. Ä.).
        for (const day of [holiday.from, holiday.to])
          expect(new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10), code).toBe(day);
      }
      expect(entry.covered.length, code).toBeGreaterThan(0);
      for (const year of entry.covered) {
        const names = schoolHolidaysForYear(year, entry)!.map((holiday) => holiday.name);
        expect(
          names.some((name) => name.startsWith('Oster')),
          `${code} ${year}`,
        ).toBe(true);
        for (const name of ['Sommerferien', 'Herbstferien', 'Weihnachtsferien'])
          expect(names, `${code} ${year}`).toContain(name);
      }
    }
  });

  // Die Hessen-Liste stammt vom Hessischen Kultusministerium. Gegenprobe mit dem KMK-Ferienkalender
  // (https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2025_26.pdf … FER2028_29.pdf, Stand 09.10.2025),
  // Zeile „Hessen“, am 30.10.2026 abgelesen: alle Termine gleich.
  it('Hessen stimmt mit dem KMK-Ferienkalender 2025/26 bis 2028/29 überein', () => {
    const kmk: [string, string][] = [
      ['2025-12-22', '2026-01-10'],
      ['2026-03-30', '2026-04-10'],
      ['2026-06-29', '2026-08-07'],
      ['2026-10-05', '2026-10-17'],
      ['2026-12-23', '2027-01-12'],
      ['2027-03-22', '2027-04-02'],
      ['2027-06-28', '2027-08-06'],
      ['2027-10-04', '2027-10-16'],
      ['2027-12-23', '2028-01-11'],
      ['2028-04-03', '2028-04-14'],
      ['2028-07-03', '2028-08-11'],
      ['2028-10-09', '2028-10-20'],
      ['2028-12-27', '2029-01-12'],
      ['2029-03-29', '2029-04-13'],
      ['2029-07-16', '2029-08-24'],
    ];
    for (const [from, to] of kmk) expect(has('HE', from, to), `${from} bis ${to}`).toBe(true);
  });

  // Stichproben je Land, von Hand aus den KMK-Ferienkalendern abgelesen (erster und letzter Ferientag):
  // https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2025_26.pdf, FER2026_27.pdf, FER2027_28.pdf, FER2028_29.pdf
  // (alle „Stand: 09.10.2025“, abgerufen am 30.10.2026). Kursiv gedruckte Tage (schul-/unterrichtsfrei) sind markiert.
  const samples: Record<Exclude<FederalState, 'HE'>, [string, string, boolean?][]> = {
    BW: [
      ['2027-07-29', '2027-09-11'],
      ['2027-05-18', '2027-05-29'],
      ['2026-10-31', '2026-10-31', true],
    ],
    BY: [
      ['2028-02-28', '2028-03-03'],
      ['2028-07-31', '2028-09-11'],
      ['2026-11-02', '2026-11-06', true],
    ],
    BE: [
      ['2025-10-20', '2025-11-01'],
      ['2029-01-29', '2029-02-03'],
      ['2029-03-09', '2029-03-09', true],
    ],
    BB: [
      ['2028-06-29', '2028-08-12'],
      ['2027-12-23', '2027-12-31'],
    ],
    HB: [
      ['2028-12-27', '2029-01-06'],
      ['2029-02-01', '2029-02-02'],
      ['2027-05-07', '2027-05-07'],
      ['2027-05-18', '2027-05-18'],
    ],
    HH: [
      ['2027-01-29', '2027-01-29'],
      ['2027-03-01', '2027-03-12'],
      ['2028-12-18', '2028-12-29'],
    ],
    MV: [
      ['2029-06-18', '2029-07-28'],
      ['2028-02-05', '2028-02-17'],
      ['2028-02-18', '2028-02-18', true],
    ],
    NI: [
      ['2027-07-08', '2027-08-18'],
      ['2026-05-15', '2026-05-15'],
      ['2026-05-26', '2026-05-26'],
    ],
    NW: [
      ['2027-10-23', '2027-11-06'],
      ['2029-07-02', '2029-08-14'],
    ],
    RP: [
      ['2025-12-22', '2026-01-07'],
      ['2029-03-26', '2029-04-06'],
    ],
    SL: [
      ['2028-02-21', '2028-02-29'],
      ['2026-12-21', '2026-12-31'],
    ],
    SN: [
      ['2027-07-10', '2027-08-20'],
      ['2027-05-07', '2027-05-07', true],
      ['2027-05-15', '2027-05-18'],
    ],
    ST: [
      ['2026-01-31', '2026-02-06'],
      ['2028-10-30', '2028-11-03'],
      ['2028-10-02', '2028-10-02'],
    ],
    SH: [
      ['2027-07-03', '2027-08-14'],
      ['2028-06-24', '2028-08-04'],
    ],
    TH: [
      ['2029-02-12', '2029-02-17'],
      ['2026-04-07', '2026-04-17'],
      ['2026-05-15', '2026-05-15', true],
    ],
  };

  for (const [state, list] of Object.entries(samples) as [
    Exclude<FederalState, 'HE'>,
    [string, string, boolean?][],
  ][]) {
    it(`enthält die KMK-Termine für ${state} (Stichprobe)`, () => {
      for (const [from, to, schoolFree] of list)
        expect(has(state, from, to, schoolFree ?? false), `${state} ${from} bis ${to}`).toBe(true);
    });
  }

  function render(now: string, state?: FederalState) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const fixture = TestBed.createComponent(SchoolHolidaysHint);
    if (state) fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt aufklappbar die Ferien des aktuellen Jahres samt Quelle und Stand (ohne Land: Hessen)', () => {
    const root = render('2027-01-05T10:00:00');
    expect(root.querySelector('summary')?.textContent).toContain('Schulferien Hessen 2027');
    expect(root.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(root.textContent).toContain('Osterferien');
    expect(root.textContent).toContain('22.03.2027 bis 02.04.2027');
    expect(root.textContent).toContain('23.12.2026 bis 12.01.2027');
    expect(root.textContent).toContain('Hessisches Kultusministerium');
    expect(root.textContent).toContain('Stand 30.10.2026');
    expect(root.querySelector('button')).toBeNull();
  });

  it('zeigt die Ferien des gewählten Landes mit einzelnen und schulfreien Tagen', () => {
    const root = render('2027-01-05T10:00:00', 'SN');
    expect(root.querySelector('summary')?.textContent).toContain('Schulferien Sachsen 2027');
    expect(root.textContent).toContain('10.07.2027 bis 20.08.2027');
    expect(root.textContent).not.toContain('22.03.2027 bis 02.04.2027');
    const items = [...root.querySelectorAll('li')].map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(items).toContain('Himmelfahrt/Pfingsten 07.05.2027 (schulfrei)');
    expect(root.textContent).toContain('Kultusministerkonferenz');
    expect(root.textContent).toContain('als schul- bzw. unterrichtsfreie Tage gekennzeichnet');
  });

  it('nennt die Sonderregel für die Inseln in Schleswig-Holstein', () => {
    const root = render('2027-06-01T10:00:00', 'SH');
    expect(root.querySelector('summary')?.textContent).toContain(
      'Schulferien Schleswig-Holstein 2027',
    );
    expect(root.textContent).toContain('Sylt');
    expect(root.textContent).not.toContain('als schul- bzw. unterrichtsfreie Tage gekennzeichnet');
  });

  it('nennt ein fehlendes Jahr, statt falsche oder leere Daten zu zeigen', () => {
    const root = render('2031-03-01T10:00:00');
    expect(root.querySelector('summary')?.textContent).toContain('Schulferien Hessen 2031');
    expect(root.textContent).toContain('Ferientermine für 2031 noch nicht hinterlegt');
    expect(root.querySelector('li')).toBeNull();
    const bavaria = render('2029-03-01T10:00:00', 'BY');
    expect(bavaria.textContent).toContain('Ferientermine für 2029 noch nicht hinterlegt');
  });
});
