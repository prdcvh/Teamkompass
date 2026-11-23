/**
 * Termine als Kalenderdatei (iCalendar, RFC 5545) für den Handykalender (SCRUM-179). Reine Logik, ohne Browser.
 *
 * Datenschutz: In die Datei kommen je Termin nur Titel (bei Spielen mit Gegner), Datum, Startzeit, Dauer und Ort.
 * Die Felder werden einzeln gelesen, das Termin-Objekt wird nie als Ganzes übernommen: Notizen, Ergebnisse, Bewertungen,
 * Zu-/Absagen und alles andere mit Bezug zu Personen kommen so nicht hinein, auch wenn sie am Termin hängen.
 *
 * Zeiten: `DTSTART;TZID=Europe/Berlin` mit eingebettetem VTIMEZONE-Block (EU-Regeln: Sommerzeit vom letzten Sonntag im
 * März bis zum letzten Sonntag im Oktober), damit Apple, Google und Outlook die Zeitumstellung selbst richtig anwenden.
 * Termine ohne Uhrzeit sind Ganztagstermine (`VALUE=DATE`).
 */
import { addDays } from '../shared/dates';
import { EVENT_TIME_ZONE, type TeamEvent, plannedMinutes } from './event';

const CRLF = '\r\n';
export const ICAL_PRODID = '-//TeamKompass//Termine//DE';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Maskiert `\`, `;`, `,` und Zeilenumbrüche für TEXT-Werte (RFC 5545, 3.3.11). */
export function escapeIcalText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Bricht eine Zeile nach höchstens 75 Oktetten (UTF-8) um; Folgezeilen beginnen mit einem Leerzeichen (RFC 5545, 3.1). */
export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // Erste Zeile 75 Oktette, Folgezeilen 74 (das führende Leerzeichen zählt mit). Zeichen werden nie zerteilt.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join(CRLF + ' ');
}

const compactDate = (iso: string): string => iso.replaceAll('-', '');

/** `JJJJMMTTTHHMMSS` aus ISO-Datum + `HH:MM` plus Minuten, in lokaler Wanduhrzeit gerechnet. */
function localDateTime(date: string, time: string, plusMinutes = 0): string {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + plusMinutes;
  const dayShift = Math.floor(total / 1440);
  const rest = total - dayShift * 1440;
  const day = dayShift === 0 ? date : addDays(date, dayShift);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${compactDate(day)}T${pad(Math.floor(rest / 60))}${pad(rest % 60)}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Stabile UID aus der Termin-ID: gleicher Termin = gleiche UID, ein erneuter Import aktualisiert statt zu verdoppeln. */
export function icalUid(eventId: string): string {
  return `${eventId.replace(/[^A-Za-z0-9_-]/g, '-')}@teamkompass`;
}

const VTIMEZONE_BERLIN = [
  'BEGIN:VTIMEZONE',
  `TZID:${EVENT_TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Die Termine, die in die Datei kommen: ab `fromDate` (inklusive), nach Datum und Uhrzeit sortiert. Ungültige Daten fallen weg. */
export function calendarEvents(events: readonly TeamEvent[], fromDate: string): TeamEvent[] {
  return events
    .filter((event) => DATE.test(event.date) && event.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.id.localeCompare(b.id));
}

function summaryOf(event: TeamEvent): string {
  const title = event.title.trim() || event.type;
  const opponent = event.type === 'Spiel' ? event.opponent.trim() : '';
  return opponent && !title.toLowerCase().includes(opponent.toLowerCase()) ? `${title} (vs. ${opponent})` : title;
}

/** Baut die Kalenderdatei. `fromDate` = erstes Datum, das noch aufgenommen wird (ISO, Berliner Datum von heute). */
export function buildIcs(events: readonly TeamEvent[], options: { fromDate: string; now: Date; calendarName?: string }): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${ICAL_PRODID}`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (options.calendarName) lines.push(`X-WR-CALNAME:${escapeIcalText(options.calendarName)}`, `X-WR-TIMEZONE:${EVENT_TIME_ZONE}`);
  const selected = calendarEvents(events, options.fromDate);
  const stamp = utcStamp(options.now);
  if (selected.some((event) => event.startTime !== null && TIME.test(event.startTime))) lines.push(...VTIMEZONE_BERLIN);
  for (const event of selected) {
    lines.push('BEGIN:VEVENT', `UID:${icalUid(event.id)}`, `DTSTAMP:${stamp}`);
    if (event.startTime !== null && TIME.test(event.startTime)) {
      lines.push(
        `DTSTART;TZID=${EVENT_TIME_ZONE}:${localDateTime(event.date, event.startTime)}`,
        `DTEND;TZID=${EVENT_TIME_ZONE}:${localDateTime(event.date, event.startTime, plannedMinutes(event))}`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(event.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`);
    }
    lines.push(`SUMMARY:${escapeIcalText(summaryOf(event))}`);
    if (event.location.trim()) lines.push(`LOCATION:${escapeIcalText(event.location.trim())}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcalLine).join(CRLF) + CRLF;
}

export const ICS_MIME_TYPE = 'text/calendar;charset=utf-8';
export const icsFileName = (teamId: string): string => `teamkompass-${teamId.replace(/[^A-Za-z0-9_-]/g, '-')}.ics`;
