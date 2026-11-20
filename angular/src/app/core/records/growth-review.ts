/**
 * Trainerprüfung zum Hinweis „Wachstum und Belastung gemeinsam ansehen“ (SCRUM-257): eine kurze, datierte Notiz am
 * Förderplan mit der Maßnahme. Eigenes Dokument `players/{id}/growthReviews/{id}` (nicht im Förderplan-Dokument, das
 * auch Spieler, Eltern und Vereinsadmin lesen); lesen und schreiben nur Trainer. Regeln: docs/reife-kompass-wachstum-
 * belastung-hinweis.md §5. Eine Notiz wird nie geändert, nur angelegt oder gelöscht.
 */
import { isIsoDate } from '../shared/dates';

export const MAX_REVIEW_ACTION = 400;
export const MAX_REVIEW_BY = 80;

export interface GrowthReview {
  readonly id: string;
  /** Förderplan, an dem die Notiz hängt. */
  readonly planId: string;
  /** Kennung des geprüften Hinweises (Messpaar), siehe `growthLoadKey`. */
  readonly hintKey: string;
  /** Tag der Prüfung (ISO). Ab diesem Tag gilt der Hinweis als geprüft. */
  readonly date: string;
  /** Name des prüfenden Trainers. */
  readonly by: string;
  readonly byUid: string;
  /** Maßnahme (Freitext des Trainers). */
  readonly action: string;
  readonly createdAt: string;
}

export interface GrowthReviewDraft {
  readonly planId: string;
  readonly date: string;
  readonly action: string;
}

export type GrowthReviewErrors = Partial<Record<'planId' | 'date' | 'action', string>>;

export function validateGrowthReview(draft: GrowthReviewDraft, planIds: readonly string[], today: string): GrowthReviewErrors {
  const errors: GrowthReviewErrors = {};
  if (!draft.planId || !planIds.includes(draft.planId)) errors.planId = 'Bitte einen Förderplan wählen.';
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  else if (draft.date > today) errors.date = 'Das Datum der Prüfung darf nicht in der Zukunft liegen.';
  const action = draft.action.trim();
  if (!action) errors.action = 'Bitte die Maßnahme eintragen (auch „keine Änderung nötig“ ist eine Maßnahme).';
  else if (action.length > MAX_REVIEW_ACTION) errors.action = `Die Maßnahme darf höchstens ${MAX_REVIEW_ACTION} Zeichen lang sein.`;
  return errors;
}

export function growthReviewFromDoc(id: string, data: Readonly<Record<string, unknown>>): GrowthReview | null {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const review = {
    id,
    planId: text(data['planId']),
    hintKey: text(data['hintKey']),
    date: text(data['date']),
    by: text(data['by']),
    byUid: text(data['byUid']),
    action: text(data['action']),
    createdAt: text(data['createdAt']),
  };
  return review.hintKey && isIsoDate(review.date) ? review : null;
}

export function docFromGrowthReview(review: GrowthReview): Record<string, unknown> {
  return { planId: review.planId, hintKey: review.hintKey, date: review.date, by: review.by, byUid: review.byUid, action: review.action, createdAt: review.createdAt };
}

/** Die jüngste Prüfung zum Hinweis `hintKey`, die bis zum Tag `day` dokumentiert ist (oder null). */
export function reviewFor(reviews: readonly GrowthReview[] | null | undefined, hintKey: string, day: string): GrowthReview | null {
  return (reviews ?? []).filter((review) => review.hintKey === hintKey && review.date <= day).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}
