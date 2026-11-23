/**
 * Entwicklungsraster (SCRUM-266, docs/bewertungsmodell.md): Beobachtungen, Team-Konfiguration (versionierte Gewichte),
 * Bereichsprofil mit „nicht erhoben“ und der optionale Gesamtindex mit Abdeckungsregel. Reine Logik, ohne Firestore.
 *
 * Grundsätze: Ein Bereich ohne Beobachtung bekommt keinen Wert (nie 0, nie aus Eventnoten oder anderen Bereichen).
 * Es gibt bewusst keine Funktion, die mehrere Spieler nach Raster oder Index ordnet oder vergleicht.
 */
import { addDays, isIsoDate } from '../shared/dates';
import type { CompetenceConfig } from './competence-config';

// Team-Konfiguration (Versionen, Gewichte) liegt in competence-config.ts und wird hier mit angeboten.
export * from './competence-config';
import {
  COMPETENCE_DOMAINS,
  COMPETENCE_FRAMEWORK_VERSION,
  type CompetenceCriterion,
  type CompetenceDomain,
  DOMAIN_LABELS,
  OBSERVATION_MAX,
  OBSERVATION_MIN,
  OBSERVATION_SOURCES,
  OCCASIONS,
  type ObservationSource,
  type Occasion,
  criteriaOf,
  criterionById,
} from './competence-catalog';

export const MAX_OBSERVATION_NOTE = 300;
export const MAX_OBSERVATION_BY = 80;
export const MAX_OBSERVATION_POSITION = 30;
/** Zeitraum des Profils in Tagen (Dokument §6). */
export const PROFILE_WINDOW_DAYS = 365;
/** So viele jüngste Beobachtungen je Kriterium zählen. */
export const OBSERVATIONS_PER_CRITERION = 3;
/** Abdeckungsregel des Index: je gewichtetem Bereich mindestens so viele beobachtete Kriterien … */
export const MIN_CRITERIA_PER_DOMAIN = 2;
/** … und Beobachtungen von mindestens so vielen verschiedenen Tagen. */
export const MIN_OBSERVATION_DAYS = 2;

// ---------------------------------------------------------------------------------------------------------------
// Beobachtung
// ---------------------------------------------------------------------------------------------------------------

/** Eine Beobachtung = ein Kriterium, ein Spieler, ein Tag, eine bewertende Person. Wird nie geändert. */
export interface CompetenceObservation {
  readonly id: string;
  readonly playerId: string;
  readonly framework: string;
  readonly criterionId: string;
  readonly value: number;
  readonly date: string;
  readonly occasion: Occasion;
  readonly eventId: string | null;
  readonly position: string | null;
  readonly source: ObservationSource;
  readonly note: string;
  readonly by: string;
  readonly byUid: string;
  readonly createdAt: string;
}

function isObservationValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= OBSERVATION_MIN && value <= OBSERVATION_MAX;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Dokument → Beobachtung; unlesbare Dokumente (Wert, Datum, Kriterium fehlt) → null. Unbekannte Kriterien bleiben erhalten. */
export function observationFromDoc(id: string, data: Readonly<Record<string, unknown>>): CompetenceObservation | null {
  const value = data['value'];
  const date = text(data['date']);
  const criterionId = text(data['criterionId']);
  if (!isObservationValue(value) || !isIsoDate(date) || !criterionId) return null;
  const occasion = OCCASIONS.find((entry) => entry === data['occasion']) ?? 'other';
  const source = OBSERVATION_SOURCES.find((entry) => entry === data['source']) ?? 'trainer';
  return {
    id,
    playerId: text(data['playerId']),
    framework: text(data['framework']),
    criterionId,
    value,
    date,
    occasion,
    eventId: optionalText(data['eventId']),
    position: optionalText(data['position']),
    source,
    note: text(data['note']),
    by: text(data['by']),
    byUid: text(data['byUid']),
    createdAt: text(data['createdAt']),
  };
}

export function docFromObservation(observation: CompetenceObservation): Record<string, unknown> {
  return {
    playerId: observation.playerId,
    framework: observation.framework,
    criterionId: observation.criterionId,
    value: observation.value,
    date: observation.date,
    occasion: observation.occasion,
    eventId: observation.eventId,
    position: observation.position,
    source: observation.source,
    note: observation.note,
    by: observation.by,
    byUid: observation.byUid,
    createdAt: observation.createdAt,
  };
}

