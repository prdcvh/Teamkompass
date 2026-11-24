/**
 * Entwicklungsraster (SCRUM-266, Konzept: docs/bewertungsmodell.md): versionierter Katalog mit fünf Bereichen, je drei
 * beobachtbaren Kriterien, einer Häufigkeitsskala und Gewichtsprofilen (Hypothesen). Getrennt von den bisherigen
 * Eventnoten (`core/ratings/rating.ts`, Modell `eventnoten-1`), die unverändert bleiben und nie hierher umgerechnet
 * werden. Jede inhaltliche Änderung an diesem Katalog ergibt eine neue Rasterversion (Dokument §11).
 */

/** Version des Rasters; muss der Angabe in docs/bewertungsmodell.md entsprechen (tests/bewertungsmodell.test.mjs). */
export const COMPETENCE_FRAMEWORK_VERSION = 'raster-1';

/** Bezeichnung des bisherigen Modells (die vier Eventnoten), damit beide Modelle in der App getrennt benannt sind. */
export const LEGACY_MODEL_ID = 'eventnoten-1';
export const LEGACY_MODEL_LABEL = 'Eventnoten (bisheriges Modell)';

export const COMPETENCE_DOMAINS = ['technique', 'tactics', 'physical', 'psychological', 'social'] as const;
export type CompetenceDomain = (typeof COMPETENCE_DOMAINS)[number];

export const DOMAIN_LABELS: Readonly<Record<CompetenceDomain, string>> = {
  technique: 'Technik',
  tactics: 'Taktik und Entscheidung',
  physical: 'Physis',
  psychological: 'Psychologische Entwicklungsfähigkeiten',
  social: 'Team- und Sozialverhalten',
};

/** Kurzer Hinweis je Bereich (nur wo nötig). */
export const DOMAIN_HINTS: Readonly<Partial<Record<CompetenceDomain, string>>> = {
  physical: 'Beobachtete Bewegung, keine Messwerte. Unterschiede in der körperlichen Reife verzerren diesen Bereich.',
  psychological: 'Nur beobachtbares Verhalten – keine Aussage über die Persönlichkeit.',
  social: 'Nur beobachtbares Verhalten – keine Aussage über die Persönlichkeit.',
};

export interface CompetenceCriterion {
  readonly id: string;
  readonly domain: CompetenceDomain;
  readonly label: string;
  /** Verhaltensanker: was der Trainer sehen oder hören kann. */
  readonly anchor: string;
}

export const COMPETENCE_CRITERIA: readonly CompetenceCriterion[] = [
  { id: 'technique.firstTouch', domain: 'technique', label: 'Ballannahme und -mitnahme', anchor: 'Nimmt den Ball so an, dass die nächste Aktion sofort möglich ist (Ball in Bewegungsrichtung, nicht unter dem Körper).' },
  { id: 'technique.passing', domain: 'technique', label: 'Passspiel', anchor: 'Der Pass kommt auf den richtigen Fuß oder in den Lauf, mit passendem Tempo.' },
  { id: 'technique.dribbling', domain: 'technique', label: 'Ballführung und 1 gegen 1', anchor: 'Führt den Ball eng und wechselt unter Gegnerdruck die Richtung.' },
  { id: 'tactics.scanning', domain: 'tactics', label: 'Umschauen vor dem Ballkontakt', anchor: 'Schaut sich vor der Annahme um (Schulterblick).' },
  { id: 'tactics.decision', domain: 'tactics', label: 'Entscheidung mit Ball', anchor: 'Wählt Pass, Dribbling oder Abschluss passend zur Situation (z. B. sieht den freien Mitspieler).' },
  { id: 'tactics.offBall', domain: 'tactics', label: 'Verhalten ohne Ball', anchor: 'Bietet sich an bzw. steht beim Verteidigen richtig (Abstände, Absichern).' },
  { id: 'physical.speed', domain: 'physical', label: 'Antritt und Tempo', anchor: 'Startet schnell in freie Räume und auf freie Bälle.' },
  { id: 'physical.coordination', domain: 'physical', label: 'Koordination und Körperkontrolle', anchor: 'Bremst, dreht und landet kontrolliert, bleibt im Zweikampf stabil.' },
  { id: 'physical.endurance', domain: 'physical', label: 'Intensität über die Dauer', anchor: 'Hält die Laufbereitschaft bis zum Ende von Übung oder Spiel.' },
  { id: 'psychological.afterMistake', domain: 'psychological', label: 'Reaktion nach Fehlern', anchor: 'Ist nach einem Fehler oder Gegentor bei der nächsten Aktion wieder beteiligt (statt abzuwinken oder zu diskutieren).' },
  { id: 'psychological.focus', domain: 'psychological', label: 'Konzentration bei Aufgaben', anchor: 'Setzt eine Anweisung um, ohne dass sie wiederholt werden muss, und bleibt bei der Aufgabe.' },
  { id: 'psychological.feedback', domain: 'psychological', label: 'Umgang mit Rückmeldung', anchor: 'Probiert eine Korrektur in der nächsten Wiederholung aus oder fragt nach.' },
  { id: 'social.communication', domain: 'social', label: 'Kommunikation im Spiel', anchor: 'Ruft an, gibt Kommandos („Hintermann“, „Zeit“), spricht sich mit Mitspielern ab.' },
  { id: 'social.support', domain: 'social', label: 'Unterstützung von Mitspielern', anchor: 'Muntert auf, hilft beim Auf- und Abbau, bezieht neue oder schwächere Mitspieler ein.' },
  { id: 'social.fairPlay', domain: 'social', label: 'Regeln und Fairplay', anchor: 'Hält Absprachen und Regeln ein (Pünktlichkeit, fair zu Gegner und Schiedsrichter).' },
];

