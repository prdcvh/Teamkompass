/**
 * Zusatzdaten eines Spielers: Förderpläne, Abwesenheiten/Verletzungen und Messwerte. Die Dokumente unter
 * `teams/{teamId}/players/{playerId}/{developmentPlans|absences|measurements}` sind mit der bisherigen App
 * identisch (siehe outputs/team-manager/app.js: normalize*, save*, absenceCoversDate, unavailabilityReason,
 * applyAutoAbsence). Alle Daten sind ISO-Datum-Texte (JJJJ-MM-TT).
 */
import { formatDate, isIsoDate } from './player';
import { type Player } from './player';
import { BLANK_RATING, type Rating } from './rating';

// ---------------------------------------------------------------------------------------------------------------
// Förderpläne
// ---------------------------------------------------------------------------------------------------------------

export const PLAN_STATUSES = ['Offen', 'In Arbeit', 'Erreicht'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const MAX_PLAN_FOCUS = 50;
export const MAX_PLAN_GOAL = 90;
export const MAX_PLAN_TEXT = 400;
export const MAX_PLAN_ACTIONS = 1000;

export interface DevelopmentPlan {
  readonly id: string;
  readonly focus: string;
  readonly goal: string;
  readonly actions: string;
  /** Eigene Einschätzung des Spielers (nur er darf sie schreiben). */
  readonly selfReflection: string;
  readonly selfReflectionAt: string;
  readonly coachReview: string;
  readonly reviewDate: string;
  readonly status: PlanStatus;
  readonly dueDate: string;
  readonly createdAt: string;
}

export interface PlanDraft {
  readonly id: string | null;
  readonly focus: string;
  readonly goal: string;
  readonly actions: string;
  readonly coachReview: string;
  readonly reviewDate: string;
  readonly status: PlanStatus;
  readonly dueDate: string;
}

export type PlanErrors = Partial<Record<'focus' | 'goal' | 'actions' | 'coachReview' | 'reviewDate' | 'dueDate', string>>;

export function emptyPlanDraft(): PlanDraft {
  return { id: null, focus: '', goal: '', actions: '', coachReview: '', reviewDate: '', status: 'Offen', dueDate: '' };
}

export function draftFromPlan(plan: DevelopmentPlan): PlanDraft {
  return {
    id: plan.id,
    focus: plan.focus,
    goal: plan.goal,
    actions: plan.actions,
    coachReview: plan.coachReview,
    reviewDate: plan.reviewDate,
    status: plan.status,
    dueDate: plan.dueDate,
  };
}

export function validatePlan(draft: PlanDraft): PlanErrors {
  const errors: PlanErrors = {};
  const focus = draft.focus.trim();
  if (!focus) errors.focus = 'Bitte einen Schwerpunkt eingeben.';
  else if (focus.length > MAX_PLAN_FOCUS) errors.focus = `Der Schwerpunkt darf höchstens ${MAX_PLAN_FOCUS} Zeichen lang sein.`;
  const goal = draft.goal.trim();
  if (!goal) errors.goal = 'Bitte ein Ziel eingeben.';
  else if (goal.length > MAX_PLAN_GOAL) errors.goal = `Das Ziel darf höchstens ${MAX_PLAN_GOAL} Zeichen lang sein.`;
  if (draft.actions.trim().length > MAX_PLAN_ACTIONS) errors.actions = `Die Maßnahmen dürfen höchstens ${MAX_PLAN_ACTIONS} Zeichen lang sein.`;
  if (draft.coachReview.trim().length > MAX_PLAN_TEXT) errors.coachReview = `Das Review darf höchstens ${MAX_PLAN_TEXT} Zeichen lang sein.`;
  if (draft.reviewDate && !isIsoDate(draft.reviewDate)) errors.reviewDate = 'Bitte ein gültiges Datum eingeben.';
  if (draft.dueDate && !isIsoDate(draft.dueDate)) errors.dueDate = 'Bitte ein gültiges Datum eingeben.';
  return errors;
}

/** Entwurf → Plan; die Selbstreflexion und das Anlegedatum eines bestehenden Plans bleiben erhalten. */
export function planFromDraft(draft: PlanDraft, id: string, existing: DevelopmentPlan | undefined, today: string): DevelopmentPlan {
  return {
    id,
    focus: draft.focus.trim(),
    goal: draft.goal.trim(),
    actions: draft.actions.trim(),
    selfReflection: existing?.selfReflection ?? '',
    selfReflectionAt: existing?.selfReflectionAt ?? '',
    coachReview: draft.coachReview.trim(),
    reviewDate: draft.reviewDate,
    status: draft.status,
    dueDate: draft.dueDate,
    createdAt: existing?.createdAt ?? today,
  };
}

export function planFromDoc(id: string, data: Readonly<Record<string, unknown>>, today: string): DevelopmentPlan {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    id,
    focus: text(data['focus']),
    goal: text(data['goal']),
    actions: text(data['actions']),
    selfReflection: text(data['selfReflection']),
    selfReflectionAt: text(data['selfReflectionAt']),
    coachReview: text(data['coachReview']),
    reviewDate: text(data['reviewDate']),
    status: PLAN_STATUSES.find((value) => value === data['status']) ?? 'Offen',
    dueDate: text(data['dueDate']),
    createdAt: text(data['createdAt']) || today,
  };
}