/** Eingabe im Dialog: gemeinsame Angaben und je Kriterium höchstens eine Stufe (fehlend = nicht beobachtet). */
export interface ObservationDraft {
  readonly date: string;
  readonly occasion: Occasion;
  readonly eventId: string;
  readonly position: string;
  readonly note: string;
  readonly values: Readonly<Record<string, number>>;
}

export type ObservationErrors = Partial<Record<'date' | 'occasion' | 'values' | 'note' | 'position', string>>;

export function validateObservationDraft(draft: ObservationDraft, today: string): ObservationErrors {
  const errors: ObservationErrors = {};
  if (!isIsoDate(draft.date)) errors.date = 'Bitte ein gültiges Datum eingeben.';
  else if (draft.date > today) errors.date = 'Das Datum darf nicht in der Zukunft liegen.';
  if (!OCCASIONS.includes(draft.occasion)) errors.occasion = 'Bitte einen Anlass wählen.';
  const entries = Object.entries(draft.values);
  if (entries.length === 0) errors.values = 'Bitte mindestens ein Kriterium einstufen. Nicht Beobachtetes bleibt leer.';
  else if (entries.some(([id, value]) => !criterionById(id) || !isObservationValue(value))) errors.values = 'Ungültige Stufe.';
  if (draft.note.trim().length > MAX_OBSERVATION_NOTE) errors.note = `Die Notiz darf höchstens ${MAX_OBSERVATION_NOTE} Zeichen lang sein.`;
  if (draft.position.trim().length > MAX_OBSERVATION_POSITION) errors.position = 'Die Position ist zu lang.';
  return errors;
}

/** Ein Dokument je eingestuftem Kriterium (gleicher Tag, Anlass, Person). */
export function observationsFromDraft(
  draft: ObservationDraft,
  meta: { readonly playerId: string; readonly by: string; readonly byUid: string; readonly createdAt: string; readonly newId: () => string },
): CompetenceObservation[] {
  return Object.entries(draft.values)
    .filter(([id, value]) => criterionById(id) && isObservationValue(value))
    .map(([criterionId, value]) => ({
      id: meta.newId(),
      playerId: meta.playerId,
      framework: COMPETENCE_FRAMEWORK_VERSION,
      criterionId,
      value,
      date: draft.date,
      occasion: draft.occasion,
      eventId: draft.eventId.trim() || null,
      position: draft.position.trim() || null,
      source: 'trainer' as const,
      note: draft.note.trim(),
      by: meta.by.slice(0, MAX_OBSERVATION_BY),
      byUid: meta.byUid,
      createdAt: meta.createdAt,
    }));
}

// ---------------------------------------------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------------------------------------------

export interface CriterionProfile {
  readonly criterion: CompetenceCriterion;
  /** Mittel der jüngsten Beobachtungen; null = nicht erhoben. */
  readonly value: number | null;
  readonly count: number;
  readonly lastDate: string | null;
}

export type DomainState = 'off' | 'none' | 'observed';

export interface DomainProfile {
  readonly domain: CompetenceDomain;
  /** off = im Team nicht erhoben, none = nicht erhoben (keine Beobachtung), observed = Wert vorhanden. */
  readonly state: DomainState;
  readonly value: number | null;
  readonly observedCriteria: number;
  readonly totalCriteria: number;
  readonly observations: number;
  readonly lastDate: string | null;
  readonly criteria: readonly CriterionProfile[];
}

