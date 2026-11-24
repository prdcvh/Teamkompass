/**
 * Spielplan-Import aus einer Kalenderdatei (ICS, RFC 5545) – SCRUM-237. Reiner Parser ohne Angular und Datenbank; die
 * Zeilen gehen danach durch dieselbe Vorschau und Dublettenprüfung wie beim CSV-Import (`schedule-import.ts`).
 * Gebaut nach dem Standard, noch nicht an einer echten fussball.de-Datei geprüft: Titel „Heim - Gast“, Zeitzone
 * Europe/Berlin. Was nicht eindeutig lesbar ist, wird als Fehlerzeile markiert statt geraten.
 */
import { MAX_TEXT_LENGTH } from './event';
import { MAX_IMPORT_ROWS, type ParsedRow, type ParsedSchedule, cleanText } from './schedule-import';
import { isIsoDate } from '../shared/dates';

const HOME_ZONE = 'Europe/Berlin';

/** Zeilenfaltung auflösen (Fortsetzungszeile beginnt mit Leerzeichen oder Tab) und in Zeilen teilen. */
export function unfoldIcs(text: string): string[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return clean.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** TEXT-Werte nach RFC 5545: `\n` → Leerzeichen, `\,` `\;` `\\` → das Zeichen selbst. */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, char: string) => (char === 'n' || char === 'N' ? ' ' : char));
}

interface Property {
  readonly name: string;
  readonly params: ReadonlyMap<string, string>;
  readonly value: string;
}

/** `NAME;PARAM=x;PARAM2="a:b":Wert` → Teile. Doppelpunkte in Anführungszeichen der Parameter zählen nicht als Trenner. */
function parseProperty(line: string): Property | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const parts: string[] = [];
  let current = '';
  quoted = false;
  for (const char of line.slice(0, colon)) {
    if (char === '"') quoted = !quoted;
    if (char === ';' && !quoted) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  const params = new Map<string, string>();
  parts.slice(1).forEach((part) => {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).replace(/^"|"$/g, ''));
  });
  return { name: parts[0].trim().toUpperCase(), params, value: line.slice(colon + 1) };
}

function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Unterschied (ms) der Wandzeit der Zone zu UTC zum Zeitpunkt `instant`. */
function zoneOffset(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant / 1000) * 1000;
}

