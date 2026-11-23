/**
 * Hinweise aus den Angaben der Spieler (SCRUM-138, SCRUM-177). Sie fließen NICHT in die Stufe der Belastungsampel ein
 * (die Ampel rechnet weiter Minuten × Anstrengung, nur eben mit dem Spielerwert), sondern stehen als eigener Hinweis
 * daneben.
 *
 * Risikowert mit Abklingzeit (SCRUM-177) statt Ja/Nein:
 *
 *     R_t = Σ w_i · s_i · e^(−(t − t_i) / τ_i)
 *
 * Jedes Signal i (ein schlechter Wert bei einer Befindensfrage an einem Tag, oder eine Termin-Anstrengung, die der
 * Spieler härter als der Trainer einstuft) zählt am Tag t_i voll (Stärke s_i von 0 bis 1 mal Gewicht w_i) und verliert
 * danach täglich an Gewicht (Abklingzeit τ_i in Tagen; Halbwertszeit = 0,69 · τ). Mehrere Signale addieren sich: ein
 * schlechter Tag fällt schnell wieder weg, mehrere schlechte Tage hintereinander ergeben zusammen einen hohen Wert.
 * Drei Stufen statt Prozent (wie bei der Belastungsampel): Unauffällig / Beobachten / Anpassen.
 *
 * Stärke s: Befindensfragen (1–7, 7 = bestes): 4 („normal“) und besser = 0, danach linear bis 1 bei Wert 1:
 * s = (4 − Wert) / 3. Anstrengung: Spieler minus Trainer, ab 2 Stufen darüber zählt es (wie bisher beim Hinweis
 * „deutlich härter“); s = (Differenz − 1) / 3, höchstens 1. Leichter als geplant ist kein Risiko und zählt nicht.
 *
 * Gewichte und Abklingzeiten sind ein VORSCHLAG (offene PO-Entscheidung in SCRUM-177) und stehen nur hier:
 * - Muskelkater: Gewicht 1,0 · τ 3 Tage. Verzögert auftretender Muskelkater (DOMS) ist nach etwa 3–5 Tagen weg und
 *   wirkt direkt auf Verletzungen; kurze Abklingzeit, volles Gewicht.
 * - Müdigkeit: Gewicht 1,0 · τ 4 Tage. Zentrale Größe im Hooper-Fragebogen und in der Praxis der beste Einzelanzeiger
 *   für Ermüdung; Erholung dauert meist mehrere Tage.
 * - Schlaf: Gewicht 0,8 · τ 2 Tage. Eine schlechte Nacht wirkt vor allem am Folgetag und lässt sich schnell
 *   ausgleichen; wiederholt schlechte Nächte addieren sich trotzdem.
 * - Stress: Gewicht 0,7 · τ 5 Tage. Hält erfahrungsgemäß länger an, hängt aber am wenigsten direkt mit der körperlichen
 *   Belastung zusammen und ist stark von der Tagesform der Spieler (Schule, Privates) abhängig.
 * - Abweichung Anstrengung: Gewicht 0,8 · τ 5 Tage. Wer Einheiten wiederholt härter empfindet als geplant (Brink et al.
 *   2014, U17/U19), ist ein Hinweis auf zu hohe Belastung; ein einzelner Termin zählt aber wenig.
 * Schwellen: ab 1,0 „Beobachten“ (z. B. ein einzelnes „sehr starker Muskelkater“ heute), ab 2,0 „Anpassen“ (z. B. mehrere
 * Signale oder mehrere schlechte Tage in Folge). Die Werte sind eine fachlich begründete Schätzung, keine Messung; es
 * ist keine Verletzungswahrscheinlichkeit (Impellizzeri et al. 2020).
 *
 * Außerdem: Das Befinden einer Woche als Anzeige (Summe der 4 Fragen, 4–28) mit dem eigenen Normalwert
 * (Schnitt der Antworten der 28 Tage davor, frühestens ab 6 Antworten) – nur zur Info, ohne eigenen Hinweis.
 */
import type { TeamEvent } from '../events/event';
import { addDays } from '../shared/dates';
import { type SelfReport, WELLNESS_FIELDS, type WellnessEntry, type WellnessField, countsReport, hasWellnessAnswer, wellnessSum } from './self-report';

export const WELLNESS_BASELINE_DAYS = 28;
export const WELLNESS_MIN_ANSWERS = 6;
/** So alt darf die jüngste Antwort höchstens sein, damit sie als „aktuell“ zählt. */
export const WELLNESS_CURRENT_DAYS = 7;


