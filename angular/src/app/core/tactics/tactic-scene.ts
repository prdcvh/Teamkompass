/**
 * Taktikdiagnostik (SCRUM-267): kodierte Spielszenen mit getrennter Bewertung von Entscheidung und Ausführung.
 * Ergänzt die Teilnote „Spielwirkung“ (eine Schulnote kann nicht trennen, ob die Idee richtig war und nur die
 * Ausführung misslang) und die Situationsrätsel (SCRUM-193, Lernfunktion für Spieler) – ersetzt beides nicht.
 *
 * Gespeichert unter `teams/{teamId}/tacticScenes/{sceneId}`; lesen und schreiben NUR Trainer (kein Spieler, keine
 * Eltern, kein Vereinsadmin, keine Medizin, kein Scout – auch wegen des optionalen Videolinks).
 *
 * Kennzahlen (reine Funktionen, unten):
 * - Entscheidungsqualität = sinnvolle Entscheidungen / beurteilbare Entscheidungen (sinnvoll + nicht sinnvoll).
 *   „Nicht beurteilbar“ zählt nie im Nenner.
 * - Ausführungsquote = erfolgreiche Ausführungen / sinnvolle Entscheidungen mit beurteilbarer Ausführung.
 *   Ausführung wird nur bei sinnvoller Entscheidung erfasst; „nicht beurteilbar“ zählt nie im Nenner.
 * - Nenner 0 → kein Wert (null), nie 0 %. Unter {@link MIN_CASES} Fällen nennt die App nur die Zählung, keinen
 *   Prozentwert („noch keine Aussage“).
 */
import { isIsoDate } from '../shared/dates';

/** Mindestfallzahl, ab der ein Prozentwert gezeigt wird (darunter nur „x von y“). */
export const MIN_CASES = 5;
export const MAX_CONTEXT = 300;
export const MAX_VIDEO_URL = 500;
export const MAX_MINUTE = 150;
export const MAX_SCENE_BY = 80;

export const DECISIONS = ['good', 'poor', 'unclear'] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABELS: Readonly<Record<Decision, string>> = {
  good: 'Sinnvoll',
  poor: 'Nicht sinnvoll',
  unclear: 'Nicht beurteilbar',
};

export const EXECUTIONS = ['success', 'fail', 'unclear'] as const;
export type Execution = (typeof EXECUTIONS)[number];
export const EXECUTION_LABELS: Readonly<Record<Execution, string>> = {
  success: 'Erfolgreich',
  fail: 'Nicht erfolgreich',
  unclear: 'Nicht beurteilbar',
};

/** Optionale Ereignistypen (Mehrfachauswahl). */
export const SITUATION_TYPES = ['scanning', 'space', 'pass', 'cover', 'pressing', 'transition'] as const;
export type SituationType = (typeof SITUATION_TYPES)[number];
export const SITUATION_LABELS: Readonly<Record<SituationType, string>> = {
  scanning: 'Scanning',
  space: 'Raumfindung',
  pass: 'Passentscheidung',
  cover: 'Absicherung',
  pressing: 'Pressing',
  transition: 'Umschalten',
};

/**
 * Kriterien, nach denen der Trainer die Entscheidung einordnet (im Formular sichtbar, damit alle Trainer gleich
 * kodieren). Die Ausführung wird davon getrennt beurteilt.
 */
export const DECISION_CRITERIA: Readonly<Record<Decision, string>> = {
  good: 'Passt zur Lage: freien Mitspieler oder Raum erkannt, Gegnerdruck und Absicherung beachtet, Spielidee des Teams befolgt – auch wenn die Ausführung danach misslingt.',
  poor: 'Bessere Möglichkeit war erkennbar und erreichbar (z. B. freier Mitspieler übersehen, Ball in den Druck gespielt, Absicherung verlassen).',
  unclear: 'Szene nicht eindeutig: Sicht verdeckt, Absicht unklar, Ausschnitt zu kurz. Zählt bei keiner Kennzahl mit.',
};

