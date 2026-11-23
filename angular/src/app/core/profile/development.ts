/**
 * Entwicklung eines Spielers über die Zeit (SCRUM-265): eine Rechnung für Profil, Spieleransicht, Spielerbericht und
 * Saisonbericht.
 *
 * Früher galt „erste minus letzte Note“ als Entwicklung, egal ob drei Tage oder zwölf Monate dazwischen lagen, und
 * eine Schwankung von einer Bewertung zur nächsten las sich schon als „besser“. Jetzt:
 * - Es gibt immer einen ausdrücklichen Beobachtungszeitraum (12 Wochen, Saison, 12 Monate oder alles).
 * - Verglichen wird der Ausgangswert (Schnitt der ersten bis zu drei Bewertungen im Zeitraum) mit dem aktuellen Stand
 *   (Schnitt der letzten bis zu drei). Dafür braucht es mindestens 4 Bewertungen, und die beiden Gruppen müssen im
 *   Mittel mindestens 4 Wochen auseinanderliegen. Sonst: „zu wenig Daten“ mit Begründung – nie automatisch besser oder
 *   schlechter.
 * - Trainerbewertungen sind Stufen (Schulnoten bzw. Kompetenzstufen), keine Messwerte. Deshalb gibt es keine
 *   „Rate pro 90 Tage“; angezeigt wird der Unterschied zusammen mit dem Zeitabstand.
 * - Unsicherheit: geschätzt aus der Streuung der wiederholten Bewertungen in beiden Gruppen (2 × Standardfehler der
 *   Differenz), mindestens aber eine halbe Skalenstufe (Schulnoten 0,5; Kompetenzstufen 0,75). Liegt der Unterschied
 *   darunter, heißt es „stabil – nicht sicher unterscheidbar“.
 * - Wechselt die Bewertungsskala (Schulnoten ↔ Kompetenzstufen, SCRUM-188), wird nur ab dem letzten Wechsel
 *   verglichen; frühere Bewertungen werden ausgewiesen, aber nicht in denselben Vergleich gemischt.
 * - Lücken (mehr als 6 Wochen ohne Bewertung) und veraltete Daten (letzte Bewertung mehr als 6 Wochen vor Ende des
 *   Zeitraums) werden als Hinweis gezeigt; veraltete Daten ergeben „keine aktuellen Daten“ statt einer Richtung.
 */
import { addDays, daysBetween, formatDate } from '../shared/dates';
import { seasonStartIso } from '../shared/season';
import { type RatingScale, scoreLabel } from '../ratings/rating-scale';
import type { GradedEvent } from './profile';

/** Mindestzahl Bewertungen im Zeitraum (gleiche Skala) für eine Aussage zur Entwicklung. */
export const MIN_RATINGS = 4;
/** Ausgangs- und aktuelle Gruppe müssen im Mittel mindestens so viele Tage auseinanderliegen. */
export const MIN_SEPARATION_DAYS = 28;
/** Ab so vielen Tagen ohne Bewertung gilt eine Lücke bzw. der Stand als veraltet. */
export const GAP_DAYS = 42;
/** Höchstens so viele Bewertungen bilden Ausgangswert bzw. aktuellen Stand. */
const GROUP_SIZE = 3;

/** Kleinste Veränderung, die als Unterschied gilt: eine halbe Skalenstufe. */
export function minimalChange(scale: RatingScale): number {
  return scale === 'levels' ? 0.75 : 0.5;
}

export type DevelopmentPeriodKey = '12w' | 'season' | '12m' | 'all';

export const DEVELOPMENT_PERIODS: readonly { readonly value: DevelopmentPeriodKey; readonly label: string }[] = [
  { value: '12w', label: '12 Wochen' },
  { value: 'season', label: 'Saison' },
  { value: '12m', label: '12 Monate' },
  { value: 'all', label: 'Alles' },
];

export interface DevelopmentPeriod {
  readonly key: DevelopmentPeriodKey | 'custom';
  readonly from: string;
  readonly to: string;
  /** „Saison seit 01.07.2026“, „letzte 12 Wochen“ … */
  readonly label: string;
}

