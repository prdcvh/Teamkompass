/**
 * Belastungsampel eines Spielers (SCRUM-137). Rechnet wie die bisherige App (Alt-App app.js:
 * `assessLoad`) und ist eine Kernzahl (CLAUDE.md „wrong core numbers“).
 *
 * - Belastung pro Termin = Minuten × Anstrengung (0–10). Minuten: bei Spielen die gespielten Minuten, sonst die Dauer
 *   des Termins (Training: Standard 90); „eingeschränkt“ ohne eingetragene Minuten zählt 60 % der Dauer.
 * - Nur vergangene Termine zählen (SCRUM-136).
 * - Belastungsspitze (SCRUM-176): abklingende Mittel statt fester Wochenfenster (load-curve.ts). Verglichen wird die
 *   Müdigkeit (Mittel über 7 Tage) mit der Fitness (Mittel über 28 Tage): ab dem 1,5-fachen ein Hinweis, ab dem 2-fachen
 *   ein starker Hinweis. Schwellen nach Gabbett 2016 (BJSM 50:273–280: Bereich 0,8–1,3 unauffällig, ab 1,5 kritisch) und
 *   Murray et al. 2017 (BJSM 51:749–754: Verhältnis über 2,0 mit deutlich erhöhtem Risiko, EWMA empfindlicher).
 *   Zwei Schutzregeln gegen Fehlalarme:
 *   1. Wiedereinstieg (Regel aus SCRUM-137): die Spitzenwarnung gibt es nur, wenn in mindestens 3 der 4 Wochen Belastung
 *      vorhanden ist; sonst nur der Hinweis „Wiedereinstieg – langsam steigern“. So steht nach einer Pause nicht der
 *      ganze Kader auf „Anpassen“.
 *   2. Die letzten 7 Tage müssen mindestens 15 % über einer üblichen Trainingswoche liegen (Schnitt der Wochen davor,
 *      Tage 8–28, in denen trainiert wurde); sonst bei Lücken in den 4 Wochen ebenfalls „Wiedereinstieg“. Das abklingende
 *      Mittel über 7 Tage springt direkt nach jeder Einheit hoch (bei zwei Einheiten an zwei Tagen hintereinander auch im
 *      ganz normalen Wochenrhythmus auf ≈ 1,5) und braucht nach einer Pause mehr als 4 Wochen, bis die Fitness wieder
 *      aufgebaut ist; ohne diese Regel gäbe es dort Hinweise ohne echte Steigerung. 15 %: Gabbett 2016 nennt
 *      Wochensteigerungen ab etwa 15 % als kritisch.
 *   Die Ampel ist keine Verletzungswahrscheinlichkeit (Impellizzeri et al. 2020, Zouhal et al. 2021).
 * - Erholung: zwei Einheiten mit Anstrengung ≥ 7 innerhalb von 48 Stunden.
 * - Wachstumsschub: ab 0,6 cm pro Monat ein Hinweis, ab 1,2 cm pro Monat ein starker Hinweis (Kemper et al. 2015). Die Rate
 *   kommt nur aus Messpaaren mit 90 bis 365 Tagen Abstand (Methodenversion 1.0 §6, SCRUM-305), nie aus Messungen kurz
 *   hintereinander.
 * - Rückkehr nach Verletzung/Abwesenheit wie bisher.
 * - Keine Prozentzahl: drei Stufen (Unauffällig / Beobachten / Anpassen) mit den Gründen als Text. Verletzt/Angeschlagen ist
 *   die getrennte „Verfügbarkeit“ und fließt nicht in die Stufe ein.
 */
