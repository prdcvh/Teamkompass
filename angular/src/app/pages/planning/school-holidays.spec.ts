import { TestBed } from '@angular/core/testing';
import { COVERED_HOLIDAY_YEARS, SCHOOL_HOLIDAYS, schoolHolidaysForYear } from './school-holidays';
import { SchoolHolidaysHint } from './school-holidays-hint';

describe('Schulferien Hessen (Hinweis)', () => {
  afterEach(() => vi.useRealTimers());

  it('wählt je Jahr die passenden Ferien, sortiert nach Beginn', () => {
    const names = (year: number) => schoolHolidaysForYear(year)?.map((holiday) => `${holiday.name} ${holiday.from}`);
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
  });

  it('zeigt Ferien über den Jahreswechsel in beiden Jahren', () => {
    const in2026 = schoolHolidaysForYear(2026)!.filter((holiday) => holiday.to === '2027-01-12');
    const in2027 = schoolHolidaysForYear(2027)!.filter((holiday) => holiday.to === '2027-01-12');
    expect(in2026).toHaveLength(1);
    expect(in2027).toHaveLength(1);
  });

  it('liefert für ein nicht hinterlegtes Jahr null statt halber Daten', () => {
    expect(schoolHolidaysForYear(2025)).toBeNull();
    expect(schoolHolidaysForYear(2030)).toBeNull();
  });

  it('hält die Liste in sich stimmig (Von vor Bis, jedes hinterlegte Jahr hat Ferien)', () => {
    for (const holiday of SCHOOL_HOLIDAYS) expect(holiday.from <= holiday.to).toBe(true);
    for (const year of COVERED_HOLIDAY_YEARS) {
      const names = schoolHolidaysForYear(year)!.map((holiday) => holiday.name);
      for (const name of ['Osterferien', 'Sommerferien', 'Herbstferien', 'Weihnachtsferien']) expect(names).toContain(name);
    }
  });

  function render(now: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const fixture = TestBed.createComponent(SchoolHolidaysHint);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('zeigt aufklappbar die Ferien des aktuellen Jahres samt Quelle und Stand', () => {
    const root = render('2027-01-05T10:00:00');
    expect(root.querySelector('summary')?.textContent).toContain('Schulferien Hessen 2027');
    expect(root.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(root.textContent).toContain('Osterferien');
    expect(root.textContent).toContain('22.03.2027 bis 02.04.2027');
    expect(root.textContent).toContain('23.12.2026 bis 12.01.2027');
    expect(root.textContent).toContain('Hessisches Kultusministerium');
    expect(root.textContent).toContain('Stand 16.10.2026');
    expect(root.querySelector('button')).toBeNull();
  });

  it('nennt ein fehlendes Jahr, statt falsche oder leere Daten zu zeigen', () => {
    const root = render('2031-03-01T10:00:00');
    expect(root.querySelector('summary')?.textContent).toContain('Schulferien Hessen 2031');
    expect(root.textContent).toContain('Ferientermine für 2031 noch nicht hinterlegt');
    expect(root.querySelector('li')).toBeNull();
  });
});
