/**
 * Belastungsampel eines Spielers (SCRUM-137). Rechnet wie die bisherige App (outputs/team-manager/app.js:
 * `assessLoad`) und ist eine Kernzahl (CLAUDE.md „wrong core numbers“).
 *
 * - Belastung pro Termin = Minuten × Anstrengung (0–10). Minuten: bei Spielen die gespielten Minuten, sonst die Dauer
 *   des Termins (Training: Standard 90); „eingeschränkt“ ohne eingetragene Minuten zählt 60 % der Dauer.
 * - Nur vergangene Termine zählen (SCRUM-136).
 * - Wochenvergleich: die letzten 7 Tage gegen den Schnitt der 3 Wochen davor (Tage 8–28), ohne Überschneidung.
 *   Die Spitzenwarnung (ab dem 1,5-fachen) gibt es nur, wenn in mindestens 3 der 4 Wochen Belastung vorhanden ist; sonst
 *   erscheint nur der Hinweis „Wiedereinstieg – langsam steigern“. So steht nach einer Pause nicht der ganze Kader auf „Anpassen“.
 * - Erholung: zwei Einheiten mit Anstrengung ≥ 7 innerhalb von 48 Stunden.
 * - Wachstumsschub: ab 0,6 cm pro Monat ein Hinweis, ab 1,2 cm pro Monat ein starker Hinweis (Kemper et al. 2015).
 * - Rückkehr nach Verletzung/Abwesenheit wie bisher.
 * - Keine Prozentzahl: drei Stufen (Unauffällig / Beobachten / Anpassen) mit den Gründen als Text. Verletzt/Angeschlagen ist
 *   die getrennte „Verfügbarkeit“ und fließt nicht in die Stufe ein.
 */
import { DEFAULT_TRAINING_DURATION, type TeamEvent, plannedMinutes } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { type Absence, activeAbsenceOn, isInjuryAbsence } from '../records/absence';
import { type Measurement, sortedMeasurements } from '../records/measurement';
import { type Rating, roundGrade } from '../ratings/rating';

export type RiskTier = 'unauffaellig' | 'beobachten' | 'anpassen';
export type AvailabilityKey = 'fit' | 'angeschlagen' | 'verletzt';

export const LOAD_TIERS: Readonly<Record<RiskTier, { level: string; action: string }>> = {
  unauffaellig: { level: 'Unauffällig', action: 'Keine Auffälligkeit in der Belastung.' },
  beobachten: { level: 'Beobachten', action: 'Aktuell keine Anpassung nötig, Entwicklung im Blick behalten.' },
  anpassen: { level: 'Anpassen', action: 'Umfang bzw. Anstrengung dosieren und auf ausreichend Erholung achten.' },
};

export interface LoadAvailability {
  readonly key: AvailabilityKey;
  readonly label: string;
  readonly action: string;
}

const AVAILABILITY: Readonly<Record<AvailabilityKey, LoadAvailability>> = {
  fit: { key: 'fit', label: 'Fit', action: '' },
  angeschlagen: { key: 'angeschlagen', label: 'Angeschlagen', action: 'Einsatz nur nach Rücksprache, Belastung dosieren.' },
  verletzt: { key: 'verletzt', label: 'Verletzt', action: 'Nicht einsetzen – ärztliche/physiotherapeutische Abklärung empfohlen.' },
};

export const RISK_TIER_RANK: Readonly<Record<RiskTier, number>> = { unauffaellig: 0, beobachten: 1, anpassen: 2 };

export interface InjuryRisk {
  readonly tier: RiskTier;
  readonly level: string;
  readonly action: string;
  /** Gründe als Text (Hinweise, dann Infos wie „Wiedereinstieg – langsam steigern“). */
  readonly reasons: readonly string[];
  readonly reason: string;
  /** Belastung der letzten 7 Tage (Minuten × Anstrengung). */
  readonly load: number;
  /** Schnitt der 3 Wochen davor (Tage 8–28). */
  readonly baseline: number;
  /** In wie vielen der 4 Wochen Belastung vorhanden war. */
  readonly weeksWithLoad: number;
  /** Einsätze der letzten 4 Wochen. */
  readonly recentEvents: number;
  readonly availability: LoadAvailability;
}

const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);
const daysBetween = (earlier: Date, later: Date) => (later.getTime() - earlier.getTime()) / 86400000;

function isoOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const label = (value: number) => roundGrade(value).toFixed(1).replace('.', ',');

/** Minuten eines Spielers bei diesem Termin. */
export function sessionMinutes(event: TeamEvent, rating: Rating): number {
  const planned = plannedMinutes(event) || DEFAULT_TRAINING_DURATION;
  if (event.type === 'Spiel' && rating.minutes !== null) return Math.max(0, Math.min(planned, rating.minutes));
  return rating.attendance === 'limited' ? planned * 0.6 : planned;
}

/** Belastung eines Termins = Minuten × Anstrengung (0–10). */
export function sessionLoad(event: TeamEvent, rating: Rating): number {
  return sessionMinutes(event, rating) * event.exertion;
}

/**
 * @param items alle Events mit der Bewertung dieses Spielers
 * @param now Zeitpunkt der Auswertung (Standard: jetzt); es zählt der Kalendertag
 */