/** Zeitpunkt (UTC-ms) → Datum und Uhrzeit in Europe/Berlin (Sommer-/Winterzeit korrekt). */
function toBerlin(instant: number): IcsStart {
  const local = new Date(instant + zoneOffset(instant, HOME_ZONE));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

/** Wandzeit in einer Zone → UTC-ms (zweimal nachgerechnet wegen der Zeitumstellung). */
function wallToInstant(wall: number, zone: string): number {
  const guess = wall - zoneOffset(wall, zone);
  return wall - zoneOffset(guess, zone);
}

export interface IcsStart {
  readonly date: string;
  /** `HH:MM` oder leer (ganztägig). */
  readonly time: string;
}

/**
 * DTSTART → Datum/Uhrzeit in Europe/Berlin. `…Z` = UTC; mit `TZID` die Wandzeit dieser Zone (unbekannte Zonennamen
 * gelten als Berlin); ohne Zone („floating“) als Berlin; `VALUE=DATE` = ganztägig ohne Uhrzeit. `null` = nicht lesbar.
 */
export function parseIcsStart(value: string, params: ReadonlyMap<string, string> = new Map()): IcsStart | null {
  const text = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (dateOnly) {
    const date = `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
    return isIsoDate(date) ? { date, time: '' } : null;
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/i.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute] = [match[1], match[2], match[3], match[4], match[5]].map(Number);
  if (!isIsoDate(`${match[1]}-${match[2]}-${match[3]}`) || hour > 23 || minute > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (match[7]) return toBerlin(wall);
  const zone = params.get('TZID') ?? HOME_ZONE;
  return toBerlin(wallToInstant(wall, isKnownZone(zone) ? zone : HOME_ZONE));
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Trenner im Titel: ` - `, ` – `, ` — ` oder ` : ` (mit Leerzeichen, damit „SG Ober-Mörlen“ ganz bleibt). */
const TITLE_SEPARATOR = /\s+[-–—:]\s+/;

export type TitleResult =
  | { readonly ok: true; readonly homeAway: 'home' | 'away'; readonly opponent: string }
  | { readonly ok: false; readonly error: string };

/** „Heim - Gast“ mit dem eigenen Mannschaftsnamen → Heim/Gast und Gegner. Nicht eindeutig = Fehler, es wird nichts geraten. */
export function parseMatchTitle(summary: string, ownName: string): TitleResult {
  const title = cleanText(summary);
  const own = normalize(ownName);
  const parts = title.split(TITLE_SEPARATOR);
  if (parts.length < 2) return { ok: false, error: `Titel „${title}“ ist nicht erkannt (erwartet „Heim - Gast“).` };
  const matches = (team: string): 'exact' | 'part' | null => {
    const name = normalize(team);
    if (name === own) return 'exact';
    return own.length >= 3 && name.length >= 3 && (name.includes(own) || own.includes(name)) ? 'part' : null;
  };
  const candidates: { homeAway: 'home' | 'away'; opponent: string; exact: boolean }[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const left = parts.slice(0, i).join(' - ');
    const right = parts.slice(i).join(' - ');
    const leftMatch = matches(left);
    const rightMatch = matches(right);
    if (leftMatch && rightMatch && leftMatch === rightMatch) return { ok: false, error: `Titel „${title}“: Heim und Gast passen beide zum eigenen Namen – nicht eindeutig.` };
    // Passt eine Seite genau und die andere nur teilweise („SG Muster“ gegen „SG Muster II“), gewinnt die genaue.
    if (leftMatch && (!rightMatch || leftMatch === 'exact')) candidates.push({ homeAway: 'home', opponent: right, exact: leftMatch === 'exact' });
    else if (rightMatch) candidates.push({ homeAway: 'away', opponent: left, exact: rightMatch === 'exact' });
  }
  const exact = candidates.filter((candidate) => candidate.exact);
  const pool = exact.length > 0 ? exact : candidates;
  if (pool.length === 0) return { ok: false, error: `Titel „${title}“: Weder Heim noch Gast passt zu „${cleanText(ownName)}“.` };
  if (pool.length > 1) return { ok: false, error: `Titel „${title}“ ist nicht eindeutig lesbar.` };
  return { ok: true, homeAway: pool[0].homeAway, opponent: pool[0].opponent };
}

/** Prüft grob, ob der Text wie eine Kalenderdatei aussieht. */
export function looksLikeIcs(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/im.test(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Alle Eigenschaften der VEVENTs; Eigenschaften verschachtelter Teile (z. B. Erinnerungen) bleiben draußen. */
function collectEvents(text: string): Property[][] {
  const events: Property[][] = [];
  let current: Property[] | null = null;
  let depth = 0;
  for (const line of unfoldIcs(text)) {
    const upper = line.trim().toUpperCase();
    if (current === null) {
      if (upper === 'BEGIN:VEVENT') {
        current = [];
        depth = 0;
      }
    } else if (upper.startsWith('BEGIN:')) depth += 1;
    else if (upper.startsWith('END:')) {
      if (depth > 0) depth -= 1;
      else {
        events.push(current);
        current = null;
      }
    } else if (depth === 0) {
      const property = parseProperty(line);
      if (property) current.push(property);
    }
  }
  return events;
}

/**
 * Liest eine ICS-Datei zu denselben Zeilen wie der CSV-Import. `line` ist die laufende Nummer des Termins (1-basiert).
 * Abgesagte Termine (`STATUS:CANCELLED`) werden übergangen.
 */
export function parseIcs(text: string, ownName: string): ParsedSchedule {
  if (!looksLikeIcs(text)) return { fileError: 'Das ist keine Kalenderdatei (ICS). Sie muss mit „BEGIN:VCALENDAR“ beginnen.', rows: [] };
  if (cleanText(ownName) === '') return { fileError: 'Bitte zuerst den Namen deiner Mannschaft eintragen, damit Heim und Gast erkannt werden.', rows: [] };

  const rows: ParsedRow[] = [];
  collectEvents(text).forEach((properties) => {
    const first = (name: string) => properties.find((property) => property.name === name);
    if (first('STATUS')?.value.trim().toUpperCase() === 'CANCELLED') return;
    const errors: string[] = [];

    const dtstart = first('DTSTART');
    const start = dtstart ? parseIcsStart(dtstart.value, dtstart.params) : null;
    if (!dtstart) errors.push('Datum fehlt (kein DTSTART).');
    else if (start === null) errors.push(`Datum/Uhrzeit „${cleanText(dtstart.value)}“ ist nicht lesbar.`);

    const summary = unescapeIcsText(first('SUMMARY')?.value ?? '');
    const title = summary.trim() === '' ? ({ ok: false, error: 'Titel fehlt.' } as const) : parseMatchTitle(summary, ownName);
    if (!title.ok) errors.push(title.error);
    const opponent = title.ok ? cleanText(title.opponent) : '';
    if (opponent.length > MAX_TEXT_LENGTH) errors.push(`Der Gegner darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`);

    const location = cleanText(unescapeIcsText(first('LOCATION')?.value ?? ''));
    if (location.length > MAX_TEXT_LENGTH) errors.push(`Der Ort darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`);

    rows.push({
      line: rows.length + 1,
      date: start?.date ?? '',
      time: start?.time ?? '',
      homeAway: title.ok ? title.homeAway : null,
      opponent: title.ok ? opponent : cleanText(summary),
      location,
      errors,
    });
  });

  if (rows.length === 0) return { fileError: 'Die Datei enthält keine Termine.', rows: [] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { fileError: `Die Datei hat ${rows.length} Termine. Pro Import sind höchstens ${MAX_IMPORT_ROWS} erlaubt. Bitte die Datei aufteilen.`, rows: [] };
  }
  return { fileError: null, rows };
}