import { DEFAULT_TRAINING_DURATION, type TeamEvent, plannedMinutes } from '../events/event';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { type Absence, activeAbsenceOn, isInjuryAbsence } from '../records/absence';
import { type Measurement } from '../records/measurement';
import { FRESH_DAYS, MAX_HINT_INTERVAL_DAYS, analyzeGrowth, growthHintLevel, perMonth } from '../records/growth-velocity';
import { type Rating, roundGrade } from '../ratings/rating';
import { type LoadCurvePoint, loadCurve, workloadRatio } from './load-curve';

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
  /** Müdigkeit (abklingendes Mittel über 7 Tage), pro Woche (SCRUM-176). */
  readonly fatigue: number;
  /** Fitness (abklingendes Mittel über 28 Tage), pro Woche. */
  readonly fitness: number;
  /** Form = Fitness − Müdigkeit. */
  readonly form: number;
  /** Müdigkeit / Fitness (eine Nachkommastelle); ohne Belastung `null`. */
  readonly ratio: number | null;
  /** In wie vielen der 4 Wochen Belastung vorhanden war. */
  readonly weeksWithLoad: number;
  /** Hinweis „Belastungsspitze“ gesetzt (mit beiden Schutzregeln); für die Wenn-dann-Regeln (SCRUM-195). */
  readonly spike: boolean;
  /** Einsätze der letzten 4 Wochen. */
  readonly recentEvents: number;
  readonly availability: LoadAvailability;
}

/**
 * Wie weit die Übersichten zurückschauen: Spielerangaben der letzten 90 Tage, beendete Verletzungen bis 21 Tage zurück,
 * Messwerte siehe {@link GROWTH_MEASUREMENT_WINDOW_DAYS}. Die Übersichten laden Abwesenheiten/Messwerte nur in diesem
 * Fenster (SCRUM-200) – wer die Werte ändert, ändert damit auch die Abfragen.
 */
export const MEASUREMENT_WINDOW_DAYS = 90;
export const ABSENCE_LOOKBACK_DAYS = 21;
/**
 * So weit zurück braucht der Wachstumshinweis Messwerte (SCRUM-305): jüngste Messung bis 90 Tage alt, Vergleichsmessung
 * bis 365 Tage davor. Die Übersichten laden Messwerte in diesem Fenster.
 */
export const GROWTH_MEASUREMENT_WINDOW_DAYS = FRESH_DAYS + MAX_HINT_INTERVAL_DAYS;

const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);
const daysBetween = (earlier: Date, later: Date) => (later.getTime() - earlier.getTime()) / 86400000;

function isoOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const label = (value: number) => roundGrade(value).toFixed(1).replace('.', ',');

/** Wachstumsschub-Hinweis zum Tag `today` (ISO) oder null; Regel siehe {@link analyzeGrowth}. */
export function growthHint(measurements: readonly Measurement[], today: string): { label: string; weight: number } | null {
  const rate = analyzeGrowth(measurements.filter((item) => item.date <= today), today).currentRate;
  if (rate === null) return null;
  const monthly = perMonth(rate);
  const level = growthHintLevel(monthly);
  if (level === 'strong') return { label: `Starker Wachstumsschub (${label(monthly)} cm/Monat)`, weight: 2 };
  if (level === 'hint') return { label: `Wachstumsschub (${label(monthly)} cm/Monat)`, weight: 1 };
  return null;
}

/** Ab diesem Verhältnis Müdigkeit / Fitness ein Hinweis bzw. ein starker Hinweis (siehe Kopfkommentar). */
export const SPIKE_RATIO = 1.5;
export const STRONG_SPIKE_RATIO = 2;
/** So viel mehr als eine übliche Trainingswoche (Tage 8–28) müssen die letzten 7 Tage sein, damit eine Spitze zählt. */
export const SPIKE_MIN_WEEK_INCREASE = 1.15;
/** Text des Hinweises „zwei sehr harte Einheiten“; die Wenn-dann-Regel „Wachstum und Belastung“ (SCRUM-257) erkennt ihn daran. */
export const HARD_SESSIONS_REASON = 'Zwei sehr harte Einheiten innerhalb von 48 Stunden';

const tookPart = (rating: Rating | null | undefined) => rating?.attendance === 'present' || rating?.attendance === 'limited';

