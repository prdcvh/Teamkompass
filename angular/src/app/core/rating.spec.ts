import {
  BLANK_RATING,
  type Rating,
  applyChange,
  calculatedGrade,
  docFromRating,
  gradeLabel,
  isRated,
  matchesView,
  progress,
  ratingFromDoc,
  roundGrade,
} from './rating';

describe('rating (Logik)', () => {
  const full = (overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, ...overrides });

  describe('Gesamtnote (Kernzahl)', () => {
    it('gewichtet Einsatz 30 %, Fehlerquote 30 %, Entscheidungsfindung 25 %, Lernfähigkeit 15 %', () => {
      expect(calculatedGrade(full({ effort: 1, technique: 1, tactics: 1, comprehension: 1 }))).toBe(1);
      expect(calculatedGrade(full({ effort: 6, technique: 6, tactics: 6, comprehension: 6 }))).toBe(6);
      // 1*0.3 + 2*0.3 + 3*0.25 + 4*0.15 = 2.25 → 2,3 (auf eine Nachkommastelle gerundet)
      expect(calculatedGrade(full({ effort: 1, technique: 2, tactics: 3, comprehension: 4 }))).toBe(2.3);
      // Lernfähigkeit wirkt nur mit 15 %: 2*.3 + 2*.3 + 2*.25 + 6*.15 = 2.6
      expect(calculatedGrade(full({ comprehension: 6 }))).toBe(2.6);
      // Einsatz dominiert nicht allein: 6*.3 + 1*.3 + 1*.25 + 1*.15 = 2.5
      expect(calculatedGrade(full({ effort: 6, technique: 1, tactics: 1, comprehension: 1 }))).toBe(2.5);
    });

    it('liefert keine Note bei fehlender Teilnote, „Fehlt“ und „Nicht im Kader“', () => {
      expect(calculatedGrade(full({ tactics: null }))).toBeNull();
      expect(calculatedGrade(full({ attendance: 'absent' }))).toBeNull();
      expect(calculatedGrade(full({ attendance: 'excluded' }))).toBeNull();
      expect(calculatedGrade(BLANK_RATING)).toBeNull();
      expect(calculatedGrade(full({ attendance: 'limited' }))).toBe(2);
      expect(calculatedGrade(full({ attendance: 'open' }))).toBe(2);
    });

    it('rundet wie die bisherige App und formatiert mit Komma', () => {
      expect(roundGrade(2.25)).toBe(2.3);
      expect(roundGrade(2.249)).toBe(2.2);
      // Grenzfall 1,15: gleiche Gleitkomma-Reihenfolge wie die bisherige App (effort*0.3 + technique*0.3 + tactics*0.25 + comprehension*0.15)
      expect(calculatedGrade(full({ effort: 1, technique: 1, tactics: 1, comprehension: 2 }))).toBe(1.2);
      expect(gradeLabel(2.3)).toBe('2,3');
      expect(gradeLabel(2)).toBe('2,0');
      expect(gradeLabel(null)).toBe('–');
    });
  });

  describe('Dokument', () => {
    it('liest Teilnoten, Zahlen und Notiz; leere Werte sind „nicht erfasst“', () => {
      const rating = ratingFromDoc({ attendance: 'present', effort: 2, technique: '3', tactics: '', comprehension: 9, minutes: 45, goals: '1', assists: '', note: 'Stark', playerId: 'p1' });
      expect(rating).toEqual({ attendance: 'present', effort: 2, technique: 3, tactics: null, comprehension: null, minutes: 45, goals: 1, assists: null, note: 'Stark', autoAbsence: false });
      expect(ratingFromDoc(undefined)).toBe(BLANK_RATING);
      expect(ratingFromDoc({ attendance: 'bogus' }).attendance).toBe('open');
    });

    it('füllt bei älteren Dokumenten mit nur einer Gesamtnote alle Teilnoten damit', () => {
      const rating = ratingFromDoc({ attendance: 'present', grade: 3 });
      expect([rating.effort, rating.technique, rating.tactics, rating.comprehension]).toEqual([3, 3, 3, 3]);
      expect(calculatedGrade(rating)).toBe(3);
    });

    it('merkt sich die Abwesenheits-Automatik', () => {
      expect(ratingFromDoc({ attendance: 'absent', autoAbsence: true, note: 'Verletzt' }).autoAbsence).toBe(true);
    });

    it('schreibt Felder wie die bisherige App ("" statt null) samt Gesamtnote', () => {
      expect(docFromRating(full({ effort: 1, technique: 2, tactics: 3, comprehension: 4, minutes: 60 }))).toEqual({
        attendance: 'present', grade: 2.3, effort: 1, technique: 2, tactics: 3, comprehension: 4, minutes: 60, goals: '', assists: '', note: '',
      });
      expect(docFromRating(BLANK_RATING)).toMatchObject({ attendance: 'open', grade: '', effort: '' });
    });

    it('schreibt autoAbsence nur gesetzt oder beim Zurücknehmen', () => {
      expect(docFromRating(full())).not.toHaveProperty('autoAbsence');
      expect(docFromRating(full({ autoAbsence: true }))).toHaveProperty('autoAbsence', true);
      expect(docFromRating(full(), { clearAuto: true })).toHaveProperty('autoAbsence', false);
    });
  });

  describe('Änderungen', () => {
    it('übernimmt Teilnoten, leeren Wert und ignoriert ungültige Noten', () => {
      expect(applyChange(BLANK_RATING, 'effort', '2', 90).rating.effort).toBe(2);
      expect(applyChange(full(), 'effort', '', 90).rating.effort).toBeNull();
      expect(applyChange(full(), 'effort', '7', 90).rating.effort).toBeNull();
      expect(applyChange(full(), 'effort', '2.5', 90).rating.effort).toBeNull();
    });

    it('begrenzt Minuten auf die Spieldauer und Tore/Vorlagen auf 20', () => {
      expect(applyChange(full(), 'minutes', '120', 80).rating.minutes).toBe(80);
      expect(applyChange(full(), 'minutes', '-5', 80).rating.minutes).toBeNull();
      expect(applyChange(full(), 'goals', '25', 90).rating.goals).toBe(20);
      expect(applyChange(full(), 'assists', '2', 90).rating.assists).toBe(2);
      expect(applyChange(full(), 'goals', 'abc', 90).rating.goals).toBeNull();
    });

    it('„Fehlt“ und „Nicht im Kader“ löschen Noten und Spielwerte, die Notiz bleibt', () => {
      const filled = full({ minutes: 45, goals: 1, assists: 1, note: 'Verletzt abgemeldet' });
      for (const attendance of ['absent', 'excluded']) {
        const { rating } = applyChange(filled, 'attendance', attendance, 90);
        expect(rating).toMatchObject({ attendance, effort: null, technique: null, tactics: null, comprehension: null, minutes: null, goals: null, assists: null, note: 'Verletzt abgemeldet' });
        expect(calculatedGrade(rating)).toBeNull();
      }
    });

    it('„Anwesend“ nach „Fehlt“ stellt die Note erst nach neuen Teilnoten wieder her', () => {
      const absent = applyChange(full(), 'attendance', 'absent', 90).rating;
      const back = applyChange(absent, 'attendance', 'present', 90).rating;
      expect(calculatedGrade(back)).toBeNull();
      expect(calculatedGrade(applyChange(applyChange(applyChange(applyChange(back, 'effort', '1', 90).rating, 'technique', '1', 90).rating, 'tactics', '1', 90).rating, 'comprehension', '1', 90).rating)).toBe(1);
    });

    it('ignoriert unbekannte Anwesenheit und kürzt lange Notizen', () => {
      const current = full();
      expect(applyChange(current, 'attendance', 'bogus', 90).rating).toBe(current);
      expect(applyChange(current, 'note', 'x'.repeat(1500), 90).rating.note).toHaveLength(1000);
    });

    it('eine Handänderung nimmt die Abwesenheits-Markierung weg', () => {
      const auto: Rating = { ...BLANK_RATING, attendance: 'absent', note: 'Verletzt', autoAbsence: true };
      const result = applyChange(auto, 'note', 'Doch krank', 90);
      expect(result.rating.autoAbsence).toBe(false);
      expect(result.clearedAuto).toBe(true);
      expect(applyChange(full(), 'effort', '3', 90).clearedAuto).toBe(false);
    });
  });

  describe('Ansicht und Fortschritt', () => {
    it('filtert nach anwesend und fehlend (fehlend umfasst auch offene Spieler)', () => {
      const attendances = ['open', 'present', 'limited', 'absent', 'excluded'] as const;
      const rows = attendances.map((attendance) => ({ ...BLANK_RATING, attendance }));
      expect(rows.filter((row) => matchesView(row, 'present')).map((row) => row.attendance)).toEqual(['present', 'limited']);
      expect(rows.filter((row) => matchesView(row, 'missing')).map((row) => row.attendance)).toEqual(['open', 'absent', 'excluded']);
      expect(rows.filter((row) => matchesView(row, 'all'))).toHaveLength(5);
    });

    it('zählt als erfasst: mit Gesamtnote oder fehlend/nicht im Kader', () => {
      expect(isRated(full())).toBe(true);
      expect(isRated(full({ tactics: null }))).toBe(false);
      expect(isRated({ ...BLANK_RATING, attendance: 'absent' })).toBe(true);
      expect(isRated({ ...BLANK_RATING, attendance: 'excluded' })).toBe(true);
      expect(isRated(BLANK_RATING)).toBe(false);
      expect(progress([full(), BLANK_RATING, { ...BLANK_RATING, attendance: 'absent' }])).toEqual({ done: 2, total: 3, share: 67 });
      expect(progress([])).toEqual({ done: 0, total: 0, share: 0 });
    });
  });
});
