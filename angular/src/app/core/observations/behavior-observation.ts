/**
 * Trainerbeobachtungen mit Verhaltensankern (SCRUM-268, docs/beobachtungsanker.md).
 *
 * Eine Beobachtung = ein Kriterium, ein Spieler, eine bewertende Person, ein Beobachtungszeitraum mit der Zahl
 * konkreter Beobachtungsgelegenheiten und optional einem Beleg (Termin und/oder kurzes Beispiel). Die Stufe 1–5
 * beschreibt beobachtetes Verhalten im Zeitraum – kein festes Persönlichkeitsmerkmal, keine Diagnose.
 *
 * Dokument `teams/{teamId}/players/{playerId}/behaviorObservations/{id}`; lesen und schreiben nur Trainer (Regeln).
 * Feldnamen wie bei den Raster-Beobachtungen aus SCRUM-266 (playerId, framework, criterionId, value, date, eventId,
 * source, by, byUid, createdAt), damit sich beide Modelle später zusammenführen lassen.
 *
 * Auswertung: je Kriterium die jüngste Einschätzung JEDES Trainers getrennt. Es gibt bewusst keinen Mittelwert über
 * Trainer: Bei Uneinigkeit (Abstand ≥ 2 Stufen) zeigt die App beide Urteile und sagt „widersprüchlich“; bei Einigkeit
 * nur die Spanne. Wenige Gelegenheiten heißen ausdrücklich „begrenzte Daten – unsicher“. Keine Konfidenzintervalle.
 */
import { daysBetween, isIsoDate } from '../shared/dates';

/** Version der Anker. Jede inhaltliche Änderung an Kriterien oder Ankern = neue Version (alte bleiben lesbar). */
export const ANCHOR_VERSION = 'anker-1';
export const MIN_VALUE = 1;
export const MAX_VALUE = 5;
/** Ab so vielen Beobachtungsgelegenheiten (zusammen, je Trainer die jüngste Einschätzung) gilt „ausreichend beobachtet“. */
export const MIN_OPPORTUNITIES = 6;
/** Ab diesem Abstand zwischen zwei Trainern gilt die Einschätzung als widersprüchlich. */
export const CONFLICT_GAP = 2;
/** Einschätzungen, deren Zeitraum länger als so viele Tage zurück endet, zählen nicht mehr zum aktuellen Stand. */
export const RECENT_DAYS = 365;
export const MAX_PERIOD_DAYS = 365;
export const MAX_OPPORTUNITIES = 50;
export const MAX_EVIDENCE = 300;
export const MAX_BY = 80;

export const SOURCES = ['trainer'] as const;
export type ObservationSource = (typeof SOURCES)[number];
export const SOURCE_LABELS: Readonly<Record<ObservationSource, string>> = { trainer: 'Trainereinschätzung' };

export interface Anchor {
  /** Beobachtbares Verhalten auf dieser Stufe. */
  readonly text: string;
  /** Beispiel aus Training oder Spiel. */
  readonly example: string;
}

export interface BehaviorCriterion {
  readonly id: string;
  readonly label: string;
  /** Worauf der Trainer achtet. */
  readonly question: string;
  /** Anker für Stufe 1 bis 5 (Index 0 = Stufe 1). */
  readonly anchors: readonly [Anchor, Anchor, Anchor, Anchor, Anchor];
}

/**
 * Kriterien und Anker (anker-1). Eigene, fachliche Formulierungen dieses Projekts; keine Items aus geschützten
 * Fragebögen (PCDEQ2 diente nur als methodischer Bezug: beobachtbares Verhalten statt Eigenschaften).
 */