/** Spielszene, wie sie gespeichert ist. Termin-Datum, -Art und -Titel werden beim Speichern mitgeschrieben. */
export interface TacticScene {
  readonly id: string;
  readonly playerId: string;
  readonly eventId: string;
  readonly eventDate: string;
  /** Art des Termins (Spiel/Training). */
  readonly eventType: string;
  readonly eventTitle: string;
  /** Spielminute bzw. Minute im Training; null = nicht angegeben. */
  readonly minute: number | null;
  /** Kurzer Kontext der Szene (z. B. „Aufbau gegen hohes Pressing, 0:1“). */
  readonly context: string;
  readonly decision: Decision;
  /** Nur bei sinnvoller Entscheidung, sonst null. */
  readonly execution: Execution | null;
  readonly situations: readonly SituationType[];
  /** Optionaler interner Videolink (nur Text, nur Trainer); leer = keiner. */
  readonly videoUrl: string;
  readonly by: string;
  readonly byUid: string;
  readonly createdAt: string;
}

export interface TacticSceneDraft {
  readonly playerId: string;
  readonly minute: string;
  readonly context: string;
  readonly decision: Decision | '';
  readonly execution: Execution | '';
  readonly situations: readonly SituationType[];
  readonly videoUrl: string;
}

export type TacticSceneErrors = Partial<Record<'playerId' | 'minute' | 'context' | 'decision' | 'execution' | 'videoUrl', string>>;

export function emptySceneDraft(playerId = ''): TacticSceneDraft {
  return { playerId, minute: '', context: '', decision: '', execution: '', situations: [], videoUrl: '' };
}

