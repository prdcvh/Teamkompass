/**
 * Hinweise aus den Angaben der Spieler (SCRUM-138). Sie fließen NICHT in die Stufe der Belastungsampel ein (die
 * Ampel rechnet weiter Minuten × Anstrengung, nur eben mit dem Spielerwert), sondern stehen als eigener Hinweis
 * daneben.
 *
 * 1. Abweichung Spieler ↔ Trainer: Betrachtet werden die letzten 5 Termine, zu denen der Spieler seine Anstrengung
 *    angegeben hat (nur solche Termine sind vergleichbar). Liegt er in mindestens 3 davon um ≥ 2 Stufen über dem
 *    Trainerwert: „Empfindet das Training deutlich härter als geplant“; um ≥ 2 darunter: „… deutlich leichter …“.
 *    Hintergrund: Brink et al. 2014 (U17/U19) – Spieler empfinden Einheiten oft härter als geplant.
 * 2. Befinden: Summe der 4 Fragen (4–28, höher = besser) der jüngsten vollständigen Antwort (höchstens 7 Tage alt)
 *    gegen den eigenen Normalwert = Schnitt der vollständigen Antworten der 28 Tage davor (frühestens ab 6 Antworten).
 *    „Deutlich darunter“ = mindestens eine Standardabweichung UND mindestens 3 Punkte unter dem Schnitt.
 *    Begründung: Eine Standardabweichung unter dem eigenen Mittel ist die übliche Schwelle beim Befindens-Monitoring
 *    (individueller z-Wert ≤ −1). Die Untergrenze von 3 Punkten verhindert Fehlalarme bei Spielern, die fast immer
 *    gleich antworten (sehr kleine Standardabweichung): 3 Punkte heißt z. B. bei drei der vier Fragen eine Stufe schlechter.
 */
import type { TeamEvent } from '../events/event';
import { addDays } from '../shared/dates';
import { type SelfReport, type WellnessEntry, countsReport, wellnessSum } from './self-report';

export const DEVIATION_WINDOW = 5;
export const DEVIATION_MIN_COUNT = 3;
export const DEVIATION_STEPS = 2;
export const WELLNESS_BASELINE_DAYS = 28;
export const WELLNESS_MIN_ANSWERS = 6;
export const WELLNESS_MIN_DROP = 3;
/** So alt darf die jüngste Antwort höchstens sein, damit sie als „aktuell“ zählt. */
export const WELLNESS_CURRENT_DAYS = 7;

export const HARDER_HINT = 'Empfindet das Training deutlich härter als geplant';
export const LIGHTER_HINT = 'Empfindet das Training deutlich leichter als geplant';
export const WELLNESS_HINT = 'Befinden schlechter als üblich';

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

export function deviationHint(pairs: readonly ExertionPair[]): string | null {
  const recent = pairs.slice(0, DEVIATION_WINDOW);
  const harder = recent.filter((pair) => pair.player - pair.trainer >= DEVIATION_STEPS).length;
  const lighter = recent.filter((pair) => pair.trainer - pair.player >= DEVIATION_STEPS).length;
  if (harder >= DEVIATION_MIN_COUNT) return HARDER_HINT;
  if (lighter >= DEVIATION_MIN_COUNT) return LIGHTER_HINT;
  return null;
}

export interface WellnessStatus {
  /** Summe der jüngsten vollständigen Antwort (höchstens {@link WELLNESS_CURRENT_DAYS} Tage alt). */
  readonly current: number | null;
  /** Eigener Normalwert (Schnitt der 28 Tage davor) oder null bei weniger als 6 Antworten. */
  readonly baseline: number | null;
  readonly answers: number;
  readonly hint: string | null;
}

/** @param today ISO-Datum des Auswertungstags */
export function wellnessStatus(entries: readonly WellnessEntry[], today: string): WellnessStatus {
  const complete = entries
    .map((entry) => ({ date: entry.date, sum: wellnessSum(entry) }))
    .filter((entry): entry is { date: string; sum: number } => entry.sum !== null && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = complete[0];
  if (!latest || latest.date < addDays(today, -(WELLNESS_CURRENT_DAYS - 1))) return { current: null, baseline: null, answers: 0, hint: null };
  const from = addDays(latest.date, -WELLNESS_BASELINE_DAYS);
  const before = complete.slice(1).filter((entry) => entry.date >= from).map((entry) => entry.sum);
  if (before.length < WELLNESS_MIN_ANSWERS) return { current: latest.sum, baseline: null, answers: before.length, hint: null };
  const mean = before.reduce((sum, value) => sum + value, 0) / before.length;
  const sd = Math.sqrt(before.reduce((sum, value) => sum + (value - mean) ** 2, 0) / before.length);
  const drop = mean - latest.sum;
  const hint = drop >= Math.max(sd, WELLNESS_MIN_DROP) ? WELLNESS_HINT : null;
  return { current: latest.sum, baseline: Math.round(mean * 10) / 10, answers: before.length, hint };
}
