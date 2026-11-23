/**
 * Entwicklungsraster (SCRUM-266, docs/bewertungsmodell.md §7): Team-Konfiguration als Folge unveränderlicher Versionen
 * (erhobene Bereiche, Gewichtsprofil als Hypothese, Gewichte innerhalb ±10 Prozentpunkten, Index an/aus). Reine Logik.
 */
import {
  COMPETENCE_DOMAINS,
  COMPETENCE_FRAMEWORK_VERSION,
  type CompetenceDomain,
  DOMAIN_LABELS,
  WEIGHT_TOLERANCE,
  isCompetenceDomain,
  weightProfileById,
} from './competence-catalog';

const MAX_CONFIG_BY = 80;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Team-Konfiguration (unveränderliche Versionen)
// ---------------------------------------------------------------------------------------------------------------

export interface CompetenceConfig {
  /** 0 = Standard ohne gespeicherte Version. */
  readonly version: number;
  readonly framework: string;
  readonly domains: readonly CompetenceDomain[];
  readonly weightProfile: string | null;
  /** Gewicht je erhobenem Bereich in Prozent (Summe 100); leer ohne Profil. */
  readonly weights: Readonly<Partial<Record<CompetenceDomain, number>>>;
  readonly indexEnabled: boolean;
  readonly createdAt: string;
  readonly by: string;
  readonly byUid: string;
}

export const DEFAULT_COMPETENCE_CONFIG: CompetenceConfig = {
  version: 0,
  framework: COMPETENCE_FRAMEWORK_VERSION,
  domains: COMPETENCE_DOMAINS,
  weightProfile: null,
  weights: {},
  indexEnabled: false,
  createdAt: '',
  by: '',
  byUid: '',
};

export function configDocId(version: number): string {
  return `v${version}`;
}