export function docFromPlan(plan: DevelopmentPlan): Record<string, unknown> {
  return { ...plan };
}

// ---------------------------------------------------------------------------------------------------------------
// Abwesenheiten und Verletzungen
// ---------------------------------------------------------------------------------------------------------------

export const ABSENCE_INJURY_REASON = 'Verletzung';
export const ABSENCE_FIXED_REASONS = [ABSENCE_INJURY_REASON, 'Urlaub', 'Klassenfahrt', 'Schule', 'Sperre'] as const;
export const ABSENCE_OTHER_REASON = 'Sonstiges';
export const MAX_ABSENCE_DETAIL = 60;
export const MAX_ABSENCE_CUSTOM = 50;

export type AbsenceKind = 'injury' | 'absence';

export interface Absence {
  readonly id: string;
  readonly kind: AbsenceKind;
  readonly label: string;
  /** Verletzungsart, z. B. „Muskelfaserriss Oberschenkel“. */
  readonly detail: string;
  readonly from: string;
  /** Leer = Ende offen (nur bei Verletzungen zulässig). */
  readonly to: string;
}

export interface AbsenceDraft {
  readonly id: string | null;
  /** Einer der festen Gründe, `Sonstiges` oder leer (noch nicht gewählt). */
  readonly reason: string;
  readonly custom: string;
  readonly detail: string;
  readonly from: string;
  readonly to: string;
}

export type AbsenceErrors = Partial<Record<'reason' | 'custom' | 'detail' | 'from' | 'to', string>>;

/**
 * Eine Verletzung ist ein eigener Abwesenheitsgrund: sie setzt den Status auf „Verletzt“ statt nur „Abwesend“ und
 * zählt im Belastungsindikator mit. Einträge von vor dieser Unterscheidung kennen das Feld `kind` noch nicht; dort
 * zählt hilfsweise das Label (Freitext beginnend mit „Verletz…“).
 */
export function isInjuryAbsence(absence: { kind?: string; label?: string } | null | undefined): boolean {
  if (absence?.kind) return absence.kind === 'injury';
  return /^verletz/i.test((absence?.label ?? '').trim());
}

/** Anzeigename inkl. Verletzungsart („Verletzung · Muskelfaserriss Oberschenkel“). */
export function absenceTitle(absence: Pick<Absence, 'label' | 'detail'>): string {
  const detail = absence.detail.trim();
  return detail ? `${absence.label} · ${detail}` : absence.label;
}

export function absencePeriodText(absence: Pick<Absence, 'from' | 'to'>): string {
  if (!absence.to) return `seit ${formatDate(absence.from)} · Ende offen`;
  return `${formatDate(absence.from)} – ${formatDate(absence.to)}`;
}

export function emptyAbsenceDraft(): AbsenceDraft {
  return { id: null, reason: '', custom: '', detail: '', from: '', to: '' };
}

export function draftFromAbsence(absence: Absence): AbsenceDraft {
  const injury = isInjuryAbsence(absence);
  const fixed = !injury && (ABSENCE_FIXED_REASONS as readonly string[]).includes(absence.label);
  return {
    id: absence.id,
    reason: injury ? ABSENCE_INJURY_REASON : fixed ? absence.label : ABSENCE_OTHER_REASON,
    custom: injury || fixed ? '' : absence.label,
    // Ältere Verletzungen standen als Freitext im Label: das wandert beim Bearbeiten in die Detailzeile.
    detail: injury ? absence.detail || absence.label.replace(/^verletzung\s*[:·-]?\s*/i, '') : '',
    from: absence.from,
    to: absence.to,
  };
}

