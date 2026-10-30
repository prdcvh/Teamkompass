/**
 * Spielplan-Import per CSV (SCRUM-189): reiner Parser und Dublettenerkennung, ohne Angular und ohne Datenbank.
 * Die Datei wird nur im Browser gelesen. Alle Werte bleiben Text (Gegner, Ort); angelegt wird später über denselben
 * Weg wie ein von Hand angelegtes Spiel (`EventsService.importGames` → `validateDraft` / `eventFromDraft`).
 */
import { type EventDraft, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, emptyDraft, isTime, validateDraft } from './event';
import { isIsoDate } from '../shared/dates';

/** Mehr Zeilen werden abgelehnt: ein Firestore-Schreibvorgang fasst höchstens 500 Dokumente, wir lassen Luft. */
export const MAX_IMPORT_ROWS = 450;
/** Größere Dateien sind sicher kein Spielplan. */
export const MAX_IMPORT_BYTES = 1_000_000;

export type HomeAway = 'home' | 'away' | null;

/** Eine Datenzeile nach dem Einlesen. `line` zählt Zeilen der Datei (Kopfzeile = 1). */
export interface ParsedRow {
  readonly line: number;
  readonly date: string;
  /** `HH:MM` oder leer. */
  readonly time: string;
  readonly homeAway: HomeAway;
  readonly opponent: string;
  readonly location: string;
  /** Fehlermeldungen für diese Zeile; leer = Zeile ist in Ordnung. */
  readonly errors: readonly string[];
}

export interface ParsedSchedule {
  /** Fehler, die die ganze Datei betreffen (keine Kopfzeile, zu viele Zeilen, leer); dann gibt es keine Zeilen. */
  readonly fileError: string | null;
  readonly rows: readonly ParsedRow[];
}

/** Spalten der Vorlage (in dieser Reihenfolge). */
export const TEMPLATE_HEADER = ['Datum', 'Uhrzeit', 'Heim/Gast', 'Gegner', 'Ort'] as const;

/** Inhalt der Vorlage: Kopfzeile und eine Beispielzeile, Trenner `;` (öffnet in deutschem Excel richtig). */
export function templateCsv(): string {
  return `${TEMPLATE_HEADER.join(';')}\r\n03.10.2026;11:00;Heim;SV Beispiel 1910;Hauptplatz\r\n`;
}

export const TEMPLATE_FILE_NAME = 'spielplan-vorlage.csv';

/** Trenner raten: das häufigste von `;`, `,` und Tab in der ersten nichtleeren Zeile (außerhalb von Anführungszeichen). */
export function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r') && Object.values(counts).some((count) => count > 0)) break;
    else if (!quoted && char in counts) counts[char] += 1;
  }
  // Bei Gleichstand gewinnt der deutsche Standard `;`.
  return [';', ',', '\t'].reduce((best, current) => (counts[current] > counts[best] ? current : best), ';');
}

/** CSV → Tabelle. Versteht Anführungszeichen (auch `""` und Zeilenumbrüche darin), `\r\n` und eine BOM am Anfang. */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  return parseCsvLines(input, delimiter).map((entry) => entry.cells);
}

/** Wie {@link parseCsv}, mit der Zeilennummer (1-basiert) im Text, in der jede Zeile beginnt; leere Zeilen fehlen. */
export function parseCsvLines(input: string, delimiter = detectDelimiter(input)): { cells: string[]; line: number }[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let touched = false; // in dieser Zeile wurde schon etwas gelesen
  let line = 1; // aktuelle Zeile im Text
  let rowLine = 1; // Zeile, in der die aktuelle Datenzeile begann
  const touch = () => {
    if (!touched) rowLine = line;
    touched = true;
  };
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    if (touched || row.length > 0) {
      endCell();
      rows.push({ cells: row, line: rowLine });
    }
    row = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
    } else if (char === '"') {
      touch();
      quoted = true;
    } else if (char === delimiter) {
      touch();
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
    } else {
      touch();
      cell += char;
    }
  }
  endRow();
  return rows;
}

type Field = 'date' | 'time' | 'homeAway' | 'opponent' | 'location';

