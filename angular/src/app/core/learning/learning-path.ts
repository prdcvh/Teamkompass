/**
 * Lernpfade (SCRUM-192, PO-Entscheidung A vom 02.11.2026): Der Trainer legt je Position und Altersklasse einen Pfad
 * mit Stufen an. Jede Stufe hat eine kurze Einheit (3–5 Minuten, optional mit Link, z. B. aus dem Tab „Wissen“) und
 * eine kleine Aufgabe für zu Hause. Der Trainer bestätigt je Spieler, dass eine Stufe sitzt; bestätigte Stufen
 * erscheinen im Kompetenzprofil. Es gibt keine Noten im Lernpfad.
 *
 * Speicherorte (siehe firestore.rules, Block „Lernpfade“):
 * - `teams/{teamId}/learningPaths/{pathId}`: Inhalt eines Pfads (Trainer schreibt; Trainer, Spieler und Eltern lesen –
 *   der Inhalt ist für die ganze Mannschaft gleich und enthält keine Spielerdaten).
 * - `teams/{teamId}/learningProgress/{playerId}`: bestätigte Stufen EINES Spielers (Trainer schreibt; lesen nur Trainer
 *   und der eigene Spieler bzw. die eigenen Eltern).
 */
import { normalizeHttpsUrl } from '../knowledge/knowledge';
import { isIsoDate } from '../shared/dates';

export const MAX_PATH_TITLE = 120;
export const MAX_LEVEL_TITLE = 120;
export const MAX_LEVEL_UNIT = 1000;
export const MAX_LEVEL_HOME_TASK = 500;
export const MAX_PATH_LABEL = 40;
/** Höchstzahl Stufen je Pfad (gleiche Grenze in firestore.rules). */
export const MAX_LEVELS = 12;
/** Länge einer kurzen Einheit in Minuten (Ticket: 3–5 Minuten). */
export const UNIT_MINUTES: readonly number[] = [3, 4, 5];
export const DEFAULT_UNIT_MINUTES = 5;

/** Leere Position = Pfad für alle Positionen. */
export const ALL_POSITIONS = '';

export interface LearningLevel {
  readonly id: string;
  readonly title: string;
  /** Kurze Einheit: was im Training bzw. allein geübt wird. */
  readonly unit: string;
  readonly minutes: number;
  /** Optionaler Link (nur https), z. B. ein Video aus dem Tab „Wissen“. */
  readonly url: string | null;
  /** Kleine Aufgabe für zu Hause. */
  readonly homeTask: string;
}

export interface LearningPath {
  readonly id: string;
  readonly title: string;
  /** Kürzel wie „TW“ oder leer für alle Positionen. */
  readonly position: string;
  /** Altersklasse wie „U15“ oder leer für alle. */
  readonly ageGroup: string;
  readonly levels: readonly LearningLevel[];
}

/** Bestätigte Stufen eines Spielers: Pfad-ID → Stufen-ID → Datum der Bestätigung (JJJJ-MM-TT). */
export type PlayerProgress = Readonly<Record<string, Readonly<Record<string, string>>>>;

// ---------------------------------------------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------------------------------------------

export interface LevelDraft {
  readonly id: string;
  readonly title: string;
  readonly unit: string;
  readonly minutes: number;
  readonly url: string;
  readonly homeTask: string;
}

export interface PathDraft {
  readonly id: string | null;
  readonly title: string;
  readonly position: string;
  readonly ageGroup: string;
  readonly levels: readonly LevelDraft[];
}

export type LevelErrors = Partial<Record<'title' | 'unit' | 'url' | 'homeTask', string>>;
export interface PathErrors {
  title?: string;
  position?: string;
  ageGroup?: string;
  levels?: string;
  /** Fehler je Stufe, gleiche Reihenfolge wie im Entwurf. */
  level?: Readonly<Record<number, LevelErrors>>;
}