/** Prüft die Eingaben; ein offenes Ende ist nur bei einer Verletzung erlaubt. */
export function validateAbsence(draft: AbsenceDraft): AbsenceErrors {
  const errors: AbsenceErrors = {};
  const injury = draft.reason === ABSENCE_INJURY_REASON;
  if (!draft.reason) errors.reason = 'Bitte einen Grund wählen.';
  if (draft.reason === ABSENCE_OTHER_REASON && draft.custom.trim().length > MAX_ABSENCE_CUSTOM) errors.custom = `Die Details dürfen höchstens ${MAX_ABSENCE_CUSTOM} Zeichen lang sein.`;
  if (injury && draft.detail.trim().length > MAX_ABSENCE_DETAIL) errors.detail = `Die Art der Verletzung darf höchstens ${MAX_ABSENCE_DETAIL} Zeichen lang sein.`;
  if (!isIsoDate(draft.from)) errors.from = 'Bitte ein gültiges Datum eingeben.';
  if (draft.to) {
    if (!isIsoDate(draft.to)) errors.to = 'Bitte ein gültiges Datum eingeben.';
    else if (isIsoDate(draft.from) && draft.to < draft.from) errors.to = 'Das Ende darf nicht vor dem Beginn liegen.';
  } else if (!injury) {
    errors.to = 'Bitte ein Enddatum eingeben (nur bei einer Verletzung darf es offen bleiben).';
  }
  return errors;
}

export function absenceFromDraft(draft: AbsenceDraft, id: string): Absence {
  const injury = draft.reason === ABSENCE_INJURY_REASON;
  const label = draft.reason === ABSENCE_OTHER_REASON ? draft.custom.trim() || ABSENCE_OTHER_REASON : draft.reason;
  return { id, kind: injury ? 'injury' : 'absence', label, detail: injury ? draft.detail.trim() : '', from: draft.from, to: draft.to };
}

export function absenceFromDoc(id: string, data: Readonly<Record<string, unknown>>): Absence {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const label = text(data['label']);
  return {
    id,
    kind: isInjuryAbsence({ kind: text(data['kind']), label }) ? 'injury' : 'absence',
    label,
    detail: text(data['detail']),
    from: text(data['from']),
    to: text(data['to']),
  };
}

export function docFromAbsence(absence: Absence): Record<string, unknown> {
  return { ...absence };
}

/**
 * Deckt der Eintrag den Tag ab? Ein offenes Ende ist nur bei Verletzungen zulässig (dort steht die Rückkehr
 * am Anfang häufig noch nicht fest, der Eintrag läuft bis er beendet wird); bei allen anderen Gründen ist „Bis“
 * Pflicht, ein Eintrag ohne Ende bleibt wirkungslos.
 */
export function absenceCoversDate(absence: Absence, date: string): boolean {
  if (!absence.from || !date || date < absence.from) return false;
  return absence.to ? date <= absence.to : isInjuryAbsence(absence);
}

/** Bei mehreren gleichzeitigen Einträgen hat die Verletzung Vorrang. */
export function activeAbsenceOn(absences: readonly Absence[], date: string): Absence | null {
  const active = absences.filter((absence) => absenceCoversDate(absence, date));
  return active.find(isInjuryAbsence) ?? active[0] ?? null;
}

/**
 * Warum ist der Spieler an diesem Tag nicht verfügbar? Der Status „Verletzt“ mit „ca. verletzt bis“ und eingetragene
 * Abwesenheiten führen beide dazu, dass der Spieler für Events in diesem Zeitraum als „Fehlt“ vorbelegt wird.
 */
export function unavailabilityReason(player: Player, absences: readonly Absence[], date: string): string | null {
  if (!date) return null;
  if (player.status === 'Verletzt' && player.injuryUntil && date <= player.injuryUntil) {
    return `Verletzt (ca. bis ${formatDate(player.injuryUntil)})`;
  }
  const absence = activeAbsenceOn(absences, date);
  if (!absence) return null;
  return `${absenceTitle(absence)} (${absence.to ? `bis ${formatDate(absence.to)}` : 'Ende offen'})`;
}