/** Nur `https://`-Adressen, keine Leerzeichen, nicht zu lang. Leer ist erlaubt. */
export function isAllowedVideoUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return true;
  if (url.length > MAX_VIDEO_URL || /\s/.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function validateScene(draft: TacticSceneDraft, playerIds: readonly string[]): TacticSceneErrors {
  const errors: TacticSceneErrors = {};
  if (!draft.playerId || !playerIds.includes(draft.playerId)) errors.playerId = 'Bitte einen Spieler wählen.';
  const minute = draft.minute.trim();
  if (minute && (!/^\d{1,3}$/.test(minute) || Number(minute) > MAX_MINUTE)) errors.minute = `Minute als ganze Zahl von 0 bis ${MAX_MINUTE} (oder leer lassen).`;
  const context = draft.context.trim();
  if (!context) errors.context = 'Bitte kurz die Situation beschreiben (z. B. „Aufbau gegen hohes Pressing“).';
  else if (context.length > MAX_CONTEXT) errors.context = `Höchstens ${MAX_CONTEXT} Zeichen.`;
  if (!DECISIONS.includes(draft.decision as Decision)) errors.decision = 'Bitte die Entscheidung einordnen.';
  if (draft.decision === 'good' && !EXECUTIONS.includes(draft.execution as Execution)) errors.execution = 'Bitte die Ausführung einordnen.';
  if (!isAllowedVideoUrl(draft.videoUrl)) errors.videoUrl = `Nur ein interner Link, der mit https:// beginnt (höchstens ${MAX_VIDEO_URL} Zeichen).`;
  return errors;
}

/** Ausführung, die zu einer Entscheidung gespeichert wird: nur bei „sinnvoll“, sonst immer null. */
export function executionFor(decision: Decision, execution: Execution | ''): Execution | null {
  return decision === 'good' && EXECUTIONS.includes(execution as Execution) ? (execution as Execution) : null;
}

export function sceneFromDoc(id: string, data: Readonly<Record<string, unknown>>): TacticScene | null {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const decision = data['decision'];
  if (!DECISIONS.includes(decision as Decision)) return null;
  const eventDate = text(data['eventDate']);
  const playerId = text(data['playerId']);
  if (!playerId || !isIsoDate(eventDate)) return null;
  const rawMinute = data['minute'];
  const minute = typeof rawMinute === 'number' && Number.isInteger(rawMinute) && rawMinute >= 0 && rawMinute <= MAX_MINUTE ? rawMinute : null;
  const rawSituations = Array.isArray(data['situations']) ? (data['situations'] as unknown[]) : [];
  const situations = SITUATION_TYPES.filter((type) => rawSituations.includes(type));
  const videoUrl = text(data['videoUrl']);
  return {
    id,
    playerId,
    eventId: text(data['eventId']),
    eventDate,
    eventType: text(data['eventType']),
    eventTitle: text(data['eventTitle']),
    minute,
    context: text(data['context']),
    decision: decision as Decision,
    execution: executionFor(decision as Decision, (EXECUTIONS.includes(data['execution'] as Execution) ? data['execution'] : '') as Execution | ''),
    situations,
    videoUrl: isAllowedVideoUrl(videoUrl) ? videoUrl : '',
    by: text(data['by']),
    byUid: text(data['byUid']),
    createdAt: text(data['createdAt']),
  };
}

export function docFromScene(scene: TacticScene): Record<string, unknown> {
  return {
    playerId: scene.playerId,
    eventId: scene.eventId,
    eventDate: scene.eventDate,
    eventType: scene.eventType,
    eventTitle: scene.eventTitle,
    minute: scene.minute,
    context: scene.context,
    decision: scene.decision,
    execution: scene.execution,
    situations: [...scene.situations],
    videoUrl: scene.videoUrl,
    by: scene.by,
    byUid: scene.byUid,
    createdAt: scene.createdAt,
  };
}

/** Anteil `count` von `of` mit Mindestfallzahl. `value` ist null bei Nenner 0, `reliable` erst ab {@link MIN_CASES}. */
export interface Ratio {
  readonly count: number;
  readonly of: number;
  readonly value: number | null;
  readonly reliable: boolean;
}

export function ratio(count: number, of: number, minCases = MIN_CASES): Ratio {
  return { count, of, value: of > 0 ? count / of : null, reliable: of >= minCases && of > 0 };
}

export interface SceneMetrics {
  /** Alle erfassten Szenen (Stichprobe). */
  readonly scenes: number;
  /** Davon Entscheidung „nicht beurteilbar“ (in keinem Nenner). */
  readonly unclearDecisions: number;
  /** Sinnvolle Entscheidungen mit Ausführung „nicht beurteilbar“ (nicht im Nenner der Ausführungsquote). */
  readonly unclearExecutions: number;
  readonly decisionQuality: Ratio;
  readonly executionRate: Ratio;
  /** Zeitfenster der Szenen (ISO-Datum) oder null ohne Szenen. */
  readonly from: string | null;
  readonly to: string | null;
  /** Szenen aus Spielen und Trainings. */
  readonly games: number;
  readonly trainings: number;
  /** Verschiedene Termine, aus denen die Szenen stammen. */
  readonly events: number;
}

export function sceneMetrics(scenes: readonly TacticScene[], minCases = MIN_CASES): SceneMetrics {
  let good = 0;
  let poor = 0;
  let unclear = 0;
  let success = 0;
  let fail = 0;
  let unclearExecutions = 0;
  let games = 0;
  let trainings = 0;
  const dates: string[] = [];
  const events = new Set<string>();
  for (const scene of scenes) {
    if (scene.decision === 'good') {
      good += 1;
      if (scene.execution === 'success') success += 1;
      else if (scene.execution === 'fail') fail += 1;
      else unclearExecutions += 1;
    } else if (scene.decision === 'poor') poor += 1;
    else unclear += 1;
    if (scene.eventType === 'Spiel') games += 1;
    else if (scene.eventType === 'Training') trainings += 1;
    dates.push(scene.eventDate);
    events.add(scene.eventId || `${scene.eventDate}|${scene.eventTitle}`);
  }
  dates.sort();
  return {
    scenes: scenes.length,
    unclearDecisions: unclear,
    unclearExecutions,
    decisionQuality: ratio(good, good + poor, minCases),
    executionRate: ratio(success, success + fail, minCases),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    games,
    trainings,
    events: events.size,
  };
}

export interface SceneGroup {
  readonly key: string;
  readonly label: string;
  readonly metrics: SceneMetrics;
}

/** Kennzahlen je Ereignistyp (eine Szene mit zwei Typen zählt in beiden Zeilen) plus „ohne Ereignistyp“. Leere Typen fehlen. */
export function metricsBySituation(scenes: readonly TacticScene[], minCases = MIN_CASES): SceneGroup[] {
  const groups: SceneGroup[] = SITUATION_TYPES.map((type) => ({
    key: type,
    label: SITUATION_LABELS[type],
    metrics: sceneMetrics(scenes.filter((scene) => scene.situations.includes(type)), minCases),
  }));
  groups.push({ key: 'none', label: 'Ohne Ereignistyp', metrics: sceneMetrics(scenes.filter((scene) => scene.situations.length === 0), minCases) });
  return groups.filter((group) => group.metrics.scenes > 0);
}

/** Kennzahlen je Art des Termins (Spiel/Training). Leere Gruppen fehlen. */
export function metricsByEventType(scenes: readonly TacticScene[], minCases = MIN_CASES): SceneGroup[] {
  return [
    { key: 'Spiel', label: 'Spiel', metrics: sceneMetrics(scenes.filter((scene) => scene.eventType === 'Spiel'), minCases) },
    { key: 'Training', label: 'Training', metrics: sceneMetrics(scenes.filter((scene) => scene.eventType === 'Training'), minCases) },
  ].filter((group) => group.metrics.scenes > 0);
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Verlauf: Kennzahlen je Kalendermonat, älteste zuerst (Monate ohne Szene fehlen). */
export function metricsByMonth(scenes: readonly TacticScene[], minCases = MIN_CASES): SceneGroup[] {
  const months = [...new Set(scenes.map((scene) => scene.eventDate.slice(0, 7)))].sort();
  return months.map((month) => {
    const [year, number] = month.split('-');
    return {
      key: month,
      label: `${MONTHS[Number(number) - 1]} ${year}`,
      metrics: sceneMetrics(scenes.filter((scene) => scene.eventDate.startsWith(month)), minCases),
    };
  });
}

/** Neueste zuerst (Termin-Datum, dann Minute absteigend, dann Erfassungszeit). */
export function sortScenes(scenes: readonly TacticScene[]): TacticScene[] {
  return [...scenes].sort(
    (a, b) => b.eventDate.localeCompare(a.eventDate) || (b.minute ?? -1) - (a.minute ?? -1) || b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Text für eine Kennzahl: „4 von 6 (67 %)“ ab Mindestfallzahl, darunter nur „2 von 3 – noch keine Aussage“, bei
 * Nenner 0 „kein Wert“.
 */
export function ratioText(value: Ratio, minCases = MIN_CASES): string {
  if (value.value === null) return 'kein Wert (keine beurteilbare Szene)';
  const counted = `${value.count} von ${value.of}`;
  if (!value.reliable) return `${counted} – noch keine Aussage (ab ${minCases} beurteilbaren Szenen)`;
  return `${counted} (${Math.round(value.value * 100)} %)`;
}

/** Kurzform für Tabellen: „67 %“, „2/3“ unter der Mindestfallzahl, „–“ ohne Nenner. */
export function ratioShort(value: Ratio): string {
  if (value.value === null) return '–';
  if (!value.reliable) return `${value.count}/${value.of}`;
  return `${Math.round(value.value * 100)} %`;
}
