import { parseIcs, parseIcsStart, parseMatchTitle, unescapeIcsText, unfoldIcs } from './ics-import';
import { checkRows } from './schedule-import';

const calendar = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n${events.join('')}END:VCALENDAR\r\n`;
const event = (...lines: string[]) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT\r\n`;

describe('ICS-Spielplan-Import (SCRUM-237)', () => {
  it('löst Zeilenfaltung und Escapes auf', () => {
    expect(unfoldIcs('SUMMARY:SV Musterstadt\r\n  - FC Beispiel\r\nX:1\r\n\tA')).toEqual(['SUMMARY:SV Musterstadt - FC Beispiel', 'X:1A']);
    expect(unescapeIcsText('Platz 1\\, Halle\\; Nord\\nHinten \\\\')).toBe('Platz 1, Halle; Nord Hinten \\');
  });

  it('rechnet DTSTART nach Europe/Berlin, mit Sommer- und Winterzeit', () => {
    expect(parseIcsStart('20261003T090000Z')).toEqual({ date: '2026-10-03', time: '11:00' }); // Sommerzeit (+2)
    expect(parseIcsStart('20261128T090000Z')).toEqual({ date: '2026-11-28', time: '10:00' }); // Winterzeit (+1)
    expect(parseIcsStart('20261003T233000Z')).toEqual({ date: '2026-10-04', time: '01:30' }); // Datumswechsel
    // Zeitumstellung 2026: am 25.10. um 01:00 UTC springt Berlin von 03:00 auf 02:00 zurück.
    expect(parseIcsStart('20261024T230000Z')).toEqual({ date: '2026-10-25', time: '01:00' });
    expect(parseIcsStart('20261025T010000Z')).toEqual({ date: '2026-10-25', time: '02:00' });
  });

  it('übernimmt TZID Europe/Berlin und Zeiten ohne Zone als Berliner Zeit und rechnet andere Zonen um', () => {
    const berlin = new Map([['TZID', 'Europe/Berlin']]);
    expect(parseIcsStart('20261003T110000', berlin)).toEqual({ date: '2026-10-03', time: '11:00' });
    expect(parseIcsStart('20261003T110000')).toEqual({ date: '2026-10-03', time: '11:00' });
    expect(parseIcsStart('20260110T110000', berlin)).toEqual({ date: '2026-01-10', time: '11:00' });
    expect(parseIcsStart('20261003T100000', new Map([['TZID', 'Europe/London']]))).toEqual({ date: '2026-10-03', time: '11:00' });
    expect(parseIcsStart('20261003T110000', new Map([['TZID', 'Unbekannte Zone']]))).toEqual({ date: '2026-10-03', time: '11:00' });
  });

  it('versteht ganztägige Termine und lehnt Unsinn ab', () => {
    expect(parseIcsStart('20261003', new Map([['VALUE', 'DATE']]))).toEqual({ date: '2026-10-03', time: '' });
    expect(parseIcsStart('20260231')).toBeNull();
    expect(parseIcsStart('morgen')).toBeNull();
    expect(parseIcsStart('20261003T256100')).toBeNull();
  });

  it('erkennt Heim/Gast über den eigenen Namen und toleriert Trenner', () => {
    expect(parseMatchTitle('SG Muster - FC Beispiel', 'SG Muster')).toEqual({ ok: true, homeAway: 'home', opponent: 'FC Beispiel' });
    expect(parseMatchTitle('FC Beispiel – SG Muster', 'sg  muster')).toEqual({ ok: true, homeAway: 'away', opponent: 'FC Beispiel' });
    expect(parseMatchTitle('FC Beispiel : SG Muster U15', 'SG Muster')).toEqual({ ok: true, homeAway: 'away', opponent: 'FC Beispiel' });
    expect(parseMatchTitle('SG Ober-Mörlen - TSV Süd - Zweite', 'SG Ober-Mörlen')).toEqual({ ok: true, homeAway: 'home', opponent: 'TSV Süd - Zweite' });
  });

  it('rät nicht: unbekanntes Titelformat und unpassender Name sind Fehler', () => {
    expect(parseMatchTitle('Training', 'SG Muster').ok).toBe(false);
    expect(parseMatchTitle('FC A - FC B', 'SG Muster')).toMatchObject({ ok: false });
    expect(parseMatchTitle('SG Muster - SG Muster II', 'SG Muster')).toMatchObject({ ok: true, opponent: 'SG Muster II' });
    expect(parseMatchTitle('SG Muster U15 - SG Muster U17', 'SG Muster')).toMatchObject({ ok: false });
  });

  it('wandelt mehrere Termine in Zeilen um (Faltung, Escapes, Ort, UTC und Berliner Zeit)', () => {
    const text = calendar(
      event('UID:1', 'DTSTART:20261003T090000Z', 'DTEND:20261003T103000Z', 'SUMMARY:SG Muster - FC Beispiel', 'LOCATION:Sportplatz\\, Hauptstr. 1\\, 12345 Ort'),
      event('UID:2', 'DTSTART;TZID=Europe/Berlin:20261010T143000', 'SUMMARY:TSV Nord - SG Muster', 'LOCATION:Kunstrasen am\r\n  Stadion'),
      event('UID:3', 'DTSTART;VALUE=DATE:20261017', 'SUMMARY:Mannschaftsabend'),
      event('UID:4', 'DTSTART:20261024T100000', 'SUMMARY:SG Muster - Schiefer\\; Name', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'SUMMARY:Erinnerung', 'END:VALARM'),
      event('UID:5', 'DTSTART:20261031T100000', 'SUMMARY:SG Muster - Abgesagt FC', 'STATUS:CANCELLED'),
    );
    const parsed = parseIcs(text, 'SG Muster');
    expect(parsed.fileError).toBeNull();
    expect(parsed.rows.map((row) => [row.line, row.date, row.time, row.homeAway, row.opponent, row.location, row.errors.length])).toEqual([
      [1, '2026-10-03', '11:00', 'home', 'FC Beispiel', 'Sportplatz, Hauptstr. 1, 12345 Ort', 0],
      [2, '2026-10-10', '14:30', 'away', 'TSV Nord', 'Kunstrasen am Stadion', 0],
      [3, '2026-10-17', '', null, 'Mannschaftsabend', '', 1],
      [4, '2026-10-24', '10:00', 'home', 'Schiefer; Name', '', 0],
    ]);
    expect(parsed.rows[2].errors[0]).toContain('nicht erkannt');
  });

  it('nutzt Dublettenprüfung und Fehlerstatus des CSV-Imports', () => {
    const text = calendar(
      event('DTSTART:20261003T090000Z', 'SUMMARY:SG Muster - FC Beispiel'),
      event('DTSTART:20261003T090000Z', 'SUMMARY:SG Muster - fc beispiel'),
      event('DTSTART:20261010T090000Z', 'SUMMARY:SG Muster - TSV Alt'),
      event('DTSTART:kaputt', 'SUMMARY:SG Muster - TSV Neu'),
      event('SUMMARY:SG Muster - TSV Ohne Datum'),
      event('DTSTART:20261017T090000Z', 'SUMMARY:Mannschaftsabend'),
    );
    const checked = checkRows(parseIcs(text, 'SG Muster').rows, [{ date: '2026-10-10', opponent: 'TSV Alt' }]);
    expect(checked.map((entry) => entry.status)).toEqual(['ok', 'duplicate-file', 'duplicate-existing', 'error', 'error', 'error']);
  });

  it('meldet Dateifehler statt zu raten', () => {
    expect(parseIcs('Datum;Gegner', 'SG Muster').fileError).toContain('keine Kalenderdatei');
    expect(parseIcs(calendar(), 'SG Muster').fileError).toContain('keine Termine');
    expect(parseIcs(calendar(event('DTSTART:20261003T090000Z', 'SUMMARY:A - B')), '  ').fileError).toContain('Namen deiner Mannschaft');
  });

  it('liest LF-Zeilenenden, BOM und Kleinschreibung der Eigenschaftsnamen', () => {
    const text = '﻿BEGIN:VCALENDAR\nBEGIN:VEVENT\ndtstart:20261003T090000Z\nsummary:SG Muster - FC Beispiel\nEND:VEVENT\nEND:VCALENDAR\n';
    expect(parseIcs(text, 'SG Muster').rows[0]).toMatchObject({ date: '2026-10-03', time: '11:00', opponent: 'FC Beispiel', homeAway: 'home' });
  });

  it('lehnt zu viele Termine ab', () => {
    const many = calendar(...Array.from({ length: 451 }, (_, i) => event('DTSTART:20261003T090000Z', `SUMMARY:SG Muster - Gegner ${i}`)));
    expect(parseIcs(many, 'SG Muster').fileError).toContain('höchstens 450');
  });
});