/** Ein Termin mit Trainer- und Spielerwert (für Anzeige und Abweichung). */
export interface ExertionPair {
  readonly event: TeamEvent;
  readonly trainer: number;
  readonly player: number;
}

/** Termine mit gültigem Spielerwert, neueste zuerst. `events` enthält die Trainerwerte (Eventliste, unverändert). */
export function exertionPairs(events: readonly TeamEvent[], reports: ReadonlyMap<string, SelfReport>): ExertionPair[] {
  return events
    .flatMap((event) => {
      const report = reports.get(event.id);
      return countsReport(event, report) ? [{ event, trainer: event.exertion, player: report.exertion }] : [];
    })
    .sort((a, b) => b.event.date.localeCompare(a.event.date) || (b.event.startTime ?? '').localeCompare(a.event.startTime ?? ''));
}

export const LIGHTER_WINDOW = 5;
export const LIGHTER_MIN_COUNT = 3;
export const LIGHTER_STEPS = 2;
export const LIGHTER_HINT = 'Empfindet das Training deutlich leichter als geplant';

/**
 * Info (kein Risiko, darum nicht im Risikowert): in mindestens 3 der letzten 5 Termine mit Spielerangabe liegt der
 * Spielerwert um ≥ 2 Stufen unter dem Trainerwert. `pairs` neueste zuerst (wie {@link exertionPairs}).
 */
export function lighterHint(pairs: readonly ExertionPair[]): string | null {
  const lighter = pairs.slice(0, LIGHTER_WINDOW).filter((pair) => pair.trainer - pair.player >= LIGHTER_STEPS).length;
  return lighter >= LIGHTER_MIN_COUNT ? LIGHTER_HINT : null;
}

/** Gewicht w und Abklingzeit τ (Tage) je Faktor; Begründung im Kopf der Datei. */
export const RISK_FACTORS = {
  soreness: { label: 'Muskelkater', weight: 1.0, tau: 3 },
  fatigue: { label: 'Müdigkeit', weight: 1.0, tau: 4 },
  sleep: { label: 'Schlaf', weight: 0.8, tau: 2 },
  stress: { label: 'Stress', weight: 0.7, tau: 5 },
  deviation: { label: 'Anstrengung härter als geplant', weight: 0.8, tau: 5 },
} as const satisfies Record<WellnessField | 'deviation', { label: string; weight: number; tau: number }>;
export type RiskFactor = keyof typeof RISK_FACTORS;

/** Ab diesem Wert „Beobachten“, ab {@link WELLNESS_RISK_ADJUST} „Anpassen“. */
export const WELLNESS_RISK_WATCH = 1.0;
export const WELLNESS_RISK_ADJUST = 2.0;
/** Ältere Signale tragen (bei τ ≤ 5) weniger als 1 % bei und werden nicht mehr gerechnet. */
export const RISK_MAX_AGE_DAYS = 21;
/** Ab so vielen Stufen Spieler über Trainer zählt die Abweichung. */
export const DEVIATION_FROM = 2;

export type WellnessTier = 'unauffaellig' | 'beobachten' | 'anpassen';
export const WELLNESS_TIERS: Readonly<Record<WellnessTier, string>> = {
  unauffaellig: 'Unauffällig',
  beobachten: 'Beobachten',
  anpassen: 'Anpassen',
};

/** Worauf der Risikowert beruht: Befindensantworten, vergleichbare Termine (Spieler und Trainer) oder beides; sonst keine Daten. */
export type RiskBasis = 'none' | 'exertion' | 'wellness' | 'both';

export interface WellnessRisk {
  /** Gibt es im Auswertungsfenster überhaupt Angaben? Ohne sagt die Stufe nichts (kein „Unauffällig“ als Entwarnung). */
  readonly hasData: boolean;
  readonly basis: RiskBasis;
  /** Summe R_t aller Signale (zwei Nachkommastellen gerundet). */
  readonly score: number;
  readonly tier: WellnessTier;
  readonly level: string;
  /** Beitrag je Faktor, größter zuerst (nur Faktoren mit Beitrag ≥ 0,05). */
  readonly contributions: readonly { readonly factor: RiskFactor; readonly label: string; readonly value: number }[];
}