/** Müdigkeit, Fitness und Form eines Spielers für jeden Tag bis `today` (nur vergangene Termine mit Teilnahme). */
export function playerLoadCurve(items: readonly EventRating[], today: string): LoadCurvePoint[] {
  return loadCurve(
    items.filter(({ rating }) => tookPart(rating)).map(({ event, rating }) => ({ date: event.date, load: sessionLoad(event, rating!) })),
    today,
  );
}

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
    .filter(({ rating }) => tookPart(rating))
    .map(({ event, rating }) => ({ ago: Math.round(daysBetween(localMidnight(event.date), today)), load: sessionLoad(event, rating!), exertion: event.exertion }))
    .filter((item) => item.ago >= 0)
    .sort((a, b) => a.ago - b.ago);

  // Woche 0 = letzte 7 Tage (heute und 6 Tage davor), Woche 1–3 = die 3 Wochen davor.
  const weekLoads = [0, 1, 2, 3].map((week) => past.filter((item) => item.ago >= week * 7 && item.ago <= week * 7 + 6).reduce((sum, item) => sum + item.load, 0));
  const acute = weekLoads[0];
  const baseline = (weekLoads[1] + weekLoads[2] + weekLoads[3]) / 3;
  const weeksWithLoad = weekLoads.filter((value) => value > 0).length;
  // Übliche Trainingswoche: Schnitt der Wochen 1–3, in denen trainiert wurde (eine Pausenwoche zieht ihn nicht herunter).
  const usedWeeks = weekLoads.slice(1).filter((value) => value > 0);
  const usual = usedWeeks.length ? usedWeeks.reduce((sum, value) => sum + value, 0) / usedWeeks.length : 0;
  const current = playerLoadCurve(items, todayStr).at(-1);
  const ratio = acute > 0 ? workloadRatio(current) : null;
  const hints: { label: string; weight: number }[] = [];
  const infos: string[] = [];

  const spike = ratio !== null && ratio >= SPIKE_RATIO;
  const spikeHint = spike && weeksWithLoad >= 3 && acute >= usual * SPIKE_MIN_WEEK_INCREASE;
  if (spikeHint) {
    hints.push({ label: `Belastungsspitze (Müdigkeit ${label(ratio)}-fach der Fitness)`, weight: ratio >= STRONG_SPIKE_RATIO ? 2 : 1 });
  } else if (spike && weeksWithLoad < 4) {
    infos.push('Wiedereinstieg – langsam steigern');
  }

  // Zwei sehr harte Einheiten (Anstrengung ≥ 7) innerhalb von 48 Stunden in den letzten 7 Tagen.
  const hard = past.filter((item) => item.ago <= 6 && item.exertion >= 7);
  if (hard.some((item, index) => index > 0 && item.ago - hard[index - 1].ago <= 2)) {
    hints.push({ label: HARD_SESSIONS_REASON, weight: 1 });
  }

  // Wachstumsschub (SCRUM-305, Methodenversion 1.0 §6): jüngste gültige Größenmessung höchstens 90 Tage alt, verglichen mit
  // der jüngsten älteren Messung mit 90 bis 365 Tagen Abstand – dieselbe Regel wie Profil und Belastungsbericht. Messungen
  // kurz hintereinander ergeben keine Rate (sonst würde Messrauschen zu „cm/Monat“ hochgerechnet). Eine Messung nur mit
  // Gewicht zählt nicht (SCRUM-302); Messungen nach dem Stichtag zählen nicht.
  const growth = growthHint(measurements, todayStr);
  if (growth) hints.push(growth);

  // Rückkehr nach Verletzung: das Statusfeld („ca. verletzt bis“) und eine eingetragene Verletzung beschreiben oft dieselbe
  // Rückkehr; deshalb zählt nur die jüngste der beiden.
  const endedInjuries = absences.filter((item) => isInjuryAbsence(item) && item.to && item.to < todayStr).map((item) => item.to);
  if (player.injuryUntil) endedInjuries.push(player.injuryUntil);
  const lastInjuryEnd = endedInjuries.sort().at(-1);
  if (lastInjuryEnd) {
    const daysSinceReturn = daysBetween(localMidnight(lastInjuryEnd), today);
    if (daysSinceReturn >= 0 && daysSinceReturn <= ABSENCE_LOOKBACK_DAYS) hints.push({ label: 'Rückkehr nach Verletzung', weight: 1 });
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
    fatigue: Math.round(current?.fatigue ?? 0),
    fitness: Math.round(current?.fitness ?? 0),
    form: Math.round(current?.form ?? 0) || 0,
    ratio: ratio === null ? null : roundGrade(ratio),
    weeksWithLoad,
    spike: spikeHint,
    recentEvents: past.filter((item) => item.ago <= 27).length,
    availability,
  };
}
