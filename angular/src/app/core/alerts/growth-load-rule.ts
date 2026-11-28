/**
 * Wenn-dann-Regel „Wachstum und Belastung gemeinsam ansehen“ (SCRUM-257, Teil der Regeln aus SCRUM-195). Auslöser,
 * Ablauf und Wiederholungsschutz: docs/reife-kompass-wachstum-belastung-hinweis.md. Reine Funktionen, ohne Angular.
 *
 * Kein neuer Formelwert: Die Regel verknüpft nur den bestehenden Wachstumshinweis (`analyzeGrowth` +
 * `growthHintLevel`, Methodenversion 1.0 §6) mit den bestehenden Belastungshinweisen der Belastungsampel
 * („Belastungsspitze“, „Zwei sehr harte Einheiten innerhalb von 48 Stunden“). Sie setzt nie „verletzt“, „nicht
 * einsetzen“ oder eine Sperre und ändert nichts an Belastung, Teilnahme oder Verfügbarkeit.
 */
import { type WellnessSummary, wellnessSummary } from '../analysis/growth-load-overview';
import { HARD_SESSIONS_REASON, injuryRisk, measurementCheckText } from '../analysis/risk';
import type { Player } from '../player/player';
import { isConsentRevoked } from '../player/player';
import type { EventRating } from '../profile/profile';
import type { Absence } from '../records/absence';
import { type GrowthReview, reviewFor } from '../records/growth-review';
import { FRESH_DAYS, type GrowthPoint, analyzeGrowth, flaggedDatesAffectingRate, growthHintLevel, hintRateAt, perMonth } from '../records/growth-velocity';
import type { Measurement } from '../records/measurement';
import { type WellnessEntry, wellnessSum } from '../self-report/self-report';
import { addDays } from '../shared/dates';

/** So weit zurück fasst der Hinweis das Befinden zusammen (nur Zusatzangabe, kein Auslöser). */
export const GROWTH_LOAD_WELLNESS_DAYS = 28;

export const SPIKE_REASON = 'Belastungsspitze';

/** Daten eines Spielers (Teil von `AlertPlayerData`). `items === null`: Bewertungen nicht lesbar, Regel schweigt. */
export interface GrowthLoadData {
  readonly player: Player;
  readonly items: readonly EventRating[] | null;
  readonly absences: readonly Absence[];
  readonly measurements: readonly Measurement[];
  readonly wellness: readonly WellnessEntry[] | null;
  /** Dokumentierte Trainerprüfungen; `null`/fehlt = keine bekannt. */
  readonly growthReviews?: readonly GrowthReview[] | null;
}

/** `check-measurement`: zuerst Messung prüfen (Messqualität nicht dokumentiert); `review`: gemeinsam ansehen. */
export type GrowthLoadState = 'check-measurement' | 'review';

export interface GrowthLoadStatus {
  /** Kennung des Hinweises: Spieler + Messpaar (Kennung, Datum, Größe). Gleiche Daten = gleiche Kennung. */
  readonly key: string;
  readonly state: GrowthLoadState;
  readonly partner: GrowthPoint;
  readonly newest: GrowthPoint;
  readonly cmPerMonth: number;
  readonly strong: boolean;
  /** Erster Tag seit der jüngsten Messung mit Belastungshinweis, und welche Hinweise es waren. */
  readonly loadDay: string;
  readonly loadReasons: readonly string[];
  /** Letzter Tag, an dem der Wachstumshinweis noch aktuell ist (jüngste Messung + 90 Tage). */
  readonly expires: string;
  /** Messtage ohne dokumentierte Messqualität (dann zuerst „Messung prüfen“). */
  readonly uncheckedDates: readonly string[];
  /**
   * Zur Prüfung markierte, nicht bestätigte Messungen, die die Wachstumsrate verändern würden (SCRUM-306): nur Kennzeichnung,
   * Auslöser und Kennung bleiben gleich.
   */
  readonly flaggedDates: readonly string[];
  /** Befinden der letzten 28 Tage: „keine Angaben“ bzw. „nicht lesbar“ bleiben sichtbar. */
  readonly wellness: WellnessSummary;
  /** Dokumentierte Prüfung zu genau diesem Hinweis bis zum Tag (dann kein offener Hinweis mehr). */
  readonly review: GrowthReview | null;
}

const point = (value: GrowthPoint) => `${value.id}@${value.date}@${value.height}`;

export function growthLoadKey(playerId: string, partner: GrowthPoint, newest: GrowthPoint): string {
  return `growthLoad:${playerId}:${point(partner)}>${point(newest)}`;
}

// Belastungshinweise je Spielerdaten und Tag: dieselben Daten werden für viele Tage (Protokoll) ausgewertet.
const loadCache = new WeakMap<object, Map<string, readonly string[]>>();