export function wellnessTier(score: number): WellnessTier {
  return score >= WELLNESS_RISK_ADJUST ? 'anpassen' : score >= WELLNESS_RISK_WATCH ? 'beobachten' : 'unauffaellig';
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Beitrag eines Signals am Tag `date` zum Auswertungstag `today`: w · s · e^(−Alter/τ); 0 bei Zukunft oder zu alt. */
export function decayedContribution(factor: RiskFactor, strength: number, date: string, today: string): number {
  const age = dayNumber(today) - dayNumber(date);
  if (!Number.isFinite(age) || age < 0 || age > RISK_MAX_AGE_DAYS || strength <= 0) return 0;
  const { weight, tau } = RISK_FACTORS[factor];
  return weight * Math.min(strength, 1) * Math.exp(-age / tau);
}

/** Stärke einer Befindensantwort: 4 und besser = 0, 1 = 1. */
export const wellnessStrength = (value: number): number => Math.max(0, (4 - value) / 3);
/** Stärke einer Abweichung (Spieler minus Trainer): unter 2 Stufen = 0, ab 4 Stufen = 1. */
export const deviationStrength = (difference: number): number => (difference >= DEVIATION_FROM ? Math.min(1, (difference - 1) / 3) : 0);

/**
 * Risikowert R_t am Tag `today` aus den Befindensantworten und den Terminen mit Spieler- und Trainerwert.
 * @param today ISO-Datum des Auswertungstags
 */
export function wellnessRisk(entries: readonly WellnessEntry[], pairs: readonly ExertionPair[], today: string): WellnessRisk {
  const sums: Record<RiskFactor, number> = { soreness: 0, fatigue: 0, sleep: 0, stress: 0, deviation: 0 };
  for (const entry of entries) {
    for (const field of WELLNESS_FIELDS) {
      const value = entry[field];
      if (value !== null) sums[field] += decayedContribution(field, wellnessStrength(value), entry.date, today);
    }
  }
  for (const pair of pairs) sums.deviation += decayedContribution('deviation', deviationStrength(pair.player - pair.trainer), pair.event.date, today);
  const inWindow = (date: string) => {
    const age = dayNumber(today) - dayNumber(date);
    return age >= 0 && age <= RISK_MAX_AGE_DAYS;
  };
  const hasWellness = entries.some((entry) => hasWellnessAnswer(entry) && inWindow(entry.date));
  const hasExertion = pairs.some((pair) => inWindow(pair.event.date));
  const basis: RiskBasis = hasWellness ? (hasExertion ? 'both' : 'wellness') : hasExertion ? 'exertion' : 'none';
  const score = Math.round(Object.values(sums).reduce((sum, value) => sum + value, 0) * 100) / 100;
  const tier = wellnessTier(score);
  const contributions = (Object.keys(sums) as RiskFactor[])
    .map((factor) => ({ factor, label: RISK_FACTORS[factor].label, value: Math.round(sums[factor] * 100) / 100 }))
    .filter((item) => item.value >= 0.05)
    .sort((a, b) => b.value - a.value);
  return { hasData: basis !== 'none', basis, score, tier, level: WELLNESS_TIERS[tier], contributions };
}

export interface WellnessStatus {
  /** Summe der jüngsten vollständigen Antwort (höchstens {@link WELLNESS_CURRENT_DAYS} Tage alt). */
  readonly current: number | null;
  /** Eigener Normalwert (Schnitt der 28 Tage davor) oder null bei weniger als 6 Antworten. */
  readonly baseline: number | null;
  readonly answers: number;
}

/** @param today ISO-Datum des Auswertungstags */
export function wellnessStatus(entries: readonly WellnessEntry[], today: string): WellnessStatus {
  const complete = entries
    .map((entry) => ({ date: entry.date, sum: wellnessSum(entry) }))
    .filter((entry): entry is { date: string; sum: number } => entry.sum !== null && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = complete[0];
  if (!latest || latest.date < addDays(today, -(WELLNESS_CURRENT_DAYS - 1))) return { current: null, baseline: null, answers: 0 };
  const from = addDays(latest.date, -WELLNESS_BASELINE_DAYS);
  const before = complete.slice(1).filter((entry) => entry.date >= from).map((entry) => entry.sum);
  if (before.length < WELLNESS_MIN_ANSWERS) return { current: latest.sum, baseline: null, answers: before.length };
  const mean = before.reduce((sum, value) => sum + value, 0) / before.length;
  return { current: latest.sum, baseline: Math.round(mean * 10) / 10, answers: before.length };
}
