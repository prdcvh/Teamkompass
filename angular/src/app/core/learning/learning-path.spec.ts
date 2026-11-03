import {
  type LearningPath,
  MAX_LEVELS,
  confirmedSummary,
  docFromPath,
  emptyLevelDraft,
  emptyPathDraft,
  pathFitsPlayer,
  pathFromDoc,
  pathFromDraft,
  pathView,
  pathsFromDocs,
  progressFromDoc,
  progressPercent,
  progressText,
  teamAgeGroup,
  validatePathDraft,
} from './learning-path';

describe('Lernpfade (SCRUM-192)', () => {
  const level = (id: string, title = `Stufe ${id}`) => ({ id, title, unit: 'Üben', minutes: 3, url: null, homeTask: '' });
  const path: LearningPath = { id: 'lp1', title: 'Torwart', position: 'TW', ageGroup: 'U14', levels: [level('a'), level('b'), level('c')] };

  describe('Prüfung der Eingaben', () => {
    const valid = { ...emptyPathDraft('U14'), title: 'Torwart', levels: [{ ...emptyLevelDraft('a'), title: 'Fangen', unit: 'Bälle fangen' }] };

    it('nimmt einen vollständigen Entwurf an und übernimmt die Altersklasse des Teams als Vorschlag', () => {
      expect(valid.ageGroup).toBe('U14');
      expect(validatePathDraft(valid)).toEqual({});
    });

    it('verlangt Namen, mindestens eine Stufe sowie Titel und Einheit je Stufe', () => {
      expect(validatePathDraft({ ...valid, title: ' ' }).title).toBeDefined();
      expect(validatePathDraft({ ...valid, levels: [] }).levels).toBeDefined();
      const errors = validatePathDraft({ ...valid, levels: [...valid.levels, emptyLevelDraft('b')] });
      expect(errors.level?.[1]?.title).toBeDefined();
      expect(errors.level?.[1]?.unit).toBeDefined();
      expect(errors.level?.[0]).toBeUndefined();
    });

    it('lehnt mehr als die erlaubten Stufen und unsichere Links ab', () => {
      const many = Array.from({ length: MAX_LEVELS + 1 }, (_, i) => ({ ...valid.levels[0], id: `l${i}` }));
      expect(validatePathDraft({ ...valid, levels: many }).levels).toBeDefined();
      for (const url of ['javascript:alert(1)', 'http://example.com', 'data:text/html,x']) {
        expect(validatePathDraft({ ...valid, levels: [{ ...valid.levels[0], url }] }).level?.[0]?.url).toBeDefined();
      }
      expect(validatePathDraft({ ...valid, levels: [{ ...valid.levels[0], url: 'https://www.dfb.de/x' }] })).toEqual({});
    });

    it('wandelt den Entwurf um: Leerzeichen weg, unbekannte Dauer wird 5 Minuten, leerer Link wird null', () => {
      const result = pathFromDraft({ ...valid, title: ' Torwart ', levels: [{ ...valid.levels[0], minutes: 9, url: '' }] }, 'p1');
      expect(result).toMatchObject({ id: 'p1', title: 'Torwart', ageGroup: 'U14', position: '' });
      expect(result.levels[0]).toMatchObject({ minutes: 5, url: null });
      expect(docFromPath(result)).not.toHaveProperty('id');
    });
  });

  describe('Lesen aus Firestore', () => {
    it('überspringt unbrauchbare Pfade und Stufen und prüft Links erneut', () => {
      expect(pathFromDoc('x', null)).toBeNull();
      expect(pathFromDoc('x', { title: '' })).toBeNull();
      const read = pathFromDoc('x', {
        title: 'P',
        levels: [{ id: 'a', title: 'A', url: 'javascript:alert(1)', minutes: 4 }, { id: 'a', title: 'doppelt' }, { title: 'ohne id' }, 'Unsinn'],
      });
      expect(read?.levels).toEqual([{ id: 'a', title: 'A', unit: '', minutes: 4, url: null, homeTask: '' }]);
    });

    it('sortiert nach Position und Name', () => {
      const list = pathsFromDocs([
        { id: '1', data: { title: 'B', position: 'TW' } },
        { id: '2', data: { title: 'A', position: 'TW' } },
        { id: '3', data: { title: 'Z', position: '' } },
      ]);
      expect(list.map((entry) => entry.id)).toEqual(['3', '2', '1']);
    });

    it('liest nur Bestätigungen mit gültigem Datum', () => {
      expect(progressFromDoc(null)).toEqual({});
      expect(progressFromDoc({ paths: { lp1: { a: '2026-10-13', b: 3, c: 'gestern' }, lp2: 'x', lp3: {} } })).toEqual({ lp1: { a: '2026-10-13' } });
    });
  });

  describe('Für wen gilt ein Pfad?', () => {
    it('Position des Spielers (Groß-/Kleinschreibung egal) oder alle Positionen; Altersklasse des Teams oder alle', () => {
      expect(pathFitsPlayer(path, { positions: ['tw'] }, 'U14')).toBe(true);
      expect(pathFitsPlayer(path, { positions: ['ST'] }, 'U14')).toBe(false);
      expect(pathFitsPlayer(path, { positions: ['TW'] }, 'U15')).toBe(false);
      expect(pathFitsPlayer({ ...path, position: '', ageGroup: '' }, { positions: [] }, 'U17')).toBe(true);
      expect(pathFitsPlayer({ ...path, levels: [] }, { positions: ['TW'] }, 'U14')).toBe(false);
      // Teambezeichnung mit Zusatz: die Altersklasse zählt.
      expect(pathFitsPlayer(path, { positions: ['TW'] }, 'U14 Test')).toBe(true);
      expect(pathFitsPlayer(path, { positions: ['TW'] }, 'u 14 (2. Mannschaft)')).toBe(true);
      expect(pathFitsPlayer(path, { positions: ['TW'] }, 'U140')).toBe(false);
    });

    it('Altersklasse aus der Teambezeichnung', () => {
      expect(teamAgeGroup('U14 Test')).toBe('U14');
      expect(teamAgeGroup(' u09 ')).toBe('U9');
      expect(teamAgeGroup('Erwachsene')).toBe('Erwachsene');
      expect(emptyPathDraft('U15 Mädchen').ageGroup).toBe('U15');
    });
  });

  describe('Stand eines Spielers', () => {
    it('ohne Bestätigung ist Stufe 1 der nächste Schritt', () => {
      const view = pathView(path, {});
      expect(view.done).toBe(0);
      expect(view.next?.number).toBe(1);
      expect(view.lastDone).toBeNull();
      expect(view.levels.map((entry) => entry.state)).toEqual(['next', 'later', 'later']);
      expect(progressText(view)).toBe('0 von 3 Stufen bestätigt');
    });

    it('nächster Schritt ist die erste offene Stufe; Bestätigungen gelöschter Stufen zählen nicht', () => {
      const view = pathView(path, { lp1: { a: '2026-10-13', b: '2026-10-20', weg: '2026-10-01' } });
      expect(view.done).toBe(2);
      expect(view.next?.level.id).toBe('c');
      expect(view.lastDone?.level.id).toBe('b');
      expect(view.levels[0].confirmedAt).toBe('2026-10-13');
      expect(progressPercent(view)).toBe(67);
    });

    it('alle Stufen bestätigt: kein nächster Schritt', () => {
      const view = pathView(path, { lp1: { a: '2026-10-13', b: '2026-10-20', c: '2026-10-27' } });
      expect(view.next).toBeNull();
      expect(progressText(view)).toBe('Alle 3 Stufen bestätigt');
    });

    it('Kompetenzprofil zeigt nur Pfade mit mindestens einer bestätigten Stufe', () => {
      const other = { ...path, id: 'lp2', title: 'Anderer' };
      expect(confirmedSummary([path, other], { lp2: { a: '2026-10-13' } }).map((view) => view.path.id)).toEqual(['lp2']);
    });
  });
});
