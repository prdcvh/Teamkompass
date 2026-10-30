import { MAX_IMPORT_ROWS, checkRows, detectDelimiter, draftFromRow, draftsToImport, gameTitle, parseCsv, parseDate, parseHomeAway, parseSchedule, parseTime, summarize, templateCsv } from './schedule-import';
import { validateDraft } from './event';

describe('Spielplan-Import: Einlesen (SCRUM-189)', () => {
  const header = 'Datum;Uhrzeit;Heim/Gast;Gegner;Ort';

  describe('parseCsv', () => {
    it('erkennt Semikolon und Komma als Trenner', () => {
      expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
      expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
      expect(detectDelimiter('a\tb\tc')).toBe('\t');
      expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
      expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('versteht Anführungszeichen, doppelte Anführungszeichen und Trenner/Zeilenumbruch darin', () => {
      expect(parseCsv('a;b\n"x;y";"sagt ""hi"""\n"zwei\nzeilen";z')).toEqual([['a', 'b'], ['x;y', 'sagt "hi"'], ['zwei\nzeilen', 'z']]);
      // Komma in Anführungszeichen zählt beim Erkennen des Trenners nicht.
      expect(detectDelimiter('"a,b";c\n1;2')).toBe(';');
    });

    it('überspringt die BOM am Anfang und kommt mit CRLF und fehlendem Zeilenende zurecht', () => {
      expect(parseCsv('\ufeffa;b\r\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    });

    it('lässt leere Zeilen weg', () => {
      expect(parseCsv('a;b\n\n1;2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
    });
  });

  describe('Felder', () => {
    it('Datum: deutsch und ISO, ungültige Tage abgelehnt', () => {
      expect(parseDate('03.10.2026')).toBe('2026-10-03');
      expect(parseDate('3.1.2026')).toBe('2026-01-03');
      expect(parseDate('03.10.26')).toBe('2026-10-03');
      expect(parseDate('2026-10-03')).toBe('2026-10-03');
      expect(parseDate('31.02.2026')).toBeNull();
      expect(parseDate('2026-13-01')).toBeNull();
      expect(parseDate('morgen')).toBeNull();
    });

    it('Uhrzeit: HH:MM und gängige Schreibweisen', () => {
      expect(parseTime('11:00')).toBe('11:00');
      expect(parseTime('9:30')).toBe('09:30');
      expect(parseTime('11.00 Uhr')).toBe('11:00');
      expect(parseTime('11:00:00')).toBe('11:00');
      expect(parseTime('24:00')).toBeNull();
      expect(parseTime('11:60')).toBeNull();
      expect(parseTime('mittags')).toBeNull();
    });

    it('Heim/Gast', () => {
      expect(parseHomeAway('Heim')).toBe('home');
      expect(parseHomeAway(' h ')).toBe('home');
      expect(parseHomeAway('Gast')).toBe('away');
      expect(parseHomeAway('Auswärts')).toBe('away');
      expect(parseHomeAway('')).toBeNull();
      expect(parseHomeAway('Neutral')).toBeUndefined();
    });
  });

  describe('parseSchedule', () => {
    it('liest eine Datei mit Kopfzeile, Semikolon und BOM', () => {
      const result = parseSchedule(`\ufeff${header}\r\n03.10.2026;11:00;Heim;SV Nord;Hauptplatz\r\n10.10.2026;14:30;Gast;"FC ""Süd"", II";\r\n`);
      expect(result.fileError).toBeNull();
      expect(result.rows).toEqual([
        { line: 2, date: '2026-10-03', time: '11:00', homeAway: 'home', opponent: 'SV Nord', location: 'Hauptplatz', errors: [] },
        { line: 3, date: '2026-10-10', time: '14:30', homeAway: 'away', opponent: 'FC "Süd", II', location: '', errors: [] },
      ]);
    });

    it('liest Komma-getrennte Dateien mit ISO-Datum und beliebiger Spaltenreihenfolge', () => {
      const result = parseSchedule('Gegner,Datum,Ort\nSV Nord,2026-10-03,Platz 2\n');
      expect(result.rows[0]).toMatchObject({ date: '2026-10-03', time: '', homeAway: null, opponent: 'SV Nord', location: 'Platz 2', errors: [] });
    });

    it('überspringt leere Zeilen, zählt aber die Zeilennummern der Datei', () => {
      const result = parseSchedule(`${header}\n;;;;\n\n03.10.2026;11:00;Heim;SV Nord;\n`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].line).toBe(4);
    });

    it('meldet fehlerhafte Zeilen mit Grund, ohne die übrigen zu verwerfen', () => {
      const result = parseSchedule(`${header}\n31.02.2026;11:00;Heim;A;\n03.10.2026;25:00;Heim;B;\n03.10.2026;11:00;Neutral;C;\n03.10.2026;11:00;Heim;;\n03.10.2026;11:00;Heim;${'x'.repeat(51)};\n03.10.2026;;;D;\n`);
      expect(result.rows.map((row) => row.errors.length)).toEqual([1, 1, 1, 1, 1, 0]);
      expect(result.rows[0].errors[0]).toContain('Datum');
      expect(result.rows[1].errors[0]).toContain('Uhrzeit');
      expect(result.rows[2].errors[0]).toContain('Heim/Gast');
      expect(result.rows[3].errors[0]).toContain('Gegner fehlt');
      expect(result.rows[4].errors[0]).toContain('höchstens 50');
    });

    it('lehnt Dateien ohne erkennbare Kopfzeile, leere Dateien und zu große Pläne ab', () => {
      expect(parseSchedule('').fileError).toContain('leer');
      expect(parseSchedule('03.10.2026;11:00;Heim;SV Nord;Platz').fileError).toContain('Kopfzeile');
      expect(parseSchedule(`${header}\n`).fileError).toContain('keine Spiele');
      const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `03.10.2026;11:00;Heim;Gegner ${i};`).join('\n');
      const result = parseSchedule(`${header}\n${many}`);
      expect(result.fileError).toContain('höchstens 450');
      expect(result.rows).toEqual([]);
      expect(parseSchedule(`${header}\n${many.split('\n').slice(0, MAX_IMPORT_ROWS).join('\n')}`).fileError).toBeNull();
    });

    it('behandelt Gegner und Ort als reinen Text (Markup bleibt Text, Steuerzeichen fallen weg)', () => {
      const row = parseSchedule(`${header}\n03.10.2026;11:00;Heim;<img src=x onerror=alert(1)>\u0007;<b>Platz</b>\n`).rows[0];
      expect(row.opponent).toBe('<img src=x onerror=alert(1)>');
      expect(row.location).toBe('<b>Platz</b>');
    });

    it('die Vorlage lässt sich wieder einlesen', () => {
      const result = parseSchedule(templateCsv());
      expect(result.fileError).toBeNull();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].errors).toEqual([]);
    });
  });
});

describe('Spielplan-Import: Dubletten und Anlegen (SCRUM-189)', () => {
  const rows = (text: string) => parseSchedule(`Datum;Uhrzeit;Heim/Gast;Gegner;Ort\n${text}`).rows;

  it('erkennt Dubletten in der Datei (erste Zeile gewinnt, Schreibweise egal)', () => {
    const checked = checkRows(rows('03.10.2026;11:00;Heim;SV Nord;\n03.10.2026;12:00;Gast;  sv   NORD ;\n04.10.2026;11:00;Heim;SV Nord;'), []);
    expect(checked.map((entry) => entry.status)).toEqual(['ok', 'duplicate-file', 'ok']);
    expect(checked[1].message).toContain('Zeile 2');
  });

  it('erkennt Dubletten gegen vorhandene Spiele', () => {
    const checked = checkRows(rows('03.10.2026;11:00;Heim;SV Nord;\n03.10.2026;11:00;Heim;SV Süd;'), [{ date: '2026-10-03', opponent: 'sv nord' }]);
    expect(checked.map((entry) => entry.status)).toEqual(['duplicate-existing', 'ok']);
  });

  it('fehlerhafte Zeilen sind keine Dubletten und verdecken keine gültige Zeile', () => {
    const checked = checkRows(rows('03.10.2026;99:00;Heim;SV Nord;\n03.10.2026;11:00;Heim;SV Nord;'), []);
    expect(checked.map((entry) => entry.status)).toEqual(['error', 'ok']);
    expect(summarize(checked)).toEqual({ total: 2, ok: 1, errors: 1, duplicates: 0 });
  });

  it('legt nur Zeilen mit Status „ok“ an, als Spiel mit Startzeit und Ort wie von Hand', () => {
    const checked = checkRows(rows('03.10.2026;11:00;Heim;SV Nord;Hauptplatz\n03.10.2026;11:00;Heim;SV Nord;\n10.10.2026;;Gast;FC Süd;'), []);
    const drafts = draftsToImport(checked);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ type: 'Spiel', title: 'Heimspiel gegen SV Nord', opponent: 'SV Nord', location: 'Hauptplatz', startTime: '11:00', date: '2026-10-03', id: null, pointsEnabled: true });
    expect(drafts[1]).toMatchObject({ title: 'Auswärtsspiel bei FC Süd', startTime: '' });
    drafts.forEach((draft) => expect(validateDraft(draft)).toEqual({}));
  });

  it('Titel ist ohne Heim/Gast neutral und nie länger als erlaubt', () => {
    expect(gameTitle({ homeAway: null, opponent: 'SV Nord' })).toBe('Spiel gegen SV Nord');
    const long = gameTitle({ homeAway: 'away', opponent: 'x'.repeat(50) });
    expect(long.length).toBeLessThanOrEqual(60);
    expect(validateDraft(draftFromRow({ line: 2, date: '2026-10-03', time: '', homeAway: 'away', opponent: 'x'.repeat(50), location: '', errors: [] }))).toEqual({});
  });
});
