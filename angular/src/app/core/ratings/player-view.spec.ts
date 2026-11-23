import { gradesChanged, gradesDoc, playerRating, valuesDoc } from './player-view';
import { calculatedGrade, docFromRating, ratingFromDoc } from './rating';

describe('Kopien für die Spieleransicht (SCRUM-115)', () => {
  const full = {
    attendance: 'present',
    grade: 2.1,
    effort: 2,
    technique: 2,
    tactics: 3,
    comprehension: 1,
    minutes: 60,
    goals: 1,
    assists: '',
    note: 'Kommentar nur für Trainer',
    autoAbsence: true,
    scale: 'levels',
  };

  it('Werte-Kopie: nur Anwesenheit, Minuten, Tore, Vorlagen – nie Noten oder Kommentar', () => {
    expect(valuesDoc('p1', full)).toEqual({ playerId: 'p1', attendance: 'present', minutes: 60, goals: 1, assists: '' });
  });

  it('Noten-Kopie: Teilnoten, Gesamtnote und Skala – nie Werte oder Kommentar', () => {
    const doc = gradesDoc('p1', { ...full, scale: undefined });
    expect(doc).toEqual({ playerId: 'p1', grade: 2.1, effort: 2, technique: 2, tactics: 3, comprehension: 1 });
    expect(gradesDoc('p1', { ...full, effort: 4.5, technique: 3, tactics: 1.5, comprehension: 3 })['scale']).toBe('levels');
  });

  it('übernimmt alte Bewertungen mit nur einer Gesamtnote ohne Verlust (alle Teilnoten = Gesamtnote)', () => {
    const legacy = { attendance: 'present', grade: 3, minutes: 45 };
    const rating = playerRating(valuesDoc('p1', legacy), gradesDoc('p1', legacy));
    expect(rating).toMatchObject({ effort: 3, technique: 3, tactics: 3, comprehension: 3, minutes: 45 });
    expect(calculatedGrade(rating!)).toBe(calculatedGrade(ratingFromDoc(legacy)));
  });

  it('Bewertung für Spieler: Werte immer, Noten nur mit lesbarer Noten-Kopie, nie Kommentar', () => {
    const values = valuesDoc('p1', full);
    const withoutGrades = playerRating(values, null)!;
    expect(withoutGrades).toMatchObject({ attendance: 'present', minutes: 60, goals: 1, assists: null, effort: null, note: '' });
    expect(calculatedGrade(withoutGrades)).toBeNull();
    const withGrades = playerRating(values, gradesDoc('p1', { ...full, scale: undefined }))!;
    expect(withGrades).toMatchObject({ effort: 2, technique: 2, tactics: 3, comprehension: 1, minutes: 60, note: '', autoAbsence: false });
    expect(playerRating(null, gradesDoc('p1', full))).toBeNull();
  });

  it('Noten gelten nur bei geänderten Noten als neu – Minuten, Tore oder Kommentar ändern nichts', () => {
    const before = docFromRating(ratingFromDoc(full));
    expect(gradesChanged(before, { ...before, minutes: 70, goals: 2, note: 'neu' })).toBe(false);
    expect(gradesChanged(before, { ...before, effort: 1, grade: 1.8 })).toBe(true);
    expect(gradesChanged(before, { ...before, attendance: 'absent', effort: '', technique: '', tactics: '', comprehension: '', grade: '' })).toBe(true);
    expect(gradesChanged(null, before)).toBe(true);
    expect(gradesChanged(undefined, before)).toBe(true);
  });
});