export function newLevelId(): string {
  return `l${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export function emptyLevelDraft(id: string = newLevelId()): LevelDraft {
  return { id, title: '', unit: '', minutes: DEFAULT_UNIT_MINUTES, url: '', homeTask: '' };
}

export function emptyPathDraft(teamLabel: string): PathDraft {
  return { id: null, title: '', position: ALL_POSITIONS, ageGroup: teamAgeGroup(teamLabel).slice(0, MAX_PATH_LABEL), levels: [emptyLevelDraft()] };
}

export function draftFromPath(path: LearningPath): PathDraft {
  return {
    id: path.id,
    title: path.title,
    position: path.position,
    ageGroup: path.ageGroup,
    levels: path.levels.map((level) => ({ ...level, url: level.url ?? '' })),
  };
}

/** Prüft die Eingaben; ohne Schlüssel = gültig. */
export function validatePathDraft(draft: PathDraft): PathErrors {
  const errors: PathErrors = {};
  const title = draft.title.trim();
  if (title === '') errors.title = 'Bitte einen Namen für den Lernpfad angeben.';
  else if (title.length > MAX_PATH_TITLE) errors.title = `Der Name darf höchstens ${MAX_PATH_TITLE} Zeichen lang sein.`;
  if (draft.position.trim().length > MAX_PATH_LABEL) errors.position = `Höchstens ${MAX_PATH_LABEL} Zeichen.`;
  if (draft.ageGroup.trim().length > MAX_PATH_LABEL) errors.ageGroup = `Höchstens ${MAX_PATH_LABEL} Zeichen.`;
  if (draft.levels.length === 0) errors.levels = 'Bitte mindestens eine Stufe anlegen.';
  else if (draft.levels.length > MAX_LEVELS) errors.levels = `Höchstens ${MAX_LEVELS} Stufen je Lernpfad.`;
  const level: Record<number, LevelErrors> = {};
  draft.levels.forEach((entry, index) => {
    const found: LevelErrors = {};
    const levelTitle = entry.title.trim();
    if (levelTitle === '') found.title = 'Bitte sagen, was in dieser Stufe gelernt wird.';
    else if (levelTitle.length > MAX_LEVEL_TITLE) found.title = `Höchstens ${MAX_LEVEL_TITLE} Zeichen.`;
    if (entry.unit.trim() === '') found.unit = 'Bitte die kurze Einheit beschreiben.';
    else if (entry.unit.trim().length > MAX_LEVEL_UNIT) found.unit = `Höchstens ${MAX_LEVEL_UNIT} Zeichen.`;
    if (entry.url.trim() !== '' && normalizeHttpsUrl(entry.url) === null) found.url = 'Bitte eine gültige Adresse angeben, die mit https:// beginnt.';
    if (entry.homeTask.trim().length > MAX_LEVEL_HOME_TASK) found.homeTask = `Höchstens ${MAX_LEVEL_HOME_TASK} Zeichen.`;
    if (Object.keys(found).length > 0) level[index] = found;
  });
  if (Object.keys(level).length > 0) errors.level = level;
  return errors;
}

export function hasErrors(errors: PathErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Gültigen Entwurf in einen Pfad umwandeln (nur nach fehlerfreiem {@link validatePathDraft}). */
export function pathFromDraft(draft: PathDraft, id: string): LearningPath {
  return {
    id,
    title: draft.title.trim(),
    position: draft.position.trim(),
    ageGroup: draft.ageGroup.trim(),
    levels: draft.levels.map((level) => ({
      id: level.id,
      title: level.title.trim(),
      unit: level.unit.trim(),
      minutes: UNIT_MINUTES.includes(level.minutes) ? level.minutes : DEFAULT_UNIT_MINUTES,
      url: level.url.trim() === '' ? null : normalizeHttpsUrl(level.url),
      homeTask: level.homeTask.trim(),
    })),
  };
}

/** Felder des Firestore-Dokuments (ohne ID und Zeitstempel; den setzt die Zugriffsklasse). */
export function docFromPath(path: LearningPath): Record<string, unknown> {
  return {
    title: path.title,
    position: path.position,
    ageGroup: path.ageGroup,
    levels: path.levels.map((level) => ({ id: level.id, title: level.title, unit: level.unit, minutes: level.minutes, url: level.url, homeTask: level.homeTask })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Lesen (unbrauchbare Angaben werden übersprungen, nie geraten)
// ---------------------------------------------------------------------------------------------------------------

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function levelFromDoc(data: unknown): LearningLevel | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const id = text(raw['id'], 40);
  const title = text(raw['title'], MAX_LEVEL_TITLE);
  if (id === '' || title === '') return null;
  const minutes = typeof raw['minutes'] === 'number' && UNIT_MINUTES.includes(raw['minutes']) ? raw['minutes'] : DEFAULT_UNIT_MINUTES;
  return {
    id,
    title,
    unit: text(raw['unit'], MAX_LEVEL_UNIT),
    minutes,
    url: raw['url'] === null || raw['url'] === undefined ? null : normalizeHttpsUrl(raw['url']),
    homeTask: text(raw['homeTask'], MAX_LEVEL_HOME_TASK),
  };
}

export function pathFromDoc(id: string, data: unknown): LearningPath | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const title = text(raw['title'], MAX_PATH_TITLE);
  if (title === '') return null;
  const seen = new Set<string>();
  const levels = (Array.isArray(raw['levels']) ? raw['levels'] : [])
    .slice(0, MAX_LEVELS)
    .map(levelFromDoc)
    .filter((level): level is LearningLevel => level !== null && !seen.has(level.id) && (seen.add(level.id), true));
  return { id, title, position: text(raw['position'], MAX_PATH_LABEL), ageGroup: text(raw['ageGroup'], MAX_PATH_LABEL), levels };
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function pathsFromDocs(docs: readonly { readonly id: string; readonly data: unknown }[]): LearningPath[] {
  return docs
    .map((entry) => pathFromDoc(entry.id, entry.data))
    .filter((path): path is LearningPath => path !== null)
    .sort((a, b) => collator.compare(a.position, b.position) || collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
}

/** Fortschritt aus `learningProgress/{playerId}`; nur Einträge mit gültigem Datum. */
export function progressFromDoc(data: unknown): PlayerProgress {
  const paths = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['paths'] : null;
  if (typeof paths !== 'object' || paths === null || Array.isArray(paths)) return {};
  const result: Record<string, Record<string, string>> = {};
  for (const [pathId, levels] of Object.entries(paths)) {
    if (typeof levels !== 'object' || levels === null || Array.isArray(levels)) continue;
    const confirmed: Record<string, string> = {};
    for (const [levelId, date] of Object.entries(levels)) if (typeof date === 'string' && isIsoDate(date)) confirmed[levelId] = date;
    if (Object.keys(confirmed).length > 0) result[pathId] = confirmed;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------------------------------------------

/** Anzeige der Position: „Alle Positionen“ bei leerem Wert. */
export function positionLabel(position: string): string {
  return position === ALL_POSITIONS ? 'Alle Positionen' : position;
}

export function ageGroupLabel(ageGroup: string): string {
  return ageGroup === '' ? 'Alle Altersklassen' : ageGroup;
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');

/**
 * Altersklasse aus der Teambezeichnung: „U14“, „U14 Test“, „u 15 (2. Mannschaft)“ → „U14“ bzw. „U15“; ohne U-Angabe die
 * Bezeichnung selbst (z. B. „Erwachsene“).
 */
export function teamAgeGroup(label: string): string {
  const match = /^\s*U\s*(\d{1,2})\b/i.exec(label);
  return match ? `U${Number(match[1])}` : label.trim();
}

/**
 * Gilt der Pfad für diesen Spieler? Position: leer = alle, sonst eine der Positionen des Spielers. Altersklasse: leer =
 * alle, sonst die Altersklasse des Teams (aus der Teambezeichnung, siehe {@link teamAgeGroup}).
 */
export function pathFitsPlayer(path: LearningPath, player: { readonly positions: readonly string[] }, teamLabel: string): boolean {
  const positionOk = path.position === ALL_POSITIONS || player.positions.some((position) => same(position, path.position));
  const ageOk = path.ageGroup === '' || same(path.ageGroup, teamAgeGroup(teamLabel));
  return positionOk && ageOk && path.levels.length > 0;
}

export type LevelState = 'done' | 'next' | 'later';

export interface LevelView {
  readonly level: LearningLevel;
  /** Stufe 1, 2, … in der Reihenfolge des Pfads. */
  readonly number: number;
  readonly state: LevelState;
  /** Datum der Bestätigung oder leer. */
  readonly confirmedAt: string;
}

export interface PathView {
  readonly path: LearningPath;
  readonly levels: readonly LevelView[];
  readonly done: number;
  readonly total: number;
  /** Erste noch nicht bestätigte Stufe; null = alles bestätigt. */
  readonly next: LevelView | null;
  /** Zuletzt (in Pfad-Reihenfolge) bestätigte Stufe; null = noch keine. */
  readonly lastDone: LevelView | null;
}

/** Stand eines Spielers in einem Pfad. Bestätigungen gelöschter Stufen zählen nicht. */
export function pathView(path: LearningPath, progress: PlayerProgress): PathView {
  const confirmed = progress[path.id] ?? {};
  let nextFound = false;
  const levels = path.levels.map((level, index): LevelView => {
    const confirmedAt = confirmed[level.id] ?? '';
    let state: LevelState = 'later';
    if (confirmedAt !== '') state = 'done';
    else if (!nextFound) {
      state = 'next';
      nextFound = true;
    }
    return { level, number: index + 1, state, confirmedAt };
  });
  const doneLevels = levels.filter((entry) => entry.state === 'done');
  return {
    path,
    levels,
    done: doneLevels.length,
    total: levels.length,
    next: levels.find((entry) => entry.state === 'next') ?? null,
    lastDone: doneLevels.at(-1) ?? null,
  };
}

/** Für das Kompetenzprofil: alle Pfade, in denen der Spieler mindestens eine Stufe bestätigt hat. */
export function confirmedSummary(paths: readonly LearningPath[], progress: PlayerProgress): PathView[] {
  return paths.map((path) => pathView(path, progress)).filter((view) => view.done > 0);
}

/** „Stufe 2 von 5“ bzw. „Alle 5 Stufen“. */
export function progressText(view: Pick<PathView, 'done' | 'total'>): string {
  if (view.total > 0 && view.done >= view.total) return `Alle ${view.total} Stufen bestätigt`;
  return `${view.done} von ${view.total} Stufen bestätigt`;
}

export function progressPercent(view: Pick<PathView, 'done' | 'total'>): number {
  return view.total === 0 ? 0 : Math.round((view.done / view.total) * 100);
}