export interface CompetenceProfile {
  readonly framework: string;
  readonly from: string;
  readonly to: string;
  readonly domains: readonly DomainProfile[];
  /** Beobachtungen im Zeitraum, die ins Profil zählen. */
  readonly observations: number;
  readonly days: number;
  /** Alle Beobachtungen von einem Tag: eine Momentaufnahme, noch kein Profil. */
  readonly snapshotOnly: boolean;
  /** Beobachtungen aus anderen Rasterversionen oder mit unbekanntem Kriterium (nicht eingerechnet). */
  readonly otherVersion: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Bereichsprofil EINES Spielers am Tag `today` (Dokument §6). */
export function competenceProfile(observations: readonly CompetenceObservation[], config: CompetenceConfig, today: string): CompetenceProfile {
  const from = addDays(today, -PROFILE_WINDOW_DAYS);
  const current = observations.filter((entry) => entry.framework === COMPETENCE_FRAMEWORK_VERSION && criterionById(entry.criterionId));
  const inWindow = current.filter((entry) => entry.date >= from && entry.date <= today);
  const used: CompetenceObservation[] = [];
  const domains = COMPETENCE_DOMAINS.map((domain): DomainProfile => {
    const criteria = criteriaOf(domain).map((criterion): CriterionProfile => {
      const latest = inWindow
        .filter((entry) => entry.criterionId === criterion.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, OBSERVATIONS_PER_CRITERION);
      if (config.domains.includes(domain)) used.push(...latest);
      return { criterion, value: latest.length ? round1(mean(latest.map((entry) => entry.value))) : null, count: latest.length, lastDate: latest[0]?.date ?? null };
    });
    const observed = criteria.filter((entry) => entry.value !== null);
    const active = config.domains.includes(domain);
    const lastDate = observed.map((entry) => entry.lastDate ?? '').sort().at(-1) ?? null;
    return {
      domain,
      state: !active ? 'off' : observed.length === 0 ? 'none' : 'observed',
      value: active && observed.length ? round1(mean(observed.map((entry) => entry.value as number))) : null,
      observedCriteria: observed.length,
      totalCriteria: criteria.length,
      observations: active ? criteria.reduce((sum, entry) => sum + entry.count, 0) : 0,
      lastDate: active ? lastDate : null,
      criteria,
    };
  });
  const days = new Set(used.map((entry) => entry.date)).size;
  return {
    framework: COMPETENCE_FRAMEWORK_VERSION,
    from,
    to: today,
    domains,
    observations: used.length,
    days,
    snapshotOnly: used.length > 0 && days < MIN_OBSERVATION_DAYS,
    otherVersion: observations.length - current.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Optionaler Gesamtindex
// ---------------------------------------------------------------------------------------------------------------

export type CompetenceIndex =
  | { readonly kind: 'off' }
  | { readonly kind: 'insufficient'; readonly reasons: readonly string[] }
  | {
      readonly kind: 'index';
      readonly value: number;
      readonly weights: Readonly<Partial<Record<CompetenceDomain, number>>>;
      readonly configVersion: number;
      readonly weightProfile: string;
      readonly framework: string;
      readonly observations: number;
      readonly days: number;
      readonly from: string;
      readonly to: string;
    };

/** Index nur bei eingeschaltetem Index, gewähltem Profil und ausreichender Abdeckung (Dokument §8). */
export function competenceIndex(profile: CompetenceProfile, config: CompetenceConfig): CompetenceIndex {
  if (!config.indexEnabled || !config.weightProfile) return { kind: 'off' };
  if (profile.observations === 0) return { kind: 'insufficient', reasons: ['Noch keine Beobachtung im Profilzeitraum.'] };
  const reasons: string[] = [];
  const weighted = profile.domains.filter((entry) => (config.weights[entry.domain] ?? 0) > 0);
  if (weighted.length === 0) reasons.push('Kein Bereich hat ein Gewicht.');
  for (const entry of weighted) {
    if (entry.state === 'off') reasons.push(`${DOMAIN_LABELS[entry.domain]}: in diesem Team nicht erhoben.`);
    else if (entry.observedCriteria < MIN_CRITERIA_PER_DOMAIN)
      reasons.push(`${DOMAIN_LABELS[entry.domain]}: erst ${entry.observedCriteria} von ${entry.totalCriteria} Kriterien beobachtet (mindestens ${MIN_CRITERIA_PER_DOMAIN}).`);
  }
  if (profile.days < MIN_OBSERVATION_DAYS) reasons.push(`Beobachtungen von erst ${profile.days} Tag(en) (mindestens ${MIN_OBSERVATION_DAYS}).`);
  if (reasons.length > 0) return { kind: 'insufficient', reasons };
  let sum = 0;
  let total = 0;
  for (const entry of weighted) {
    const weight = config.weights[entry.domain] ?? 0;
    sum += weight * (entry.value as number);
    total += weight;
  }
  return {
    kind: 'index',
    value: round1(sum / total),
    weights: config.weights,
    configVersion: config.version,
    weightProfile: config.weightProfile,
    framework: config.framework,
    observations: profile.observations,
    days: profile.days,
    from: profile.from,
    to: profile.to,
  };
}
