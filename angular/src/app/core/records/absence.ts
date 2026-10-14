/**
 * Abwesenheiten und Verletzungen eines Spielers (`players/{id}/absences`): Modell, Prüfung, Umwandlung und
 * Zeitraum-Logik (wie outputs/team-manager/app.js: absenceCoversDate). Daten sind ISO-Datum-Texte (JJJJ-MM-TT).
 */
import { formatDate, isIsoDate } from '../player';

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
