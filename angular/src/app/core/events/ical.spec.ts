import { describe, expect, it } from 'vitest';
import { buildIcs, calendarEvents, escapeIcalText, foldIcalLine, icalUid, icsFileName } from './ical';
import type { TeamEvent } from './event';

const event = (overrides: Partial<TeamEvent> = {}): TeamEvent => ({
  id: 'e1', type: 'Training', title: 'Training', date: '2026-07-14', exertion: 5, intensity: 2, location: 'Kunstrasen', trainingFocus: '',
  opponent: '', goalsFor: null, goalsAgainst: null, matchDuration: null, startTime: '18:00', durationMinutes: 75, locationCoords: null, notes: '',
  ...overrides,
});
const NOW = new Date('2026-07-01T10:15:30.123Z');
const build = (events: TeamEvent[], fromDate = '2026-07-01') => buildIcs(events, { fromDate, now: NOW });
const lines = (ics: string) => ics.split('\r\n');

describe('buildIcs (SCRUM-179)', () => {
  it('liefert einen gültigen Kalender mit CRLF und Pflichtfeldern', () => {
    const ics = build([event()]);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const l = lines(ics);
    expect(l.slice(0, 4)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TeamKompass//Termine//DE', 'CALSCALE:GREGORIAN']);
    expect(l).toContain('BEGIN:VEVENT');
    expect(l).toContain('UID:e1@teamkompass');
    expect(l).toContain('DTSTAMP:20260701T101530Z');
    expect(l).toContain('SUMMARY:Training');
    expect(l).toContain('LOCATION:Kunstrasen');
    expect(l.filter((x) => x.startsWith('BEGIN:')).length).toBe(l.filter((x) => x.startsWith('END:')).length);
  });

  it('Sommerzeit: Europe/Berlin mit TZID und Dauer als Ende; VTIMEZONE enthalten', () => {
    const ics = build([event()]);
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20260714T180000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20260714T191500');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
  });

  it('Winterzeit: gleiche Wanduhrzeit mit TZID (Umrechnung übernimmt der Kalender per VTIMEZONE)', () => {
    const ics = build([event({ date: '2026-12-15', startTime: '17:30', durationMinutes: 90 })], '2026-12-01');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261215T173000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20261215T190000');
  });

  it('Ende nach Mitternacht rollt aufs nächste Datum', () => {
    const ics = build([event({ date: '2026-12-31', startTime: '23:30', durationMinutes: 60 })], '2026-12-01');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20270101T003000');
  });

  it('Spiel nutzt die Spieldauer; ohne Angaben gilt der Standard von 90 Minuten', () => {
    expect(build([event({ type: 'Spiel', matchDuration: 70, durationMinutes: null })])).toContain('DTEND;TZID=Europe/Berlin:20260714T191000');
    expect(build([event({ durationMinutes: null })])).toContain('DTEND;TZID=Europe/Berlin:20260714T193000');
  });

  it('Termin ohne Uhrzeit wird Ganztagstermin (Ende = Folgetag), ohne VTIMEZONE', () => {
    const ics = build([event({ startTime: null, date: '2026-07-31' })]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260731');
    expect(ics).toContain('DTEND;VALUE=DATE:20260801');
    expect(ics).not.toContain('VTIMEZONE');
  });

  it('lässt Termine vor dem Stichtag und mit ungültigem Datum weg und sortiert', () => {
    const list = calendarEvents([event({ id: 'b', date: '2026-07-20' }), event({ id: 'old', date: '2026-06-30' }), event({ id: 'bad', date: 'x' }), event({ id: 'a', date: '2026-07-01' })], '2026-07-01');
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('Spiel zeigt den Gegner im Titel, nicht doppelt', () => {
    expect(build([event({ type: 'Spiel', title: 'Heimspiel', opponent: 'SV Nord' })])).toContain('SUMMARY:Heimspiel (vs. SV Nord)');
    expect(build([event({ type: 'Spiel', title: 'Spiel gegen SV Nord', opponent: 'SV Nord' })])).toContain('SUMMARY:Spiel gegen SV Nord\r\n');
  });

  it('enthält keine Personendaten, auch wenn sie am Termin hängen', () => {
    const risky = {
      ...event({ notes: 'Max Mustermann fehlt, Verletzung', goalsFor: 3, goalsAgainst: 1 }),
      ratings: { p1: 2 }, absences: ['Max Mustermann'], rsvp: { p1: 'no' }, playerNames: ['Erika Beispiel'], warmup: 'Programm A',
    } as unknown as TeamEvent;
    const ics = build([risky]);
    for (const secret of ['Max', 'Mustermann', 'Erika', 'Verletzung', 'fehlt', 'ratings', 'absence', 'Programm', '3:1']) expect(ics).not.toContain(secret);
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('ATTENDEE');
  });

  it('UID wird aus der Termin-ID gebildet und ist stabil', () => {
    expect(icalUid('series:abc/2026-07-14')).toBe('series-abc-2026-07-14@teamkompass');
    expect(lines(build([event()])).filter((x) => x.startsWith('UID:'))).toEqual(lines(build([event()])).filter((x) => x.startsWith('UID:')));
  });

  it('escaped Sonderzeichen in Titel und Ort', () => {
    const ics = build([event({ title: 'Test; A, B\\C', location: 'Halle\nEingang 2' })]);
    expect(ics).toContain('SUMMARY:Test\\; A\\, B\\\\C');
    expect(ics).toContain('LOCATION:Halle\\nEingang 2');
  });

  it('faltet lange Zeilen auf höchstens 75 Oktette, ohne Umlaute zu zerteilen', () => {
    const location = 'Sportplatz Überlängenstraße ü'.repeat(8);
    const ics = build([event({ location })]);
    for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, '')).toContain(`LOCATION:${location}`);
  });
});

describe('Hilfsfunktionen', () => {
  it('escapeIcalText / foldIcalLine / icsFileName', () => {
    expect(escapeIcalText('a\r\nb')).toBe('a\\nb');
    expect(foldIcalLine('x'.repeat(75))).toBe('x'.repeat(75));
    expect(foldIcalLine('x'.repeat(76))).toBe(`${'x'.repeat(75)}\r\n x`);
    expect(icsFileName('U14')).toBe('teamkompass-U14.ics');
    expect(icsFileName('mein team/x')).toBe('teamkompass-mein-team-x.ics');
  });
});