/** Beobachtungszeitraum bis `today`; „Alles“ beginnt mit der ersten Bewertung. */
export function developmentPeriod(key: DevelopmentPeriodKey, today: string, graded: readonly GradedEvent[] = []): DevelopmentPeriod {
  if (key === '12w') return { key, from: addDays(today, -83), to: today, label: 'letzte 12 Wochen' };
  if (key === '12m') return { key, from: addDays(today, -364), to: today, label: 'letzte 12 Monate' };
  if (key === 'all') {
    const first = graded.map((entry) => entry.event.date).sort()[0];
    return { key, from: first && first < today ? first : today, to: today, label: 'gesamter Verlauf' };
  }
  const from = seasonStartIso(new Date(`${today}T12:00:00`));
  return { key, from, to: today, label: `Saison seit ${formatDate(from)}` };
}

export type DevelopmentState = 'none' | 'insufficient' | 'stale' | 'stable' | 'better' | 'worse';

export interface DevelopmentSummary {
  readonly state: DevelopmentState;
  /** Kurzform für Kacheln: „besser (+0,6)“, „stabil“, „zu wenig Daten“ … */
  readonly label: string;
  /** Ein Satz mit Ausgangswert, aktuellem Stand und Zeitabstand (leer, wenn es keinen Vergleich gibt). */
  readonly detail: string;
  /** Hinweise: Anzahl/Dichte, fehlende Daten, Lücken, Skalenwechsel, veraltete Daten. */
  readonly hints: readonly string[];
  readonly period: DevelopmentPeriod;
  /** Skala der verglichenen Bewertungen (die der jüngsten). */
  readonly scale: RatingScale;
  /** Bewertungen im Zeitraum mit dieser Skala. */
  readonly count: number;
  /** Tage zwischen erster und letzter verglichener Bewertung. */
  readonly spanDays: number;
  /** Ausgangswert (Schnitt der ersten Bewertungen), null ohne Vergleich. */
  readonly baseline: number | null;
  /** Aktueller Stand (Schnitt der letzten Bewertungen), null ohne Vergleich. */
  readonly current: number | null;
  /** Ausgangswert minus aktueller Stand: positiv = besser (kleinere Note); null ohne Vergleich. */
  readonly change: number | null;
  /** Unsicherheit des Unterschieds (gleiche Einheit), null ohne Vergleich. */
  readonly uncertainty: number | null;
  /** Mittlerer Abstand der Gruppen in Tagen, null ohne Vergleich. */
  readonly separationDays: number | null;
  /** Datum der ersten Bewertung mit der aktuellen Skala, wenn davor im Zeitraum eine andere Skala benutzt wurde. */
  readonly scaleChangedAt: string | null;
}

/** Skala, mit der eine (benotete) Bewertung vergeben wurde. */
export function entryScale(entry: GradedEvent): RatingScale {
  return entry.rating.scale ?? 'grades';
}

/** Zeitspanne als Text im Akkusativ: „1 Tag“, „12 Tage“, „14 Wochen“, „5 Monate“. */
export function spanText(days: number): string {
  if (days < 14) return days === 1 ? '1 Tag' : `${days} Tage`;
  if (days < 120) return `${Math.round(days / 7)} Wochen`;
  const months = Math.round(days / 30.44);
  return months === 1 ? '1 Monat' : `${months} Monate`;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
}

/** „2,3“ bei Schulnoten, „kann es“ bei Kompetenzstufen. */
function valueText(value: number, scale: RatingScale): string {
  return scale === 'levels' ? `„${scoreLabel(value, scale)}“` : String(round1(value).toFixed(1)).replace('.', ',');
}

function changeText(change: number, scale: RatingScale): string {
  if (scale === 'levels') return '';
  const text = Math.abs(round1(change)).toFixed(1).replace('.', ',');
  return change > 0 ? ` (+${text})` : ` (−${text})`;
}

const SCALE_NAMES: Readonly<Record<RatingScale, string>> = { grades: 'Schulnoten', levels: 'Kompetenzstufen' };