export const BEHAVIOR_CRITERIA: readonly BehaviorCriterion[] = [
  {
    id: 'afterMistake',
    label: 'Konzentration nach Fehlern',
    question: 'Was tut der Spieler in den nächsten Aktionen nach einem eigenen Fehler, Ballverlust oder Gegentor?',
    anchors: [
      { text: 'Ist nach einem Fehler meist mehrere Aktionen lang nicht beteiligt.', example: 'Bleibt nach einem Ballverlust stehen und läuft nicht zurück.' },
      { text: 'Kommt nach Fehlern teilweise zurück, oft erst nach Zuruf.', example: 'Läuft nach einem Fehlpass erst zurück, als der Trainer ruft.' },
      { text: 'Ist nach einzelnen Fehlern bei der nächsten Aktion wieder dabei, nach mehreren Fehlern hintereinander seltener.', example: 'Setzt nach dem ersten Ballverlust sofort nach, nach dem zweiten nicht mehr.' },
      { text: 'Ist nach Fehlern fast immer bei der nächsten Aktion wieder beteiligt.', example: 'Fordert nach einem Fehlpass gleich wieder den Ball.' },
      { text: 'Bleibt auch nach mehreren Fehlern oder einem Gegentor beteiligt und hilft anderen weiterzumachen.', example: 'Holt nach dem Gegentor den Ball und ruft „weiter, Jungs“.' },
    ],
  },
  {
    id: 'communication',
    label: 'Kommunikation',
    question: 'Was sagt oder zeigt der Spieler seinen Mitspielern im Spiel und in Übungen?',
    anchors: [
      { text: 'Spricht im Spiel kaum mit Mitspielern, auch nicht in klaren Situationen.', example: 'Kein Zuruf, obwohl ein Gegner im Rücken des Mitspielers steht.' },
      { text: 'Spricht vereinzelt, meist erst nach Aufforderung.', example: 'Ruft „Hintermann“, nachdem der Trainer daran erinnert hat.' },
      { text: 'Gibt in bekannten Situationen kurze, passende Zurufe.', example: '„Zeit“ oder „Hintermann“ bei Ballannahmen in der Übung.' },
      { text: 'Gibt regelmäßig klare Hinweise und spricht sich mit Mitspielern ab.', example: 'Spricht bei Standards ab, wer wen deckt.' },
      { text: 'Lenkt Mitspieler auch unter Druck verständlich und sachlich.', example: 'Ordnet in der Schlussphase ruhig die Abwehrkette, ohne jemanden anzuschreien.' },
    ],
  },
  {
    id: 'responsibility',
    label: 'Verantwortungsübernahme',
    question: 'Übernimmt der Spieler Aufgaben, für die er zuständig ist oder die sonst niemand übernimmt?',
    anchors: [
      { text: 'Übernimmt Aufgaben fast nur nach direkter Aufforderung.', example: 'Bietet sich in engen Situationen nicht zum Pass an.' },
      { text: 'Übernimmt Aufgaben in einfachen Situationen, weicht unter Druck eher aus.', example: 'Fordert den Ball bei Führung, bei Rückstand kaum.' },
      { text: 'Übernimmt die eigene Aufgabe meist verlässlich.', example: 'Deckt bei Standards seinen Gegenspieler ohne Erinnerung.' },
      { text: 'Übernimmt Aufgaben auch in schwierigen Phasen.', example: 'Fordert bei Rückstand den Ball und spielt den Aufbau mit.' },
      { text: 'Übernimmt Aufgaben auch über die eigene Rolle hinaus und bezieht andere ein.', example: 'Zeigt neuen Mitspielern den Ablauf der Übung.' },
    ],
  },
  {
    id: 'learning',
    label: 'Lernverhalten',
    question: 'Wie geht der Spieler mit Korrekturen und neuen Aufgaben um?',
    anchors: [
      { text: 'Setzt Korrekturen selten um und wiederholt das bisherige Vorgehen.', example: 'Nimmt den Ball nach dem Hinweis weiter mit dem falschen Fuß an.' },
      { text: 'Probiert Korrekturen gelegentlich aus, meist nur direkt nach dem Hinweis.', example: 'Setzt den Schulterblick eine Wiederholung lang um.' },
      { text: 'Setzt Korrekturen in der nächsten Wiederholung meist um.', example: 'Spielt nach dem Hinweis den Pass in den Lauf statt in den Fuß.' },
      { text: 'Setzt Korrekturen um, fragt bei Unklarheit nach und übt selbstständig weiter.', example: 'Fragt nach, wann er andribbeln soll, und probiert es in der Pause.' },
      { text: 'Überträgt Gelerntes in neue Situationen und ins Spiel und bittet selbst um Rückmeldung.', example: 'Nutzt das geübte Aufdrehen im Spiel und fragt danach, ob es passte.' },
    ],
  },
];

export function criterionById(id: string): BehaviorCriterion | null {
  return BEHAVIOR_CRITERIA.find((criterion) => criterion.id === id) ?? null;
}

