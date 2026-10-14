/** Förderpläne eines Spielers (`players/{id}/developmentPlans`): Modell, Prüfung und Umwandlung. Daten sind ISO-Datum-Texte (JJJJ-MM-TT). */
import { isIsoDate } from '../shared/dates';

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