/** Entwicklung im Zeitraum; `graded` wie aus `gradedEvents` (älteste zuerst), andere Daten werden ignoriert. */
export function developmentSummary(graded: readonly GradedEvent[], period: DevelopmentPeriod, today: string): DevelopmentSummary {
  const end = period.to < today ? period.to : today;
  const inPeriod = graded.filter((entry) => entry.event.date >= period.from && entry.event.date <= end);
  const last = inPeriod.at(-1);
  const scale = last ? entryScale(last) : 'grades';
  // Nur der letzte zusammenhängende Abschnitt mit derselben Skala wird verglichen.
  let start = inPeriod.length;
  while (start > 0 && entryScale(inPeriod[start - 1]) === scale) start -= 1;
  const entries = inPeriod.slice(start);
  const earlier = inPeriod.slice(0, start);
  const scaleChangedAt = earlier.length && entries.length ? entries[0].event.date : null;
  const base = { period, scale, count: entries.length, scaleChangedAt };
  const empty = { baseline: null, current: null, change: null, uncertainty: null, separationDays: null };
  const hints: string[] = [];

  if (!entries.length) {
    return { ...base, ...empty, state: 'none', label: 'keine Bewertung', detail: '', spanDays: 0, hints: [`Im Zeitraum (${period.label}) gibt es keine benotete Bewertung.`] };
  }

  const spanDays = daysBetween(entries[0].event.date, entries[entries.length - 1].event.date);
  const count = entries.length;
  hints.push(
    count === 1
      ? `1 Bewertung im Zeitraum (${formatDate(entries[0].event.date)}).`
      : `${count} Bewertungen über ${spanText(spanDays)} (${formatDate(entries[0].event.date)} – ${formatDate(entries[count - 1].event.date)})${
          spanDays > 0 ? `, im Schnitt alle ${Math.max(1, Math.round(spanDays / (count - 1)))} Tage` : ''
        }.`,
  );
  if (scaleChangedAt) {
    hints.push(
      `Bewertungsskala am ${formatDate(scaleChangedAt)} gewechselt (vorher ${SCALE_NAMES[entryScale(earlier[earlier.length - 1])]}): ${earlier.length} frühere ${
        earlier.length === 1 ? 'Bewertung wird' : 'Bewertungen werden'
      } nicht mit den neuen verglichen.`,
    );
  }
  // Lücken: von Beginn des Zeitraums, zwischen den Bewertungen, bis zum Ende des Zeitraums.
  let widest = { days: 0, from: '', to: '' };
  for (let i = 1; i < count; i += 1) {
    const days = daysBetween(entries[i - 1].event.date, entries[i].event.date);
    if (days > widest.days) widest = { days, from: entries[i - 1].event.date, to: entries[i].event.date };
  }
  if (widest.days > GAP_DAYS) hints.push(`Lücke ohne Bewertung: ${spanText(widest.days)} (${formatDate(widest.from)} – ${formatDate(widest.to)}).`);
  const sinceLast = daysBetween(entries[count - 1].event.date, end);
  const stale = sinceLast > GAP_DAYS;
  if (stale) hints.push(`Letzte Bewertung am ${formatDate(entries[count - 1].event.date)}, ${spanText(sinceLast)} vor Ende des Zeitraums – zur aktuellen Entwicklung gibt es keine Daten.`);

  const k = Math.min(GROUP_SIZE, Math.floor(count / 2));
  const offsets = entries.map((entry) => daysBetween(entries[0].event.date, entry.event.date));
  const separationDays = k ? Math.round(mean(offsets.slice(-k)) - mean(offsets.slice(0, k))) : 0;
  if (count < MIN_RATINGS || separationDays < MIN_SEPARATION_DAYS) {
    const reason =
      count < MIN_RATINGS
        ? `Für eine Aussage zur Entwicklung braucht es mindestens ${MIN_RATINGS} Bewertungen${scaleChangedAt ? ' mit derselben Skala' : ''}, die über mindestens 4 Wochen verteilt sind.`
        : 'Die Bewertungen liegen zeitlich zu dicht beieinander: Anfangs- und Endgruppe müssen mindestens 4 Wochen auseinanderliegen.';
    return { ...base, ...empty, state: 'insufficient', label: 'zu wenig Daten', detail: '', spanDays, hints: [...hints, reason] };
  }

  const first = entries.slice(0, k).map((entry) => entry.grade);
  const recent = entries.slice(-k).map((entry) => entry.grade);
  const baseline = mean(first);
  const current = mean(recent);
  const change = baseline - current;
  const uncertainty = Math.max(minimalChange(scale), 2 * Math.sqrt(variance(first) / k + variance(recent) / k));
  const stable = Math.abs(change) < uncertainty;
  const direction: DevelopmentState = stable ? 'stable' : change > 0 ? 'better' : 'worse';
  const plus = scale === 'levels' ? '' : ` (±${round1(uncertainty).toFixed(1).replace('.', ',')})`;
  const groupWord = k === 1 ? 'der ersten bzw. letzten Bewertung' : `Schnitt der ersten bzw. letzten ${k} Bewertungen`;
  const detail = `Ausgangswert ${valueText(baseline, scale)} → zuletzt ${valueText(current, scale)} (${groupWord}, Abstand ${spanText(separationDays)}).${
    stable ? ` Unterschied kleiner als die Unsicherheit${plus}: nicht sicher unterscheidbar.` : ''
  }`;
  const label = stale ? 'keine aktuellen Daten' : stable ? 'stabil' : `${direction === 'better' ? 'besser' : 'schlechter'}${changeText(change, scale)}`;
  return {
    ...base,
    state: stale ? 'stale' : direction,
    label,
    detail: stale ? `Bis ${formatDate(entries[count - 1].event.date)}: ${detail}` : detail,
    hints,
    spanDays,
    baseline: round1(baseline),
    current: round1(current),
    change: round1(change),
    uncertainty: round1(uncertainty),
    separationDays,
  };
}