/** Anker zu einer Stufe (oder null bei unbekanntem Kriterium bzw. ungültiger Stufe). */
export function anchorFor(criterionId: string, value: number): Anchor | null {
  const criterion = criterionById(criterionId);
  if (!criterion || !Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE) return null;
  return criterion.anchors[value - 1];
}

export interface BehaviorObservation {
  readonly id: string;
  readonly framework: string;
  readonly criterionId: string;
  readonly value: number;
  /** Tag der Einschätzung (ISO). */
  readonly date: string;
  /** Beobachtungszeitraum (ISO), leer bei unvollständigen Altdaten. */
  readonly periodFrom: string;
  readonly periodTo: string;
  /** Zahl konkreter Beobachtungsgelegenheiten, `null` bei unvollständigen Altdaten. */
  readonly opportunities: number | null;
  /** Termin als Beleg (optional). */
  readonly eventId: string | null;
  /** Kurzes, konkretes Beispiel als Beleg (optional). */
  readonly evidence: string;
  readonly source: string;
  readonly by: string;
  readonly byUid: string;
  readonly createdAt: string;
  /**
   * Mit Ankern dieser Version, Zeitraum und Gelegenheiten erfasst. `false` = historisch/unkalibriert: bleibt lesbar,
   * zählt aber nicht zum aktuellen Stand.
   */
  readonly calibrated: boolean;
}

export interface ObservationDraft {
  readonly criterionId: string;
  readonly value: number | null;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly opportunities: string;
  readonly eventId: string;
  readonly evidence: string;
}

export type ObservationErrors = Partial<Record<'criterionId' | 'value' | 'periodFrom' | 'periodTo' | 'opportunities' | 'eventId' | 'evidence', string>>;

/** Termin, der als Beleg gewählt werden kann. */
export interface EvidenceEvent {
  readonly id: string;
  readonly date: string;
  readonly title: string;
}

export function validateObservationDraft(draft: ObservationDraft, today: string, events: readonly EvidenceEvent[]): ObservationErrors {
  const errors: ObservationErrors = {};
  if (!criterionById(draft.criterionId)) errors.criterionId = 'Bitte ein Kriterium wählen.';
  if (draft.value === null || !Number.isInteger(draft.value) || draft.value < MIN_VALUE || draft.value > MAX_VALUE) {
    errors.value = 'Bitte die Beschreibung wählen, die das beobachtete Verhalten am besten trifft.';
  }
  const fromOk = isIsoDate(draft.periodFrom);
  const toOk = isIsoDate(draft.periodTo);
  if (!fromOk) errors.periodFrom = 'Bitte den Beginn des Beobachtungszeitraums eingeben.';
  if (!toOk) errors.periodTo = 'Bitte das Ende des Beobachtungszeitraums eingeben.';
  else if (draft.periodTo > today) errors.periodTo = 'Der Zeitraum darf nicht in der Zukunft enden.';
  if (fromOk && toOk && !errors.periodTo) {
    if (draft.periodFrom > draft.periodTo) errors.periodFrom = 'Der Beginn muss vor dem Ende liegen.';
    else if (daysBetween(draft.periodFrom, draft.periodTo) > MAX_PERIOD_DAYS) errors.periodFrom = `Der Zeitraum darf höchstens ${MAX_PERIOD_DAYS} Tage umfassen.`;
  }
  const opportunities = Number(draft.opportunities.trim());
  if (!draft.opportunities.trim() || !Number.isInteger(opportunities) || opportunities < 1 || opportunities > MAX_OPPORTUNITIES) {
    errors.opportunities = `Bitte die Zahl konkreter Beobachtungsgelegenheiten eingeben (1–${MAX_OPPORTUNITIES}).`;
  }
  if (draft.eventId) {
    const event = events.find((entry) => entry.id === draft.eventId);
    if (!event) errors.eventId = 'Diesen Termin gibt es nicht mehr.';
    else if (fromOk && toOk && (event.date < draft.periodFrom || event.date > draft.periodTo)) errors.eventId = 'Der Termin liegt außerhalb des Beobachtungszeitraums.';
  }
  if (draft.evidence.trim().length > MAX_EVIDENCE) errors.evidence = `Das Beispiel darf höchstens ${MAX_EVIDENCE} Zeichen lang sein.`;
  return errors;
}

