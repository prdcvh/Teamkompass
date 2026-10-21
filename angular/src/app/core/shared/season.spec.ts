import { seasonStartIso, seasonStartYear } from './season';

describe('Saisonbeginn (1. Juli)', () => {
  it('liefert für Oktober 2026 den 1. Juli 2026', () => {
    expect(seasonStartIso(new Date(2026, 9, 20))).toBe('2026-07-01');
  });

  it('gilt am 30. Juni noch für die alte Saison, ab 1. Juli für die neue', () => {
    expect(seasonStartIso(new Date(2027, 5, 30, 23, 59))).toBe('2026-07-01');
    expect(seasonStartIso(new Date(2027, 6, 1, 0, 0))).toBe('2027-07-01');
  });

  it('rechnet über den Jahreswechsel: Januar gehört zur Saison des Vorjahres', () => {
    expect(seasonStartIso(new Date(2027, 0, 1))).toBe('2026-07-01');
    expect(seasonStartIso(new Date(2026, 11, 31))).toBe('2026-07-01');
    expect(seasonStartYear(new Date(2027, 0, 15))).toBe(2026);
  });
});
