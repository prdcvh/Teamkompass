/**
 * Situationsrätsel aus Spielszenen (SCRUM-193): Der Trainer hält eine Spielszene als Bild oder Video-Link mit Zeitmarke
 * an und fragt „Wohin passt du?“ – mit 2–4 Antworten und einer kurzen Erklärung. Spieler beantworten jedes Rätsel einmal
 * und sehen danach sofort die Erklärung. Daraus ergibt sich eine eigene Rätsel-Wertung je Spieler (ähnlich Elo), die bei
 * schwierigeren Rätseln stärker steigt. Es gibt keine Rangliste: die Wertung sehen nur der Spieler selbst (und seine
 * Eltern) sowie der Trainer.
 *
 * Speicherorte (siehe firestore.rules, Block „Situationsrätsel“):
 * - `teams/{teamId}/puzzles/{puzzleId}`: Szene, Frage, Antworten, Schwierigkeit – OHNE Lösung (lesen Trainer, Spieler, Eltern).
 * - `teams/{teamId}/puzzleSolutions/{puzzleId}`: richtige Antwort und Erklärung. Spieler und Eltern lesen sie erst, wenn
 *   der Spieler das Rätsel beantwortet hat (die Regeln prüfen, ob seine Antwort existiert).
 * - `teams/{teamId}/puzzleAnswers/{puzzleId}_{playerId}`: die eine Antwort eines Spielers (nur er selbst legt sie an,
 *   ändern geht nicht, löschen nur der Trainer).
 *
 * Die Wertung wird nicht gespeichert, sondern immer aus den Antworten berechnet ({@link ratingHistory}). So kann sie
 * niemand direkt verändern, und sie bleibt nachvollziehbar: jeder Schritt zeigt Wertung vorher, Erwartung und Änderung.
 */
import { normalizeHttpsUrl } from '../knowledge/knowledge';

export const MAX_PUZZLE_TITLE = 120;
export const MAX_PUZZLE_QUESTION = 300;
export const MAX_PUZZLE_ANSWER = 120;
export const MAX_PUZZLE_EXPLANATION = 1000;
/** Gleiche Grenze wie bei Wissen-Links und in firestore.rules. */
export const MAX_PUZZLE_URL = 2000;
export const MIN_ANSWERS = 2;
export const MAX_ANSWERS = 4;
/** Zeitmarke höchstens 10 Stunden (gleiche Grenze in firestore.rules). */
export const MAX_VIDEO_START = 36_000;

export type PuzzleMedia = 'image' | 'video';
export type PuzzleLevel = 1 | 2 | 3;

/** Schwierigkeit: feste Rätsel-Wertung, gegen die der Spieler „spielt“. */
export const PUZZLE_LEVELS: readonly { readonly value: PuzzleLevel; readonly label: string; readonly rating: number }[] = [
  { value: 1, label: 'Leicht', rating: 800 },
  { value: 2, label: 'Mittel', rating: 1000 },
  { value: 3, label: 'Schwer', rating: 1200 },
];

/** Startwert jedes Spielers. */
export const START_RATING = 1000;
/** Wie stark ein Rätsel die Wertung höchstens bewegt (K-Faktor wie im Schach für Einsteiger). */
export const K_FACTOR = 32;

/** Ab so vielen Antworten zählt ein Rätsel für „Das Team versteht diese Situation noch nicht“. */
export const MIN_ANSWERS_FOR_INSIGHT = 3;
/** Unter diesem Anteil richtiger Antworten gilt eine Situation als noch nicht verstanden. */
export const UNDERSTOOD_SHARE = 0.5;

export interface Puzzle {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly media: PuzzleMedia;
  /** Nur https. */
  readonly mediaUrl: string;
  /** Zeitmarke in Sekunden (nur bei Video), sonst null. */
  readonly videoStart: number | null;
  readonly answers: readonly string[];
  readonly level: PuzzleLevel;
}

export interface PuzzleSolution {
  /** Index der richtigen Antwort. */
  readonly correct: number;
  readonly explanation: string;
}