export function observationFromDraft(
  draft: ObservationDraft,
  meta: { readonly id: string; readonly date: string; readonly by: string; readonly byUid: string; readonly createdAt: string },
): BehaviorObservation {
  return {
    id: meta.id,
    framework: ANCHOR_VERSION,
    criterionId: draft.criterionId,
    value: draft.value ?? 0,
    date: meta.date,
    periodFrom: draft.periodFrom,
    periodTo: draft.periodTo,
    opportunities: Number(draft.opportunities.trim()),
    eventId: draft.eventId || null,
    evidence: draft.evidence.trim(),
    source: 'trainer',
    by: meta.by.slice(0, MAX_BY),
    byUid: meta.byUid,
    createdAt: meta.createdAt,
    calibrated: true,
  };
}

/** Dokument ohne `playerId` (das ergänzt die Schnittstelle beim Speichern). */
export function docFromObservation(observation: BehaviorObservation): Record<string, unknown> {
  return {
    framework: observation.framework,
    criterionId: observation.criterionId,
    value: observation.value,
    date: observation.date,
    periodFrom: observation.periodFrom,
    periodTo: observation.periodTo,
    opportunities: observation.opportunities,
    eventId: observation.eventId,
    evidence: observation.evidence,
    source: observation.source,
    by: observation.by,
    byUid: observation.byUid,
    createdAt: observation.createdAt,
  };
}

/**
 * Liest ein Dokument nachsichtig: Alles mit einer lesbaren Stufe und einem Datum bleibt erhalten. Fehlen Zeitraum,
 * Gelegenheiten oder passt die Ankerversion nicht, gilt es als historisch/unkalibriert (`calibrated: false`).
 */
export function observationFromDoc(id: string, data: Readonly<Record<string, unknown>>): BehaviorObservation | null {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const value = typeof data['value'] === 'number' && Number.isFinite(data['value']) ? data['value'] : null;
  const periodFrom = isIsoDate(text(data['periodFrom'])) ? text(data['periodFrom']) : '';
  const periodTo = isIsoDate(text(data['periodTo'])) ? text(data['periodTo']) : '';
  const date = isIsoDate(text(data['date'])) ? text(data['date']) : periodTo;
  if (value === null || !date) return null;
  const rawOpportunities = data['opportunities'];
  const opportunities = typeof rawOpportunities === 'number' && Number.isInteger(rawOpportunities) && rawOpportunities >= 1 ? rawOpportunities : null;
  const framework = text(data['framework']);
  const criterionId = text(data['criterionId']);
  const calibrated =
    framework === ANCHOR_VERSION &&
    anchorFor(criterionId, value) !== null &&
    !!periodFrom &&
    !!periodTo &&
    periodFrom <= periodTo &&
    opportunities !== null;
  return {
    id,
    framework,
    criterionId,
    value,
    date,
    periodFrom,
    periodTo,
    opportunities,
    eventId: text(data['eventId']) || null,
    evidence: text(data['evidence']),
    source: text(data['source']) || 'trainer',
    by: text(data['by']),
    byUid: text(data['byUid']),
    createdAt: text(data['createdAt']),
    calibrated,
  };
}

// --- Auswertung ----------------------------------------------------------------------------------------------

export type Quality = 'none' | 'limited' | 'sufficient' | 'conflicting';

export const QUALITY_LABELS: Readonly<Record<Quality, string>> = {
  none: 'Noch nicht beobachtet',
  limited: 'Begrenzte Daten – unsicher',
  sufficient: 'Ausreichend beobachtet',
  conflicting: 'Widersprüchliche Einschätzung',
};

export interface CriterionSummary {
  readonly criterion: BehaviorCriterion;
  /** Jüngste kalibrierte Einschätzung je Trainer im Zeitraum, neueste zuerst. */
  readonly perAssessor: readonly BehaviorObservation[];
  readonly quality: Quality;
  /** Gelegenheiten zusammen (je Trainer die jüngste Einschätzung). */
  readonly opportunities: number;
  readonly assessors: number;
  /** Niedrigste und höchste Stufe der Trainer (gleich bei einem Trainer); `null` ohne Beobachtung. */
  readonly range: { readonly min: number; readonly max: number } | null;
  /** Kurzer Satz, was das für die Einschätzung heißt. */
  readonly message: string;
}

