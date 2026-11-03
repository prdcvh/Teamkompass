/**
 * Belastung als abklingende Kurve (SCRUM-176). Kernzahl laut CLAUDE.md („wrong core numbers … workload“): reine
 * Funktionen ohne Angular/Firebase, Tests mit festen Beispielwerten in load-curve.spec.ts.
 *
 * Exponentiell gewichtetes Mittel (EWMA) der Tagesbelastung: `L_t = λ · x_t + (1 − λ) · L_(t−1)` mit `λ = 2 / (N + 1)`.
 * - `x_t` = Belastung des Tages (Summe Minuten × Anstrengung aller Termine des Tages), Tage ohne Termin zählen mit 0.
 * - Müdigkeit (akut): N = 7 Tage. Fitness (chronisch): N = 28 Tage (PO-Entscheidung 02.11.2026). Form = Fitness − Müdigkeit.
 * - Start mit 0 am Tag des ersten Termins (höchstens CURVE_HISTORY_DAYS zurück; ältere Termine wiegen bei N = 28 nach
 *   einem Jahr weniger als ein Millionstel und werden deshalb weggelassen).
 * - Anzeige „pro Woche“: Die Mittel sind Tageswerte; mal 7 genommen sind sie mit „Belastung letzte 7 Tage“ vergleichbar
 *   (wer jede Woche 900 hat, hat auf Dauer Fitness ≈ 900). Das Verhältnis Müdigkeit / Fitness ändert sich dadurch nicht.
 *
 * Quellen: Williams et al. 2017 (BJSM 51:209–210, EWMA für das Verhältnis akut/chronisch), Murray et al. 2017
 * (BJSM 51:749–754), TrainingPeaks Performance Management Chart (Müdigkeit/Fitness/Form).
 */
import { addDays } from '../shared/dates';

export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;
export const CURVE_HISTORY_DAYS = 365;

/** Glättungsfaktor λ = 2 / (N + 1): 0,25 für 7 Tage, 2/29 ≈ 0,069 für 28 Tage. */
export const ewmaLambda = (days: number): number => 2 / (days + 1);

export interface DatedLoad {
  /** ISO-Datum (JJJJ-MM-TT). */
  readonly date: string;
  readonly load: number;
}

export interface LoadCurvePoint {
  readonly date: string;
  /** Belastung dieses Tages (Summe der Termine). */
  readonly load: number;
  /** Akutes Mittel (7 Tage), pro Woche. */
  readonly fatigue: number;
  /** Chronisches Mittel (28 Tage), pro Woche. */
  readonly fitness: number;
  /** Fitness − Müdigkeit; negativ = gerade mehr als gewohnt belastet. */
  readonly form: number;
}

/** Exponentiell gewichtetes Mittel einer Reihe, Startwert `start` (Standard 0); ein Wert je Eingabewert. */
export function ewma(values: readonly number[], days: number, start = 0): number[] {
  const lambda = ewmaLambda(days);
  let level = start;
  return values.map((value) => (level = lambda * value + (1 - lambda) * level));
}

/**
 * Tagesbelastung vom ersten Termin bis `today` (je Kalendertag ein Wert, Tage ohne Termin = 0). Termine nach `today`
 * oder vor dem Rückblickfenster zählen nicht. Ohne Termin im Fenster: leere Liste.
 */
export function dailyLoads(sessions: readonly DatedLoad[], today: string, historyDays = CURVE_HISTORY_DAYS): DatedLoad[] {
  const earliest = addDays(today, -historyDays);
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    if (session.date > today || session.date < earliest || !(session.load > 0)) continue;
    byDay.set(session.date, (byDay.get(session.date) ?? 0) + session.load);
  }
  if (byDay.size === 0) return [];
  const days: DatedLoad[] = [];
  for (let day = [...byDay.keys()].sort()[0]; day <= today; day = addDays(day, 1)) days.push({ date: day, load: byDay.get(day) ?? 0 });
  return days;
}

/** Müdigkeit, Fitness und Form für jeden Tag vom ersten Termin bis `today` (älteste zuerst). */
export function loadCurve(sessions: readonly DatedLoad[], today: string, historyDays = CURVE_HISTORY_DAYS): LoadCurvePoint[] {
  const days = dailyLoads(sessions, today, historyDays);
  const loads = days.map((day) => day.load);
  const acute = ewma(loads, ACUTE_DAYS);
  const chronic = ewma(loads, CHRONIC_DAYS);
  return days.map((day, index) => {
    const fatigue = acute[index] * 7;
    const fitness = chronic[index] * 7;
    return { date: day.date, load: day.load, fatigue, fitness, form: fitness - fatigue };
  });
}

/** Verhältnis Müdigkeit / Fitness (akut / chronisch); ohne Fitness `null`. */
export function workloadRatio(point: Pick<LoadCurvePoint, 'fatigue' | 'fitness'> | undefined): number | null {
  return point && point.fitness > 0 ? point.fatigue / point.fitness : null;
}