export type EffectiveStatus = Player['status'] | 'Gesperrt' | 'Abwesend';

/** Anzeige-Status: eine heute laufende Abwesenheit überlagert den manuell gesetzten Status. */
export function effectiveStatus(player: Player, absences: readonly Absence[], today: string): EffectiveStatus {
  const absence = activeAbsenceOn(absences, today);
  if (!absence) return player.status;
  if (isInjuryAbsence(absence)) return 'Verletzt';
  return absence.label.trim().toLowerCase().startsWith('sperre') ? 'Gesperrt' : 'Abwesend';
}

function hasRatingData(rating: Rating): boolean {
  return (
    rating.effort !== null || rating.technique !== null || rating.tactics !== null || rating.comprehension !== null ||
    rating.minutes !== null || rating.goals !== null || rating.assists !== null || rating.note !== ''
  );
}

/**
 * Setzt einen Spieler bei einer Abwesenheit/Verletzung automatisch auf „Fehlt“ und nimmt das wieder zurück,
 * wenn die Abwesenheit gelöscht oder verkürzt wird (SCRUM-18).
 * - Vorwärts: überschreibt nur Bewertungen, die noch komplett unbearbeitet sind („Offen“ ohne jede weitere
 *   Eingabe). Eine manuell gesetzte Anwesenheit sowie Teilnoten/Notizen bleiben unangetastet.
 * - Rückwärts: nur Einträge mit `autoAbsence`-Markierung. Die Markierung fällt weg, sobald jemand die Bewertung
 *   von Hand ändert; dann bleibt sie immer stehen.
 * Rückgabe: die neue Bewertung oder `null`, wenn sich nichts ändert.
 */
