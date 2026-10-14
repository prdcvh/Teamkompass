import { ageFromBirthdate } from './dates';

const NOW = new Date(2026, 9, 2); // 2. Oktober 2026
describe('Datumshilfen', () => {
  it('berechnet das Alter in vollen Jahren', () => {
    expect(ageFromBirthdate('2012-10-02', NOW)).toBe(14);
    expect(ageFromBirthdate('2012-10-03', NOW)).toBe(13);
    expect(ageFromBirthdate('', NOW)).toBeNull();
    expect(ageFromBirthdate('2012-02-30', NOW)).toBeNull();
  });
});