/** Belastungshinweise der Ampel am Tag `day` (nur Spitze und zwei harte Einheiten; Wachstum zählt hier nicht). */
export function loadReasonsOn(data: GrowthLoadData, day: string): readonly string[] {
  if (!data.items) return [];
  let cache = loadCache.get(data);
  if (!cache) loadCache.set(data, (cache = new Map()));
  const cached = cache.get(day);
  if (cached) return cached;
  const risk = injuryRisk(data.player, data.items, data.absences, [], new Date(`${day}T12:00:00`));
  const reasons = [...(risk.spike ? [SPIKE_REASON] : []), ...(risk.reasons.includes(HARD_SESSIONS_REASON) ? [HARD_SESSIONS_REASON] : [])];
  cache.set(day, reasons);
  return reasons;
}

/**
 * Stand der Regel für einen Spieler am Tag `day`, auch wenn schon geprüft (`review`). `null`: kein Auslöser (Widerruf,
 * kein aktueller Wachstumshinweis, keine Belastung lesbar oder kein Belastungshinweis seit der jüngsten Messung).
 */
export function growthLoadStatus(data: GrowthLoadData, day: string): GrowthLoadStatus | null {
  if (isConsentRevoked(data.player) || !data.items) return null;
  const analysis = analyzeGrowth(data.measurements.filter((item) => item.date <= day), day);
  if (analysis.currentRate === null) return null;
  const cmPerMonth = perMonth(analysis.currentRate);
  const level = growthHintLevel(cmPerMonth);
  if (!level) return null;
  const valid = analysis.points.filter((entry) => entry.quality !== 'flagged');
  const newest = valid[valid.length - 1];
  const partner = hintRateAt(valid, newest).interval?.from;
  if (!partner) return null;
  let loadDay: string | null = null;
  let loadReasons: readonly string[] = [];
  for (let current = newest.date; current <= day; current = addDays(current, 1)) {
    const reasons = loadReasonsOn(data, current);
    if (reasons.length > 0) {
      loadDay = current;
      loadReasons = reasons;
      break;
    }
  }
  if (!loadDay) return null;
  const key = growthLoadKey(data.player.id, partner, newest);
  const uncheckedDates = [partner, newest].filter((entry) => entry.quality !== 'verified').map((entry) => entry.date);
  const wellness = data.wellness === null ? null : data.wellness.map((entry) => ({ date: entry.date, sum: wellnessSum(entry) }));
  return {
    key,
    state: uncheckedDates.length > 0 ? 'check-measurement' : 'review',
    partner,
    newest,
    cmPerMonth,
    strong: level === 'strong',
    loadDay,
    loadReasons,
    expires: addDays(newest.date, FRESH_DAYS),
    uncheckedDates,
    flaggedDates: flaggedDatesAffectingRate(data.measurements, day),
    wellness: wellnessSummary(wellness, addDays(day, -GROWTH_LOAD_WELLNESS_DAYS), day),
    review: reviewFor(data.growthReviews, key, day),
  };
}

/** Offener Hinweis am Tag `day` (geprüfte zählen nicht mehr). */
export function growthLoadMatch(data: GrowthLoadData, day: string): GrowthLoadStatus | null {
  const status = growthLoadStatus(data, day);
  return status && !status.review ? status : null;
}

const german = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const comma = (value: number) => (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');

export function wellnessText(summary: WellnessSummary): string {
  if (summary.state === 'unreadable') return 'Befinden nicht freigegeben oder nicht lesbar';
  if (summary.state === 'none' || summary.mean === null) return 'Befinden: keine Angaben';
  return `Befinden Ø ${comma(summary.mean)} von 28 (${summary.count} Angaben)`;
}

/** Kurzer Grund für die Hinweisliste (nur in der App, nie in einer E-Mail). */
export function growthLoadDetail(status: GrowthLoadStatus): string {
  const growth = `Wachstum ${comma(status.cmPerMonth)} cm/Monat (${german(status.partner.date)} bis ${german(status.newest.date)})`;
  const load = `${status.loadReasons.join(' und ')} am ${german(status.loadDay)}`;
  const check = status.flaggedDates.length ? ` ${measurementCheckText(status.flaggedDates)}.` : '';
  if (status.state === 'check-measurement') {
    return `Messung prüfen: Messqualität vom ${status.uncheckedDates.map(german).join(' und ')} nicht dokumentiert. Danach gemeinsam ansehen: ${growth}, ${load}.${check}`;
  }
  return `${growth}, ${load}; ${wellnessText(status.wellness)}. Bitte gemeinsam ansehen und die Prüfung im Profil dokumentieren (läuft ab am ${german(status.expires)}).${check}`;
}