export function autoAbsenceRating(existing: Rating | null, reason: string | null): Rating | null {
  if (existing?.autoAbsence) {
    if (reason && existing.note === reason) return null;
    return reason ? { ...existing, note: reason } : { ...BLANK_RATING };
  }
  if (existing && existing.attendance !== 'open') return null;
  if (existing && hasRatingData(existing)) return null;
  if (!reason) return null;
  return { ...BLANK_RATING, attendance: 'absent', note: reason, autoAbsence: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Messwerte
// ---------------------------------------------------------------------------------------------------------------

export interface Measurement {
  readonly id: string;
  readonly date: string;
  /** cm; null = nicht erfasst. */
  readonly height: number | null;
  /** kg; null = nicht erfasst. */
  readonly weight: number | null;
}

export interface MeasurementDraft {
  readonly id: string | null;
  readonly date: string;
  readonly height: string;
  readonly weight: string;
}

export type MeasurementErrors = Partial<Record<'date' | 'height' | 'weight', string>>;

export const MAX_HEIGHT_CM = 250;
export const MAX_WEIGHT_KG = 250;

export function emptyMeasurementDraft(today: string): MeasurementDraft {
  return { id: null, date: today, height: '', weight: '' };
}

export function draftFromMeasurement(measurement: Measurement): MeasurementDraft {
  return {
    id: measurement.id,
    date: measurement.date,
    height: measurement.height === null ? '' : String(measurement.height),
    weight: measurement.weight === null ? '' : String(measurement.weight),
  };
}

function measured(value: string, max: number): number | null {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 && number <= max ? number : Number.NaN;
}

export function validateMeasurement(draft: MeasurementDraft): MeasurementErrors {
  const errors: MeasurementErrors = {};
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  const height = measured(draft.height, MAX_HEIGHT_CM);
  const weight = measured(draft.weight, MAX_WEIGHT_KG);
  if (Number.isNaN(height)) errors.height = `Bitte eine Größe von 1 bis ${MAX_HEIGHT_CM} cm eingeben.`;
  if (Number.isNaN(weight)) errors.weight = `Bitte ein Gewicht von 1 bis ${MAX_WEIGHT_KG} kg eingeben.`;
  if (!errors.height && !errors.weight && height === null && weight === null) errors.height = 'Bitte Größe oder Gewicht eingeben.';
  return errors;
}

export function measurementFromDraft(draft: MeasurementDraft, id: string): Measurement {
  return { id, date: draft.date, height: measured(draft.height, MAX_HEIGHT_CM), weight: measured(draft.weight, MAX_WEIGHT_KG) };
}

/** Dokument → Messung; die bisherige App speichert die Werte als Text ('' = nicht erfasst). */
export function measurementFromDoc(id: string, data: Readonly<Record<string, unknown>>, today: string): Measurement {
  const number = (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    id,
    date: typeof data['date'] === 'string' && data['date'] ? data['date'] : today,
    height: number(data['height']),
    weight: number(data['weight']),
  };
}

/** Wie die bisherige App: Werte als Text, leer = nicht erfasst. */
export function docFromMeasurement(measurement: Measurement): Record<string, unknown> {
  return {
    id: measurement.id,
    date: measurement.date,
    height: measurement.height === null ? '' : String(measurement.height),
    weight: measurement.weight === null ? '' : String(measurement.weight),
  };
}

/** BMI; ohne Größe oder Gewicht null. */
export function calculateBmi(height: number | null, weight: number | null): number | null {
  if (!height || !weight) return null;
  const meters = height / 100;
  return weight / (meters * meters);
}

/** Messungen, älteste zuerst. */
export function sortedMeasurements(measurements: readonly Measurement[]): Measurement[] {
  return [...measurements].sort((a, b) => a.date.localeCompare(b.date));
}

export function measurementText(measurement: Measurement): string {
  const bmi = calculateBmi(measurement.height, measurement.weight);
  const round = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  return `${measurement.height === null ? '–' : round(measurement.height)} cm · ${measurement.weight === null ? '–' : round(measurement.weight)} kg${bmi ? ` · BMI ${round(bmi)}` : ''}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Verlaufsdiagramm der Messwerte (Größe, Gewicht, BMI)
// ---------------------------------------------------------------------------------------------------------------

export interface MeasurementSeries {
  readonly key: 'height' | 'weight' | 'bmi';
  readonly label: string;
  readonly points: readonly { x: number; y: number; title: string }[];
  readonly path: string;
}

export interface MeasurementChart {
  readonly width: number;
  readonly height: number;
  readonly series: readonly MeasurementSeries[];
  readonly labels: readonly { x: number; text: string }[];
  /** Mindestens zwei Messungen der letzten 12 Monate mit Größe UND Gewicht sind nötig. */
  readonly enough: boolean;
}

const M_WIDTH = 760;
const M_HEIGHT = 260;
const M_LEFT = 24;
const M_RIGHT = 24;
const M_TOP = 56;
const M_BOTTOM = 36;

/**
 * Verlauf der letzten 12 Monate: jede Reihe (Größe, Gewicht, BMI) wird für sich auf die Diagrammhöhe gestreckt
 * (kleinster Wert unten, größter oben), wie in der bisherigen App; es geht um den Verlauf, nicht um den Abstand der Werte.
 */
export function measurementChart(measurements: readonly Measurement[], today: string): MeasurementChart {
  const limit = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const entries = sortedMeasurements(measurements).filter(
    (item): item is Measurement & { height: number; weight: number } => item.height !== null && item.weight !== null && item.date >= limit,
  );
  const span = Math.max(entries.length - 1, 1);
  const x = (index: number) => M_LEFT + (index * (M_WIDTH - M_LEFT - M_RIGHT)) / span;
  const round = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');
  const build = (key: MeasurementSeries['key'], label: string, values: number[], unit: string): MeasurementSeries => {
    const min = Math.min(...values);
    const range = Math.max(...values) - min || 1;
    const points = values.map((value, index) => ({
      x: x(index),
      y: M_HEIGHT - M_BOTTOM - ((value - min) / range) * (M_HEIGHT - M_BOTTOM - M_TOP),
      title: `${entries[index].date}: ${round(value)}${unit}`,
    }));
    return { key, label, points, path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') };
  };
  if (entries.length < 2) return { width: M_WIDTH, height: M_HEIGHT, series: [], labels: [], enough: false };
  const last = entries[entries.length - 1];
  const bmi = entries.map((item) => calculateBmi(item.height, item.weight) ?? 0);
  return {
    width: M_WIDTH,
    height: M_HEIGHT,
    enough: true,
    series: [
      build('height', `Größe ${round(last.height)} cm`, entries.map((item) => item.height), ' cm'),
      build('weight', `Gewicht ${round(last.weight)} kg`, entries.map((item) => item.weight), ' kg'),
      build('bmi', `BMI ${round(bmi[bmi.length - 1])}`, bmi, ''),
    ],
    labels: entries.map((item, index) => ({ x: x(index), text: item.date.slice(0, 7) })),
  };
}