export function injuryRisk(
  player: Player,
  items: readonly EventRating[],
  absences: readonly Absence[],
  measurements: readonly Measurement[],
  now: Date = new Date(),
): InjuryRisk {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = isoOf(today);

  // Nur vergangene Termine mit Teilnahme; „ago“ = Tage seit dem Termin (0 = heute).
  const past = items
    .filter(({ rating }) => rating?.attendance === 'present' || rating?.attendance === 'limited')
    .map(({ event, rating }) => ({ ago: Math.round(daysBetween(localMidnight(event.date), today)), load: sessionLoad(event, rating!), exertion: event.exertion }))
    .filter((item) => item.ago >= 0)
    .sort((a, b) => a.ago - b.ago);

  // Woche 0 = letzte 7 Tage (heute und 6 Tage davor), Woche 1–3 = die 3 Wochen davor.
  const weekLoads = [0, 1, 2, 3].map((week) => past.filter((item) => item.ago >= week * 7 && item.ago <= week * 7 + 6).reduce((sum, item) => sum + item.load, 0));
  const acute = weekLoads[0];
  const baseline = (weekLoads[1] + weekLoads[2] + weekLoads[3]) / 3;
  const weeksWithLoad = weekLoads.filter((value) => value > 0).length;
  const ratio = baseline > 0 ? acute / baseline : null;
  const hints: { label: string; weight: number }[] = [];
  const infos: string[] = [];

  const spike = acute > 0 && (ratio === null || ratio >= 1.5);
  if (spike && weeksWithLoad >= 3 && ratio !== null) {
    hints.push({ label: `Belastungsspitze (${label(ratio)}-fach des Schnitts der 3 Wochen davor)`, weight: ratio >= 2 ? 2 : 1 });
  } else if (spike) {
    infos.push('Wiedereinstieg – langsam steigern');
  }

  // Zwei sehr harte Einheiten (Anstrengung ≥ 7) innerhalb von 48 Stunden in den letzten 7 Tagen.
  const hard = past.filter((item) => item.ago <= 6 && item.exertion >= 7);
  if (hard.some((item, index) => index > 0 && item.ago - hard[index - 1].ago <= 2)) {
    hints.push({ label: 'Zwei sehr harte Einheiten innerhalb von 48 Stunden', weight: 1 });
  }

  // Wachstumsschub aus den letzten beiden Körpermessungen.
  const sorted = sortedMeasurements(measurements);
  if (sorted.length >= 2) {
    const [prev, last] = sorted.slice(-2);
    const months = daysBetween(localMidnight(prev.date), localMidnight(last.date)) / 30;
    const growth = months > 0 ? ((last.height ?? 0) - (prev.height ?? 0)) / months : 0;
    if (growth >= 1.2) hints.push({ label: `Starker Wachstumsschub (${label(growth)} cm/Monat)`, weight: 2 });
    else if (growth >= 0.6) hints.push({ label: `Wachstumsschub (${label(growth)} cm/Monat)`, weight: 1 });
  }

  // Rückkehr nach Verletzung: das Statusfeld („ca. verletzt bis“) und eine eingetragene Verletzung beschreiben oft dieselbe
  // Rückkehr; deshalb zählt nur die jüngste der beiden.
  const endedInjuries = absences.filter((item) => isInjuryAbsence(item) && item.to && item.to < todayStr).map((item) => item.to);
  if (player.injuryUntil) endedInjuries.push(player.injuryUntil);
  const lastInjuryEnd = endedInjuries.sort().at(-1);
  if (lastInjuryEnd) {
    const daysSinceReturn = daysBetween(localMidnight(lastInjuryEnd), today);
    if (daysSinceReturn >= 0 && daysSinceReturn <= 21) hints.push({ label: 'Rückkehr nach Verletzung', weight: 1 });
  }
  // Abwesenheiten ohne Verletzung (Urlaub, Klassenfahrt) wiegen beim Wiedereinstieg leichter: nur ein Hinweistext.
  const lastEndedAbsence = absences
    .filter((item) => !isInjuryAbsence(item) && item.to && item.to < todayStr)
    .sort((a, b) => localMidnight(b.to).getTime() - localMidnight(a.to).getTime())[0];
  if (lastEndedAbsence) {
    const daysSinceEnd = daysBetween(localMidnight(lastEndedAbsence.to), today);
    if (daysSinceEnd >= 0 && daysSinceEnd <= 14) infos.push('Kurz nach Abwesenheit (Wiedereinstieg)');
  }

  // Zwei Gewichtspunkte (oder ein starker Hinweis) ergeben „Anpassen“, ein Hinweis „Beobachten“.
  const score = hints.reduce((sum, hint) => sum + hint.weight, 0);
  const tier: RiskTier = score >= 2 ? 'anpassen' : score >= 1 ? 'beobachten' : 'unauffaellig';
  const reasons = [...hints.map((hint) => hint.label), ...infos];

  // Verfügbarkeit: getrennt von der Belastung. Eine heute laufende eingetragene Verletzung zählt wie der Status „Verletzt“.
  const injuredNow = player.status === 'Verletzt' || isInjuryAbsence(activeAbsenceOn(absences, todayStr));
  const availability = injuredNow ? AVAILABILITY.verletzt : player.status === 'Angeschlagen' ? AVAILABILITY.angeschlagen : AVAILABILITY.fit;

  return {
    tier,
    level: LOAD_TIERS[tier].level,
    action: LOAD_TIERS[tier].action,
    reasons,
    reason: reasons.join(' · ') || 'Keine auffälligen Belastungsfaktoren',
    load: roundGrade(acute),
    baseline: roundGrade(baseline),
    weeksWithLoad,
    recentEvents: past.filter((item) => item.ago <= 27).length,
    availability,
  };
}
