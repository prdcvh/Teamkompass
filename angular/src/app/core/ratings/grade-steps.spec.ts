import { describe, expect, it } from 'vitest';
import { GRADE_STEPS, gradeWithWord, gradeWord, stepForAverage } from './grade-steps';
import { GRADE_SCALE_OPTIONS, scoreLabel, scoreWithWord } from './rating-scale';

describe('Notenstufen (SCRUM-393)', () => {
  it('ordnet die Zahlen 1–6 den Schulnoten-Wörtern zu', () => {
    expect(GRADE_STEPS.map((step) => [step.value, step.word])).toEqual([
      [1, 'sehr gut'],
      [2, 'gut'],
      [3, 'befriedigend'],
      [4, 'ausreichend'],
      [5, 'mangelhaft'],
      [6, 'ungenügend'],
    ]);
    expect(gradeWord(2)).toBe('gut');
    expect(gradeWord(2.5)).toBeNull();
    expect(gradeWord(7)).toBeNull();
  });

  it('die Eingabe-Stufen speichern genau die bisherigen Zahlen 1–6', () => {
    expect(GRADE_SCALE_OPTIONS.map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(GRADE_SCALE_OPTIONS.map((option) => option.label)).toEqual(['sehr gut', 'gut', 'befriedigend', 'ausreichend', 'mangelhaft', 'ungenügend']);
    expect(GRADE_SCALE_OPTIONS[1].aria).toBe('gut, Note 2');
  });

  it('Bereichsgrenzen: auf die nächste ganze Note runden, .5 zur schlechteren Note', () => {
    const cases: [number, string][] = [
      [1, 'sehr gut'],
      [1.49, 'sehr gut'],
      [1.5, 'gut'],
      [2.49, 'gut'],
      [2.5, 'befriedigend'],
      [3.49, 'befriedigend'],
      [3.5, 'ausreichend'],
      [4.49, 'ausreichend'],
      [4.5, 'mangelhaft'],
      [5.49, 'mangelhaft'],
      [5.5, 'ungenügend'],
      [6, 'ungenügend'],
    ];
    for (const [value, word] of cases) expect(stepForAverage(value).word, String(value)).toBe(word);
    expect(stepForAverage(0.5).word).toBe('sehr gut');
    expect(stepForAverage(9).word).toBe('ungenügend');
  });

  it('zeigt Durchschnitte als „Wort (Zahl)“; ohne Wert „–“', () => {
    expect(gradeWithWord(2.3)).toBe('gut (2,3)');
    expect(gradeWithWord(2)).toBe('gut (2,0)');
    expect(gradeWithWord(1.46)).toBe('gut (1,5)'); // Wort passt immer zur angezeigten Zahl
    expect(gradeWithWord(1.44)).toBe('sehr gut (1,4)');
    expect(gradeWithWord(null)).toBe('–');
    expect(scoreWithWord(3.6, 'grades')).toBe('ausreichend (3,6)');
    expect(scoreWithWord(null, 'grades')).toBe('–');
  });

  it('Kompetenzstufen-Teams und reine Zahlenanzeigen bleiben unverändert', () => {
    expect(scoreWithWord(3.1, 'levels')).toBe('kann es');
    expect(scoreLabel(2.3, 'grades')).toBe('2,3');
  });
});
