import { checkGoalsAndAssists, checkMatchConsistency, checkMinutes } from './match-consistency';

const r = (minutes: number | null, goals: number | null = null, assists: number | null = null) => ({ minutes, goals, assists });

describe('Stimmigkeit Minuten, Tore, Vorlagen (SCRUM-395)', () => {
  describe('Minuten', () => {
    it('stimmt bei Spieldauer × 11', () => {
      const check = checkMinutes(Array.from({ length: 11 }, () => r(70)), 70);
      expect(check).toMatchObject({ status: 'ok', expected: 770, actual: 770, delta: 0 });
    });
    it('meldet „es fehlen 20 Minuten“', () => {
      const check = checkMinutes([...Array.from({ length: 10 }, () => r(90)), r(70)], 90);
      expect(check.status).toBe('short');
      expect(check.delta).toBe(-20);
      expect(check.message).toContain('Es fehlen 20 Minuten');
      expect(check.message).toContain('90 × 11 = 990');
    });
    it('meldet „20 Minuten zu viel“', () => {
      const check = checkMinutes([r(990), r(20)], 90);
      expect(check.status).toBe('over');
      expect(check.delta).toBe(20);
      expect(check.message).toContain('20 Minuten zu viel');
    });
    it('benutzt die Einzahl bei einer Minute', () => {
      expect(checkMinutes([r(989)], 90).message).toContain('Es fehlt 1 Minute.');
      expect(checkMinutes([r(991)], 90).message).toContain('1 Minute zu viel');
    });
    it('nichts eingetragen gilt als „noch nicht erfasst“, nicht als 0', () => {
      const check = checkMinutes([r(null), r(null)], 90);
      expect(check.status).toBe('unrecorded');
      expect(check.message).toContain('noch nicht erfasst');
      expect(checkMinutes([], 90).status).toBe('unrecorded');
    });
    it('eine eingetragene 0 zählt als erfasst', () => {
      expect(checkMinutes([r(0)], 90).status).toBe('short');
    });
  });

  describe('Tore und Vorlagen', () => {
    it('stimmt bei gleicher Summe', () => {
      expect(checkGoalsAndAssists([r(null, 2, 1), r(null, 1, 2)])).toMatchObject({ status: 'ok', goals: 3, assists: 3, delta: 0 });
    });
    it('3 Tore, 2 Vorlagen: 1 Vorlage fehlt', () => {
      const check = checkGoalsAndAssists([r(null, 3, 0), r(null, 0, 2)]);
      expect(check.status).toBe('short');
      expect(check.delta).toBe(-1);
      expect(check.message).toBe('3 Tore, 2 Vorlagen: 1 Vorlage fehlt');
    });
    it('mehrere fehlende Vorlagen im Plural', () => {
      expect(checkGoalsAndAssists([r(null, 4, 1)]).message).toBe('4 Tore, 1 Vorlage: 3 Vorlagen fehlen');
    });
    it('mehr Vorlagen als Tore: Tore fehlen', () => {
      const check = checkGoalsAndAssists([r(null, 1, 3)]);
      expect(check.status).toBe('over');
      expect(check.message).toBe('1 Tor, 3 Vorlagen: 2 Tore fehlen');
    });
    it('Tore ohne eingetragene Vorlagen zählen als 0 Vorlagen', () => {
      expect(checkGoalsAndAssists([r(null, 2, null)]).message).toBe('2 Tore, 0 Vorlagen: 2 Vorlagen fehlen');
    });
    it('nichts eingetragen gilt als „noch nicht erfasst“', () => {
      expect(checkGoalsAndAssists([r(90), r(null)]).status).toBe('unrecorded');
    });
  });

  describe('Gesamtprüfung', () => {
    it('nichts erfasst: keine Warnung und kein „passt“', () => {
      expect(checkMatchConsistency([r(null), r(null)], 90)).toMatchObject({ nothingEntered: true, hasWarning: false, allOk: false });
    });
    it('alles stimmt', () => {
      const ratings = Array.from({ length: 11 }, () => r(90));
      ratings[0] = r(90, 1, 1);
      expect(checkMatchConsistency(ratings, 90)).toMatchObject({ allOk: true, hasWarning: false, nothingEntered: false });
    });
    it('nur Minuten erfasst und stimmig: weder Warnung noch „alles passt“', () => {
      expect(checkMatchConsistency(Array.from({ length: 11 }, () => r(90)), 90)).toMatchObject({ hasWarning: false, allOk: false, nothingEntered: false });
    });
    it('eine Abweichung reicht für die Warnung', () => {
      expect(checkMatchConsistency([r(90, 1, 0)], 90).hasWarning).toBe(true);
    });
    it('verändert die Eingaben nicht', () => {
      const ratings = [r(10, 1, 0)];
      const copy = JSON.stringify(ratings);
      checkMatchConsistency(ratings, 90);
      expect(JSON.stringify(ratings)).toBe(copy);
    });
  });
});