export function configFromDoc(data: Readonly<Record<string, unknown>>): CompetenceConfig | null {
  const version = data['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  const rawDomains = Array.isArray(data['domains']) ? data['domains'] : [];
  const domains = COMPETENCE_DOMAINS.filter((domain) => rawDomains.includes(domain));
  if (domains.length === 0) return null;
  const rawWeights = data['weights'] && typeof data['weights'] === 'object' ? (data['weights'] as Record<string, unknown>) : {};
  const weights: Partial<Record<CompetenceDomain, number>> = {};
  for (const [key, value] of Object.entries(rawWeights)) {
    if (isCompetenceDomain(key) && typeof value === 'number' && Number.isFinite(value)) weights[key] = value;
  }
  return {
    version,
    framework: text(data['framework']) || COMPETENCE_FRAMEWORK_VERSION,
    domains,
    weightProfile: optionalText(data['weightProfile']),
    weights,
    indexEnabled: data['indexEnabled'] === true,
    createdAt: text(data['createdAt']),
    by: text(data['by']),
    byUid: text(data['byUid']),
  };
}

export function docFromConfig(config: CompetenceConfig): Record<string, unknown> {
  return {
    version: config.version,
    framework: config.framework,
    domains: [...config.domains],
    weightProfile: config.weightProfile,
    weights: { ...config.weights },
    indexEnabled: config.indexEnabled,
    createdAt: config.createdAt,
    by: config.by,
    byUid: config.byUid,
  };
}

/** Versionen neueste zuerst. */
export function sortedConfigs(configs: readonly CompetenceConfig[]): CompetenceConfig[] {
  return [...configs].sort((a, b) => b.version - a.version);
}

/** Gültige Konfiguration: die höchste Version, sonst der Standard (Version 0). */
export function currentConfig(configs: readonly CompetenceConfig[]): CompetenceConfig {
  return sortedConfigs(configs)[0] ?? DEFAULT_COMPETENCE_CONFIG;
}

/** Konfiguration, die an einem Tag galt (zur Rekonstruktion eines früheren Index). */
export function configAt(configs: readonly CompetenceConfig[], isoDate: string): CompetenceConfig {
  return sortedConfigs(configs).find((config) => config.createdAt.slice(0, 10) <= isoDate) ?? DEFAULT_COMPETENCE_CONFIG;
}

/**
 * Vorschlag: Profilgewichte nur für die erhobenen Bereiche, anteilig auf 100 hochgerechnet (ganze Zahlen; der Rest
 * der Rundung geht an den ersten Bereich), dann in die erlaubten Grenzen gesetzt.
 */
export function suggestedWeights(profileId: string, domains: readonly CompetenceDomain[]): Partial<Record<CompetenceDomain, number>> {
  const profile = weightProfileById(profileId);
  const active = COMPETENCE_DOMAINS.filter((domain) => domains.includes(domain));
  if (!profile || active.length === 0) return {};
  const total = active.reduce((sum, domain) => sum + profile.weights[domain], 0);
  const weights: Partial<Record<CompetenceDomain, number>> = {};
  for (const domain of active) {
    const [min, max] = weightBounds(profileId, domain);
    const raw = total > 0 ? Math.round((profile.weights[domain] / total) * 100) : Math.round(100 / active.length);
    weights[domain] = Math.min(max, Math.max(min, raw));
  }
  const sum = active.reduce((acc, domain) => acc + (weights[domain] ?? 0), 0);
  const first = active[0];
  const [min, max] = weightBounds(profileId, first);
  weights[first] = Math.min(max, Math.max(min, (weights[first] ?? 0) + 100 - sum));
  return weights;
}

/** Erlaubter Bereich eines Gewichts im Profil: ±WEIGHT_TOLERANCE, nie unter 0. */
export function weightBounds(profileId: string, domain: CompetenceDomain): readonly [number, number] {
  const base = weightProfileById(profileId)?.weights[domain] ?? 0;
  return [Math.max(0, base - WEIGHT_TOLERANCE), base + WEIGHT_TOLERANCE];
}

export interface ConfigDraft {
  readonly domains: readonly CompetenceDomain[];
  readonly weightProfile: string | null;
  readonly weights: Readonly<Partial<Record<CompetenceDomain, number>>>;
  readonly indexEnabled: boolean;
}

/** Fehlertexte zur Konfiguration; leer = gültig. */
export function validateConfigDraft(draft: ConfigDraft): string[] {
  const errors: string[] = [];
  const domains = COMPETENCE_DOMAINS.filter((domain) => draft.domains.includes(domain));
  if (domains.length === 0) errors.push('Mindestens ein Bereich muss erhoben werden.');
  if (draft.indexEnabled && !draft.weightProfile) errors.push('Für einen Gesamtindex bitte ein Gewichtsprofil wählen.');
  if (!draft.weightProfile) return errors;
  if (!weightProfileById(draft.weightProfile)) return [...errors, 'Unbekanntes Gewichtsprofil.'];
  let sum = 0;
  for (const domain of domains) {
    const weight = draft.weights[domain];
    const [min, max] = weightBounds(draft.weightProfile, domain);
    if (typeof weight !== 'number' || !Number.isInteger(weight)) {
      errors.push(`Gewicht für „${DOMAIN_LABELS[domain]}“ fehlt.`);
      continue;
    }
    if (weight < min || weight > max) errors.push(`${DOMAIN_LABELS[domain]}: ${weight} % liegt außerhalb des erlaubten Bereichs ${min}–${max} %.`);
    sum += weight;
  }
  if (Object.keys(draft.weights).some((key) => !isCompetenceDomain(key) || !domains.includes(key))) errors.push('Gewichte nur für erhobene Bereiche.');
  if (domains.length > 0 && sum !== 100) errors.push(`Die Gewichte ergeben zusammen ${sum} % statt 100 %.`);
  return errors;
}

/** Neue Version aus dem Entwurf (Gewichte nur mit Profil). */
export function nextConfig(
  configs: readonly CompetenceConfig[],
  draft: ConfigDraft,
  meta: { readonly by: string; readonly byUid: string; readonly createdAt: string },
): CompetenceConfig {
  const domains = COMPETENCE_DOMAINS.filter((domain) => draft.domains.includes(domain));
  const weights: Partial<Record<CompetenceDomain, number>> = {};
  if (draft.weightProfile) for (const domain of domains) if (typeof draft.weights[domain] === 'number') weights[domain] = draft.weights[domain];
  return {
    version: currentConfig(configs).version + 1,
    framework: COMPETENCE_FRAMEWORK_VERSION,
    domains,
    weightProfile: draft.weightProfile,
    weights,
    indexEnabled: draft.indexEnabled && !!draft.weightProfile,
    createdAt: meta.createdAt,
    by: meta.by.slice(0, MAX_CONFIG_BY),
    byUid: meta.byUid,
  };
}

