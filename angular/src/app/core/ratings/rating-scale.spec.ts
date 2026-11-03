import {
  LEVEL_OPTIONS,
  defaultScaleForLabel,
  docFromRatingScale,
  isScaleValue,
  levelFor,
  scaleOptions,
  scoreLabel,
  scoreShortLabel,
  storedRatingScale,
} from './rating-scale';

describe('rating-scale (SCRUM-188)', () => {
  it('rechnet die Stufen intern wie vom PO festgelegt um', () => {
    expect(LEVEL_OPTIONS.map((option) => [option.label, option.value])).toEqual([
      ['lernt es noch', 4.5],
      ['kann es', 3],
      ['kann es sicher', 1.5],
    ]);
    expect(scaleOptions('grades').map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('Standard: U6–U11 Stufen, ab U12 (und ohne Altersklasse) Schulnoten', () => {
    for (const label of ['U6', 'U7', 'U9', 'u10', 'U 11', 'U11 Mädchen']) expect(defaultScaleForLabel(label)).toBe('levels');
    for (const label of ['U12', 'U14', 'U15', 'U17', 'U19', 'U5', 'Erwachsene', 'Senioren', '', 'Team U9']) expect(defaultScaleForLabel(label)).toBe('grades');
  });

  it('bestehende Teams (U14, U15, U17, Hauptteam mit Bezeichnung U14) bleiben ohne Wahl bei Schulnoten', () => {
    for (const label of ['U14', 'U15', 'U17']) expect(defaultScaleForLabel(label)).toBe('grades');
  });

  it('prüft Eingaben je Skala', () => {
    expect(isScaleValue(2, 'grades')).toBe(true);
    expect(isScaleValue(4.5, 'grades')).toBe(false);
    expect(isScaleValue(4.5, 'levels')).toBe(true);
    expect(isScaleValue(3, 'levels')).toBe(true);
    expect(isScaleValue(2, 'levels')).toBe(false);
  });

  it('ordnet Schnitte der nächsten Stufe zu, in der Mitte der besseren', () => {
    expect(levelFor(1.5).label).toBe('kann es sicher');
    expect(levelFor(2.25).label).toBe('kann es sicher');
    expect(levelFor(2.3).label).toBe('kann es');
    expect(levelFor(3.75).label).toBe('kann es');
    expect(levelFor(3.8).label).toBe('lernt es noch');
    expect(levelFor(6).label).toBe('lernt es noch');
  });

  it('zeigt Werte in der Skala an; Schulnoten genau wie bisher', () => {
    expect(scoreLabel(2.3, 'grades')).toBe('2,3');
    expect(scoreLabel(2, 'grades')).toBe('2,0');
    expect(scoreLabel(null, 'grades')).toBe('–');
    expect(scoreLabel(3.1, 'levels')).toBe('kann es');
    expect(scoreLabel(null, 'levels')).toBe('–');
    expect(scoreShortLabel(1.5, 'levels')).toBe('sicher');
    expect(scoreShortLabel(1.5, 'grades')).toBe('1,5');
  });

  it('liest und schreibt die Wahl in meta/settings; Unbekanntes gilt als nicht gewählt', () => {
    expect(storedRatingScale(null)).toBeNull();
    expect(storedRatingScale({})).toBeNull();
    expect(storedRatingScale({ ratingScale: '1-10' })).toBeNull();
    expect(storedRatingScale({ ratingScale: 'levels' })).toBe('levels');
    expect(docFromRatingScale('grades')).toEqual({ ratingScale: 'grades' });
  });
});