/** Erklärung der Methode für die Anzeige (einmal unter dem Diagramm bzw. im Bericht). */
export const DEVELOPMENT_METHOD =
  'Entwicklung = Ausgangswert (Schnitt der ersten bis zu 3 Bewertungen im Zeitraum) gegenüber dem aktuellen Stand (Schnitt der letzten bis zu 3). ' +
  'Nötig sind mindestens 4 Bewertungen, deren Anfangs- und Endgruppe mindestens 4 Wochen auseinanderliegen. Trainerbewertungen sind Einschätzungen in ' +
  'Stufen, keine Messungen: Es wird keine Rate pro Zeit berechnet. Die Unsicherheit wird aus der Streuung der Bewertungen geschätzt (mindestens eine halbe Stufe); ' +
  'kleinere Unterschiede gelten als „stabil – nicht sicher unterscheidbar“. Für objektive Tests (z. B. Sprint) ist die Messunsicherheit nicht bestimmbar, ' +
  'solange es keine Wiederholungsmessungen dazu gibt.';

export interface StepChange {
  /** Letzte minus vorletzte Note, umgekehrt: positiv = besser. */
  readonly change: number;
  readonly days: number;
  /** Die beiden Bewertungen haben verschiedene Skalen: kein Vergleich. */
  readonly scaleChanged: boolean;
}

/** Veränderung von der vorletzten zur letzten Bewertung, mit Zeitabstand (für die Kachel „Letzte Änderung“). */
export function lastStep(graded: readonly GradedEvent[]): StepChange | null {
  const last = graded.at(-1);
  const previous = graded.at(-2);
  if (!last || !previous) return null;
  return {
    change: round1(previous.grade - last.grade),
    days: daysBetween(previous.event.date, last.event.date),
    scaleChanged: entryScale(previous) !== entryScale(last),
  };
}

/** Zeitspanne im Dativ („nach 12 Tagen“, „nach 3 Wochen“, „nach 5 Monaten“). */
function spanDative(days: number): string {
  const text = spanText(days);
  return /(Tage|Monate)$/.test(text) ? `${text}n` : text;
}

/** „+0,5 nach 12 Tagen“ bzw. „besser nach 12 Tagen“; bei Skalenwechsel „Skala gewechselt“; ohne Daten „–“. */
export function lastStepLabel(step: StepChange | null, scale: RatingScale): string {
  if (!step) return '–';
  if (step.scaleChanged) return 'Skala gewechselt';
  const value = scale === 'levels' ? (step.change > 0 ? 'besser' : step.change < 0 ? 'schlechter' : 'gleich') : signed(step.change);
  return `${value} ${step.days === 0 ? 'am selben Tag' : `nach ${spanDative(step.days)}`}`;
}

function signed(value: number): string {
  const text = String(value).replace('.', ',');
  return value > 0 ? `+${text}` : text;
}