const HEADER_NAMES: Record<Field, readonly string[]> = {
  date: ['datum', 'tag', 'spieltag', 'date'],
  time: ['uhrzeit', 'zeit', 'anstoss', 'anstoß', 'beginn', 'startzeit', 'ankick', 'time'],
  homeAway: ['heim/gast', 'heim / gast', 'heimgast', 'heim-gast', 'heim oder gast', 'heim/auswaerts', 'heim/auswärts', 'ort heim/gast'],
  opponent: ['gegner', 'gegnerteam', 'gegnermannschaft', 'mannschaft', 'opponent'],
  location: ['ort', 'spielort', 'platz', 'spielstaette', 'spielstätte', 'austragungsort', 'location'],
};

function headerField(name: string): Field | null {
  const key = name.trim().toLowerCase();
  const entry = (Object.entries(HEADER_NAMES) as [Field, readonly string[]][]).find(([, names]) => names.includes(key));
  return entry ? entry[0] : null;
}

/** Datum `TT.MM.JJJJ` (auch `T.M.JJJJ`, `TT.MM.JJ`) oder `JJJJ-MM-TT` → ISO-Datum; null bei Unsinn (auch 31.02.). */
export function parseDate(value: string): string | null {
  const text = value.trim();
  if (isIsoDate(text)) return text;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(text);
  if (!german) return null;
  const year = german[3].length === 2 ? `20${german[3]}` : german[3];
  const iso = `${year}-${german[2].padStart(2, '0')}-${german[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Uhrzeit `HH:MM` (auch `H:MM`, `HH.MM`, mit „Uhr“) → `HH:MM`; null bei Unsinn. */
export function parseTime(value: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s*Uhr)?$/i.exec(value.trim());
  if (!match) return null;
  const time = `${match[1].padStart(2, '0')}:${match[2]}`;
  return isTime(time) ? time : null;
}

/** Heim/Gast-Wert → Zuordnung; `undefined` = nicht erkannt, `null` = leer. */
export function parseHomeAway(value: string): HomeAway | undefined {
  const text = value.trim().toLowerCase();
  if (text === '') return null;
  if (['heim', 'h', 'heimspiel', 'home'].includes(text)) return 'home';
  if (['gast', 'g', 'auswärts', 'auswaerts', 'a', 'auswärtsspiel', 'auswaertsspiel', 'away'].includes(text)) return 'away';
  return undefined;
}

/** Steuerzeichen raus, Leerraum glätten: Gegner und Ort sind reiner Text. */
function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Liest den Dateiinhalt. Mindestens `Datum` und `Gegner` müssen in der Kopfzeile stehen; die Reihenfolge ist egal. */
export function parseSchedule(text: string): ParsedSchedule {
  const table = parseCsvLines(text);
  if (table.length === 0 || table.every((row) => row.cells.every((cell) => cell.trim() === ''))) {
    return { fileError: 'Die Datei ist leer.', rows: [] };
  }
  const columns = new Map<Field, number>();
  table[0].cells.forEach((name, index) => {
    const field = headerField(name.replace(/^﻿/, ''));
    if (field && !columns.has(field)) columns.set(field, index);
  });
  if (!columns.has('date') || !columns.has('opponent')) {
    return {
      fileError: 'Die Kopfzeile fehlt oder ist nicht erkennbar. Die erste Zeile muss mindestens die Spalten „Datum“ und „Gegner“ enthalten (siehe Vorlage).',
      rows: [],
    };
  }
  const rows: ParsedRow[] = [];
  table.slice(1).forEach(({ cells, line }) => {
    if (cells.every((cell) => cell.trim() === '')) return; // leere Zeile
    const get = (field: Field) => (columns.has(field) ? (cells[columns.get(field) as number] ?? '') : '');
    const errors: string[] = [];

    const rawDate = get('date').trim();
    const date = parseDate(rawDate);
    if (rawDate === '') errors.push('Datum fehlt.');
    else if (date === null) errors.push(`Datum „${rawDate}“ ist ungültig (erwartet TT.MM.JJJJ oder JJJJ-MM-TT).`);

    const rawTime = get('time').trim();
    const time = rawTime === '' ? '' : parseTime(rawTime);
    if (time === null) errors.push(`Uhrzeit „${rawTime}“ ist ungültig (erwartet HH:MM).`);

    const rawSide = get('homeAway');
    const homeAway = parseHomeAway(rawSide);
    if (homeAway === undefined) errors.push(`Heim/Gast „${cleanText(rawSide)}“ ist nicht erkennbar (erlaubt: Heim oder Gast).`);

    const opponent = cleanText(get('opponent'));
    if (opponent === '') errors.push('Gegner fehlt.');
    else if (opponent.length > MAX_TEXT_LENGTH) errors.push(`Der Gegner darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`);

    const location = cleanText(get('location'));
    if (location.length > MAX_TEXT_LENGTH) errors.push(`Der Ort darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`);

    rows.push({ line, date: date ?? '', time: time ?? '', homeAway: homeAway ?? null, opponent, location, errors });
  });
  if (rows.length === 0) return { fileError: 'Die Datei enthält keine Spiele, nur die Kopfzeile.', rows: [] };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      fileError: `Die Datei hat ${rows.length} Zeilen. Pro Import sind höchstens ${MAX_IMPORT_ROWS} erlaubt, damit alles in einem Schritt angelegt werden kann (nichts wird halb angelegt). Bitte die Datei aufteilen.`,
      rows: [],
    };
  }
  return { fileError: null, rows };
}

/** Schlüssel für die Dublettenerkennung: Datum + Gegnername ohne Groß-/Kleinschreibung und doppelte Leerzeichen. */
export function duplicateKey(date: string, opponent: string): string {
  return `${date}|${opponent.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

export type RowStatus = 'ok' | 'error' | 'duplicate-file' | 'duplicate-existing';

export interface CheckedRow {
  readonly row: ParsedRow;
  readonly status: RowStatus;
  /** Anzeigetext zum Status (Fehler oder Dublette). */
  readonly message: string;
}

/**
 * Prüft die Zeilen gegen schon vorhandene Spiele (Datum + Gegner) und untereinander: die erste Zeile gewinnt, jede
 * weitere mit gleichem Datum und Gegner ist eine Dublette. Fehlerhafte Zeilen zählen nicht als „erste“.
 */
export function checkRows(rows: readonly ParsedRow[], existing: readonly { readonly date: string; readonly opponent: string }[]): CheckedRow[] {
  const known = new Set(existing.map((game) => duplicateKey(game.date, game.opponent)));
  const seen = new Map<string, number>();
  return rows.map((row): CheckedRow => {
    if (row.errors.length > 0) return { row, status: 'error', message: row.errors.join(' ') };
    const key = duplicateKey(row.date, row.opponent);
    if (known.has(key)) return { row, status: 'duplicate-existing', message: 'Dieses Spiel gibt es schon (gleiches Datum und gleicher Gegner).' };
    const first = seen.get(key);
    if (first !== undefined) return { row, status: 'duplicate-file', message: `Doppelt in der Datei (gleich wie Zeile ${first}).` };
    seen.set(key, row.line);
    return { row, status: 'ok', message: '' };
  });
}

export interface ImportSummary {
  readonly total: number;
  readonly ok: number;
  readonly errors: number;
  readonly duplicates: number;
}

export function summarize(checked: readonly CheckedRow[]): ImportSummary {
  const count = (test: (status: RowStatus) => boolean) => checked.filter((entry) => test(entry.status)).length;
  return {
    total: checked.length,
    ok: count((status) => status === 'ok'),
    errors: count((status) => status === 'error'),
    duplicates: count((status) => status === 'duplicate-file' || status === 'duplicate-existing'),
  };
}

/** Titel des Spiels: „Heimspiel gegen X“ / „Auswärtsspiel bei X“ / „Spiel gegen X“ (höchstens 60 Zeichen). */
export function gameTitle(row: Pick<ParsedRow, 'homeAway' | 'opponent'>): string {
  const prefix = row.homeAway === 'home' ? 'Heimspiel gegen' : row.homeAway === 'away' ? 'Auswärtsspiel bei' : 'Spiel gegen';
  return `${prefix} ${row.opponent}`.slice(0, MAX_TITLE_LENGTH);
}

/** Entwurf wie aus dem Formular „Event anlegen“ (Typ Spiel, Standardwerte): derselbe Weg wie von Hand. */
export function draftFromRow(row: ParsedRow): EventDraft {
  return { ...emptyDraft(row.date), type: 'Spiel', title: gameTitle(row), opponent: row.opponent, location: row.location, startTime: row.time };
}

/** Die Zeilen, die tatsächlich angelegt werden: nur Status „ok“ und nur, wenn auch die Prüfung des Formulars bestanden ist. */
export function draftsToImport(checked: readonly CheckedRow[]): EventDraft[] {
  return checked
    .filter((entry) => entry.status === 'ok')
    .map((entry) => draftFromRow(entry.row))
    .filter((draft) => Object.keys(validateDraft(draft)).length === 0);
}