export function criterionById(id: string): CompetenceCriterion | undefined {
  return COMPETENCE_CRITERIA.find((criterion) => criterion.id === id);
}

export function criteriaOf(domain: CompetenceDomain): readonly CompetenceCriterion[] {
  return COMPETENCE_CRITERIA.filter((criterion) => criterion.domain === domain);
}

export function isCompetenceDomain(value: unknown): value is CompetenceDomain {
  return typeof value === 'string' && (COMPETENCE_DOMAINS as readonly string[]).includes(value);
}

/** Häufigkeitsskala: größer = häufiger gezeigt. Keine Schulnoten. */
export const OBSERVATION_MIN = 1;
export const OBSERVATION_MAX = 4;
export const OBSERVATION_STEPS: readonly { readonly value: number; readonly label: string; readonly description: string }[] = [
  { value: 1, label: 'zeigt es noch selten', description: 'nur vereinzelt oder mit Hilfe' },
  { value: 2, label: 'zeigt es manchmal', description: 'in einfachen Situationen, nicht verlässlich' },
  { value: 3, label: 'zeigt es meistens', description: 'regelmäßig, auch bei leichtem Druck' },
  { value: 4, label: 'zeigt es sicher', description: 'verlässlich, auch unter Druck und im Spiel' },
];

/** Wort zur (gemittelten) Stufe: nächste Stufe. */
export function stepLabel(value: number): string {
  const step = Math.min(OBSERVATION_MAX, Math.max(OBSERVATION_MIN, Math.round(value)));
  return OBSERVATION_STEPS[step - OBSERVATION_MIN].label;
}

export const OCCASIONS = ['training', 'match', 'test', 'other'] as const;
export type Occasion = (typeof OCCASIONS)[number];
export const OCCASION_LABELS: Readonly<Record<Occasion, string>> = { training: 'Training', match: 'Spiel', test: 'Test/Sichtung', other: 'Sonstiges' };

/** Quelle einer Beobachtung. Heute nur der Trainer; SCRUM-268 kann weitere ergänzen. */
export const OBSERVATION_SOURCES = ['trainer'] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

/** Gewichtsprofile: konfigurierbare Hypothesen, keine wissenschaftlichen Standardgewichte (Dokument §7). */
export interface WeightProfile {
  readonly id: string;
  readonly label: string;
  readonly weights: Readonly<Record<CompetenceDomain, number>>;
}

/** Höchste erlaubte Abweichung eines Gewichts vom Profil, in Prozentpunkten. */
export const WEIGHT_TOLERANCE = 10;

export const WEIGHT_PROFILES: readonly WeightProfile[] = [
  { id: 'balanced', label: 'Ausgewogen (gleiche Gewichte)', weights: { technique: 20, tactics: 20, physical: 20, psychological: 20, social: 20 } },
  { id: 'foundation', label: 'Hypothese Grundlagenbereich (bis U13)', weights: { technique: 30, tactics: 20, physical: 10, psychological: 20, social: 20 } },
  { id: 'buildup', label: 'Hypothese Aufbaubereich (U14–U19)', weights: { technique: 25, tactics: 25, physical: 15, psychological: 20, social: 15 } },
];

export function weightProfileById(id: string | null | undefined): WeightProfile | undefined {
  return WEIGHT_PROFILES.find((profile) => profile.id === id);
}
