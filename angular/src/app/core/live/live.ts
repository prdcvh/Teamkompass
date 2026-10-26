/**
 * Live-Modus (SCRUM-213): reine Logik für die Vollbildansicht, in der der Trainer auf dem Platz mit Plus/Minus Punkte vergibt.
 */
import { type Player } from '../player/player';
import { type Attendance } from '../ratings/rating';

/** Feste Schrittweiten der Umschaltleiste (SCRUM-214); die erste ist der Standard. */
export const LIVE_STEPS: readonly number[] = [1, 2, 3, 5];
export const MIN_CUSTOM_STEP = 1;
export const MAX_CUSTOM_STEP = 20;
export const STEP_STORAGE_KEY = 'teamkompass-live-step';

/** Eigene Schrittweite prüfen: nur ganze Zahlen von 1 bis 20. Alles andere (leer, 0, negativ, Kommazahl, Text) ergibt null. */
export function parseCustomStep(input: unknown): number | null {
  const text = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number(text);
  return value >= MIN_CUSTOM_STEP && value <= MAX_CUSTOM_STEP ? value : null;
}

export interface StepPrefs {
  readonly step: number;
  /** Zuletzt eingegebene eigene Zahl; erscheint als eigener Knopf in der Leiste (nur wenn sie nicht schon fest ist). */
  readonly custom: number | null;
}

export const DEFAULT_STEP_PREFS: StepPrefs = { step: LIVE_STEPS[0], custom: null };

/** Knöpfe der Leiste: feste Werte, danach ggf. die eigene Zahl. */
export function stepOptions(custom: number | null): number[] {
  return custom !== null && !LIVE_STEPS.includes(custom) ? [...LIVE_STEPS, custom] : [...LIVE_STEPS];
}

/** Gespeicherte Einstellung lesen; Kaputtes oder Ungültiges fällt auf den Standard zurück. */
export function loadStepPrefs(storage: Pick<Storage, 'getItem'> | null): StepPrefs {
  try {
    const raw = storage?.getItem(STEP_STORAGE_KEY);
    if (!raw) return DEFAULT_STEP_PREFS;
    const data = JSON.parse(raw) as { step?: unknown; custom?: unknown };
    const custom = data.custom === null || data.custom === undefined ? null : parseCustomStep(data.custom);
    const step = typeof data.step === 'number' && stepOptions(custom).includes(data.step) ? data.step : LIVE_STEPS[0];
    return { step, custom };
  } catch {
    return DEFAULT_STEP_PREFS;
  }
}

export function saveStepPrefs(storage: Pick<Storage, 'setItem'> | null, prefs: StepPrefs): void {
  try {
    storage?.setItem(STEP_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Speicher gesperrt (privater Modus): dann gilt die Wahl nur für diese Sitzung.
  }
}

/** Zugriff auf den Gerätespeicher, der selbst im gesperrten Zustand nicht wirft. */
export function deviceStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Punkte als Text mit echtem Minuszeichen (U+2212), damit negative Werte auch draußen sofort auffallen. */
export function pointsLabel(points: number): string {
  return points < 0 ? `−${Math.abs(points)}` : String(points);
}

/** Wer fehlt oder gehört nicht zum Kader dieses Events? Diese Spieler erscheinen gesammelt unter „Nicht da“. */
export function isAway(attendance: Attendance): boolean {
  return attendance === 'absent' || attendance === 'excluded';
}

export interface LiveRow {
  readonly id: string;
  /** Vorname bzw. Rufname; bei gleichem Vornamen mit Anfangsbuchstabe des Nachnamens. */
  readonly label: string;
}

/**
 * Feste Reihenfolge der Sitzung: alphabetisch nach vollem Namen (hängt nie von den Punkten ab, sodass nichts umspringt).
 * Namen: nur der Vorname; teilen sich mehrere Spieler des Kaders einen Vornamen, kommt der Anfangsbuchstabe des Nachnamens dazu.
 */
export function liveRows(players: readonly Pick<Player, 'id' | 'name'>[]): LiveRow[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    const key = (player.name.trim().split(/\s+/)[0] ?? '').toLocaleLowerCase('de');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...players]
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id))
    .map((player) => {
      const parts = player.name.trim().split(/\s+/);
      const given = parts[0] ?? '';
      const duplicate = (counts.get(given.toLocaleLowerCase('de')) ?? 0) > 1;
      const initial = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
      return { id: player.id, label: duplicate && initial ? `${given} ${initial.toLocaleUpperCase('de')}.` : given };
    });
}

/** Zwei Tipps auf denselben Knopf innerhalb dieser Zeit gelten als Prellen und zählen nur einmal (SCRUM-215). */
export const DOUBLE_TAP_MS = 300;
/** So viele Änderungen lassen sich Schritt für Schritt zurücknehmen (Ticket: mindestens 10). */
export const UNDO_LIMIT = 20;
/** So lange bleibt der „Rückgängig“-Knopf nach einem Tipp sichtbar. */
export const UNDO_VISIBLE_MS = 6000;

/**
 * Doppeltipp-Schutz: lässt einen Tipp nur durch, wenn der letzte durchgelassene Tipp auf denselben Knopf (`key`) mindestens
 * `windowMs` zurückliegt. Verglichen wird mit dem letzten durchgelassenen Tipp, nicht mit dem letzten Versuch – bewusstes
 * schnelles Tippen (alle ~300 ms oder langsamer) geht deshalb immer durch. Verschiedene Knöpfe stören sich nicht.
 */
export function createTapGuard(windowMs: number = DOUBLE_TAP_MS): (key: string, now: number) => boolean {
  const last = new Map<string, number>();
  return (key, now) => {
    const previous = last.get(key);
    if (previous !== undefined && now >= previous && now - previous < windowMs) return false;
    last.set(key, now);
    return true;
  };
}

export interface LiveChange {
  readonly playerId: string;
  readonly label: string;
  /** Vorzeichenbehaftete Änderung, z. B. 2 oder −2. */
  readonly delta: number;
}

/** Text für Rückmeldung und Rückgängig-Knopf, z. B. „Max +2“ bzw. „Max −2“ (echtes Minuszeichen). */
export function changeLabel(change: Pick<LiveChange, 'label' | 'delta'>): string {
  return `${change.label} ${change.delta < 0 ? '−' : '+'}${Math.abs(change.delta)}`;
}

/** Große Rückmeldung nach einem Tipp, z. B. „Max +2 → 7“ bzw. „Max −2 → −1“. */
export function feedbackText(change: Pick<LiveChange, 'label' | 'delta'>, total: number): string {
  return `${changeLabel(change)} → ${pointsLabel(total)}`;
}

/** Rückgängig-Stapel: die letzten Änderungen; die neueste kommt zuerst wieder heraus, die ältesten fallen bei Überlauf weg. */
export function pushChange(stack: readonly LiveChange[], change: LiveChange, limit: number = UNDO_LIMIT): LiveChange[] {
  return [...stack, change].slice(-limit);
}

export function popChange(stack: readonly LiveChange[]): { readonly change: LiveChange | null; readonly rest: LiveChange[] } {
  if (stack.length === 0) return { change: null, rest: [] };
  return { change: stack[stack.length - 1] ?? null, rest: stack.slice(0, -1) };
}