function newestFirst(a: BehaviorObservation, b: BehaviorObservation): number {
  return b.periodTo.localeCompare(a.periodTo) || b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

/** Schlüssel der bewertenden Person: Konto, sonst Name (ältere Einträge ohne Konto). */
function assessorKey(observation: BehaviorObservation): string {
  return observation.byUid || `name:${observation.by}`;
}

export function criterionSummary(observations: readonly BehaviorObservation[], criterion: BehaviorCriterion, today: string): CriterionSummary {
  const recent = observations
    .filter((entry) => entry.calibrated && entry.criterionId === criterion.id && daysBetween(entry.periodTo, today) <= RECENT_DAYS)
    .sort(newestFirst);
  const seen = new Set<string>();
  const perAssessor: BehaviorObservation[] = [];
  for (const entry of recent) {
    const key = assessorKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    perAssessor.push(entry);
  }
  const opportunities = perAssessor.reduce((sum, entry) => sum + (entry.opportunities ?? 0), 0);
  const values = perAssessor.map((entry) => entry.value);
  const range = values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : null;
  const assessors = perAssessor.length;
  let quality: Quality;
  let message: string;
  if (!range) {
    quality = 'none';
    message = 'Für dieses Kriterium gibt es noch keine Einschätzung mit Zeitraum und Beobachtungszahl.';
  } else if (assessors >= 2 && range.max - range.min >= CONFLICT_GAP) {
    quality = 'conflicting';
    message = `Die Trainer sehen das unterschiedlich (Stufe ${range.min} bis ${range.max}). Beide Einschätzungen bleiben stehen; die App bildet hier keinen Mittelwert. Am besten gemeinsam besprechen und gezielt weiter beobachten.`;
  } else if (opportunities < MIN_OPPORTUNITIES) {
    quality = 'limited';
    message = `Erst ${opportunities} ${opportunities === 1 ? 'Beobachtungsgelegenheit' : 'Beobachtungsgelegenheiten'} – die Einschätzung ist unsicher. Ab ${MIN_OPPORTUNITIES} Gelegenheiten gilt sie als ausreichend beobachtet.`;
  } else {
    quality = 'sufficient';
    message =
      assessors === 1
        ? `${opportunities} Beobachtungsgelegenheiten, Einschätzung eines Trainers (eine Perspektive).`
        : `${opportunities} Beobachtungsgelegenheiten, ${assessors} Trainer liegen höchstens eine Stufe auseinander.`;
  }
  return { criterion, perAssessor, quality, opportunities, assessors, range, message };
}

export function observationSummaries(observations: readonly BehaviorObservation[], today: string): CriterionSummary[] {
  return BEHAVIOR_CRITERIA.map((criterion) => criterionSummary(observations, criterion, today));
}

/** Anzeige der Stufe(n): eine Stufe oder die Spanne – nie ein Mittelwert. */
export function rangeLabel(range: CriterionSummary['range']): string {
  if (!range) return '–';
  return range.min === range.max ? `Stufe ${range.min}` : `Stufe ${range.min}–${range.max}`;
}

/** Historische/unkalibrierte Einträge (lesbar, zählen nicht zum Stand), neueste zuerst. */
export function uncalibrated(observations: readonly BehaviorObservation[]): BehaviorObservation[] {
  return observations.filter((entry) => !entry.calibrated).sort(newestFirst);
}

/** Alle kalibrierten Einträge (Verlauf mit „Löschen“), neueste zuerst. */
export function calibratedHistory(observations: readonly BehaviorObservation[]): BehaviorObservation[] {
  return observations.filter((entry) => entry.calibrated).sort(newestFirst);
}

/** Warum ein Eintrag als unkalibriert gilt (für die Anzeige). */
export function uncalibratedReason(observation: BehaviorObservation): string {
  if (observation.framework !== ANCHOR_VERSION) return observation.framework ? `andere Ankerversion (${observation.framework})` : 'ohne Ankerversion';
  if (!criterionById(observation.criterionId)) return 'unbekanntes Kriterium';
  if (anchorFor(observation.criterionId, observation.value) === null) return 'Stufe außerhalb 1–5';
  if (!observation.periodFrom || !observation.periodTo) return 'ohne Beobachtungszeitraum';
  if (observation.opportunities === null) return 'ohne Zahl der Beobachtungsgelegenheiten';
  return 'unvollständig';
}