export interface PuzzleAnswer {
  readonly puzzleId: string;
  readonly playerId: string;
  readonly choice: number;
  /** Millisekunden; bei noch nicht bestätigter Antwort der lokale Zeitpunkt. */
  readonly answeredAt: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Formular
// ---------------------------------------------------------------------------------------------------------------

export interface PuzzleDraft {
  readonly id: string | null;
  readonly title: string;
  readonly question: string;
  readonly media: PuzzleMedia;
  readonly mediaUrl: string;
  /** Zeitmarke wie „1:23“, „83“ oder „1:02:03“; leer = Anfang bzw. aus dem Link. */
  readonly videoStart: string;
  readonly answers: readonly string[];
  readonly correct: number;
  readonly explanation: string;
  readonly level: PuzzleLevel;
}

export type PuzzleErrors = Partial<Record<'title' | 'question' | 'mediaUrl' | 'videoStart' | 'answers' | 'correct' | 'explanation', string>> & {
  /** Fehler je Antwort (Index). */
  answer?: Readonly<Record<number, string>>;
};

export function emptyPuzzleDraft(): PuzzleDraft {
  return { id: null, title: '', question: 'Wohin passt du?', media: 'image', mediaUrl: '', videoStart: '', answers: ['', '', ''], correct: 0, explanation: '', level: 2 };
}

export function draftFromPuzzle(puzzle: Puzzle, solution: PuzzleSolution | null): PuzzleDraft {
  return {
    id: puzzle.id,
    title: puzzle.title,
    question: puzzle.question,
    media: puzzle.media,
    mediaUrl: puzzle.mediaUrl,
    videoStart: puzzle.videoStart === null ? '' : formatSeconds(puzzle.videoStart),
    answers: [...puzzle.answers],
    correct: solution && solution.correct < puzzle.answers.length ? solution.correct : 0,
    explanation: solution?.explanation ?? '',
    level: puzzle.level,
  };
}

/** „83“, „1:23“ oder „1:02:03“ → Sekunden; leer → null; Unsinn → NaN. */
export function parseTimestamp(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d{1,5}(:\d{1,2}){0,2}$/.test(text)) return Number.NaN;
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some((part) => part > 59)) return Number.NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Sekunden → „1:23“ bzw. „1:02:03“. */
export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Zeitmarke aus einem YouTube-Link (`t=83`, `t=1m23s`, `start=83`), sonst null. */
export function timestampFromUrl(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const raw = parsed.searchParams.get('t') ?? parsed.searchParams.get('start');
  if (!raw) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (!match || raw === '') return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 && seconds <= MAX_VIDEO_START ? seconds : null;
}

/** Prüft die Eingaben; ohne Schlüssel = gültig. */
export function validatePuzzleDraft(draft: PuzzleDraft): PuzzleErrors {
  const errors: PuzzleErrors = {};
  const title = draft.title.trim();
  if (title === '') errors.title = 'Bitte einen kurzen Namen für die Szene angeben.';
  else if (title.length > MAX_PUZZLE_TITLE) errors.title = `Höchstens ${MAX_PUZZLE_TITLE} Zeichen.`;
  const question = draft.question.trim();
  if (question === '') errors.question = 'Bitte die Frage angeben, z. B. „Wohin passt du?“.';
  else if (question.length > MAX_PUZZLE_QUESTION) errors.question = `Höchstens ${MAX_PUZZLE_QUESTION} Zeichen.`;
  if (draft.mediaUrl.trim() === '') errors.mediaUrl = draft.media === 'image' ? 'Bitte die Adresse des Bildes angeben.' : 'Bitte den Video-Link angeben.';
  else if (draft.mediaUrl.trim().length > MAX_PUZZLE_URL || normalizeHttpsUrl(draft.mediaUrl) === null) errors.mediaUrl = 'Bitte eine gültige Adresse angeben, die mit https:// beginnt.';
  if (draft.media === 'video') {
    const start = parseTimestamp(draft.videoStart);
    if (start !== null && (Number.isNaN(start) || start > MAX_VIDEO_START)) errors.videoStart = 'Bitte die Zeitmarke als Minuten:Sekunden angeben, z. B. 1:23.';
  }
  const filled = draft.answers.map((answer) => answer.trim());
  if (filled.length < MIN_ANSWERS || filled.length > MAX_ANSWERS) errors.answers = `Bitte ${MIN_ANSWERS} bis ${MAX_ANSWERS} Antworten angeben.`;
  const answer: Record<number, string> = {};
  filled.forEach((text, index) => {
    if (text === '') answer[index] = 'Bitte die Antwort ausfüllen oder entfernen.';
    else if (text.length > MAX_PUZZLE_ANSWER) answer[index] = `Höchstens ${MAX_PUZZLE_ANSWER} Zeichen.`;
    else if (filled.findIndex((other) => other.toLocaleLowerCase('de') === text.toLocaleLowerCase('de')) !== index) answer[index] = 'Diese Antwort gibt es schon.';
  });
  if (Object.keys(answer).length > 0) errors.answer = answer;
  if (!Number.isInteger(draft.correct) || draft.correct < 0 || draft.correct >= filled.length) errors.correct = 'Bitte die richtige Antwort markieren.';
  const explanation = draft.explanation.trim();
  if (explanation === '') errors.explanation = 'Bitte kurz erklären, warum die Antwort richtig ist.';
  else if (explanation.length > MAX_PUZZLE_EXPLANATION) errors.explanation = `Höchstens ${MAX_PUZZLE_EXPLANATION} Zeichen.`;
  return errors;
}

export function hasPuzzleErrors(errors: PuzzleErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Gültigen Entwurf umwandeln (nur nach fehlerfreiem {@link validatePuzzleDraft}). */
export function puzzleFromDraft(draft: PuzzleDraft, id: string): { puzzle: Puzzle; solution: PuzzleSolution } {
  const mediaUrl = normalizeHttpsUrl(draft.mediaUrl) ?? '';
  const typed = parseTimestamp(draft.videoStart);
  const videoStart = draft.media === 'video' ? (typed !== null && !Number.isNaN(typed) ? typed : timestampFromUrl(mediaUrl)) : null;
  return {
    puzzle: {
      id,
      title: draft.title.trim(),
      question: draft.question.trim(),
      media: draft.media,
      mediaUrl,
      videoStart,
      answers: draft.answers.map((answer) => answer.trim()),
      level: draft.level,
    },
    solution: { correct: draft.correct, explanation: draft.explanation.trim() },
  };
}

/** Felder von `puzzles/{id}` (ohne Zeitstempel). Die Lösung steht bewusst NICHT darin. */
export function docFromPuzzle(puzzle: Puzzle): Record<string, unknown> {
  return {
    title: puzzle.title,
    question: puzzle.question,
    media: puzzle.media,
    mediaUrl: puzzle.mediaUrl,
    videoStart: puzzle.videoStart,
    answers: [...puzzle.answers],
    level: puzzle.level,
  };
}

export function docFromSolution(solution: PuzzleSolution): Record<string, unknown> {
  return { correct: solution.correct, explanation: solution.explanation };
}

/** Dokument-ID der Antwort: je Spieler und Rätsel genau eine. */
export function answerId(puzzleId: string, playerId: string): string {
  return `${puzzleId}_${playerId}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Lesen (unbrauchbare Angaben werden übersprungen, nie geraten)
// ---------------------------------------------------------------------------------------------------------------

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function puzzleFromDoc(id: string, data: unknown): Puzzle | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const title = text(raw['title'], MAX_PUZZLE_TITLE);
  const media: PuzzleMedia | null = raw['media'] === 'image' || raw['media'] === 'video' ? raw['media'] : null;
  const mediaUrl = normalizeHttpsUrl(raw['mediaUrl']);
  const answers = (Array.isArray(raw['answers']) ? raw['answers'] : []).map((answer) => text(answer, MAX_PUZZLE_ANSWER));
  const level = PUZZLE_LEVELS.find((entry) => entry.value === raw['level'])?.value ?? null;
  if (title === '' || !media || !mediaUrl || level === null || answers.length < MIN_ANSWERS || answers.length > MAX_ANSWERS || answers.includes('')) return null;
  const start = raw['videoStart'];
  const videoStart = media === 'video' && typeof start === 'number' && Number.isInteger(start) && start >= 0 && start <= MAX_VIDEO_START ? start : null;
  return { id, title, question: text(raw['question'], MAX_PUZZLE_QUESTION) || 'Wohin passt du?', media, mediaUrl, videoStart, answers, level };
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export function puzzlesFromDocs(docs: readonly { readonly id: string; readonly data: unknown }[]): Puzzle[] {
  return docs
    .map((entry) => puzzleFromDoc(entry.id, entry.data))
    .filter((puzzle): puzzle is Puzzle => puzzle !== null)
    .sort((a, b) => a.level - b.level || collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
}

export function solutionFromDoc(data: unknown): PuzzleSolution | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const correct = raw['correct'];
  if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0 || correct >= MAX_ANSWERS) return null;
  return { correct, explanation: text(raw['explanation'], MAX_PUZZLE_EXPLANATION) };
}

function millis(value: unknown, fallback: number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

/** Antwort aus `puzzleAnswers/{id}`; ohne Zeitpunkt (noch nicht vom Server bestätigt) gilt `now`. */
export function answerFromDoc(data: unknown, now: number = Date.now()): PuzzleAnswer | null {
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as Record<string, unknown>;
  const puzzleId = text(raw['puzzleId'], 80);
  const playerId = text(raw['playerId'], 80);
  const choice = raw['choice'];
  if (puzzleId === '' || playerId === '' || typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= MAX_ANSWERS) return null;
  return { puzzleId, playerId, choice, answeredAt: millis(raw['answeredAt'], now) };
}

// ---------------------------------------------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------------------------------------------

export function levelLabel(level: PuzzleLevel): string {
  return PUZZLE_LEVELS.find((entry) => entry.value === level)?.label ?? '';
}

export function levelRating(level: PuzzleLevel): number {
  return PUZZLE_LEVELS.find((entry) => entry.value === level)?.rating ?? START_RATING;
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

/** Link zum Video an der Zeitmarke: YouTube mit `t=…s`, Vimeo mit `#t=…s`, sonst `#t=…` (Media-Fragment). */
export function videoLinkAt(url: string, seconds: number | null): string {
  if (!seconds) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.includes(host)) {
    parsed.searchParams.delete('start');
    parsed.searchParams.set('t', `${seconds}s`);
  } else if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    parsed.hash = `t=${seconds}s`;
  } else {
    parsed.hash = `t=${seconds}`;
  }
  return parsed.toString();
}
