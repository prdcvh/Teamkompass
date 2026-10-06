/**
 * Belastungsindikator (Verletzungsrisiko-Score) eines Spielers. Rechnet exakt wie die bisherige App
 * (outputs/team-manager/app.js: playerInjuryRisk) und ist eine Kernzahl (CLAUDE.md „wrong core numbers“).
 *
 * Der Score kombiniert mehrere belegte Risikofaktoren statt nur die reine Belastungsmenge zu zählen. Größter
 * Einzelhebel ist die Akute:Chronische Belastungsrelation (ACWR, Gabbett 2016): eine plötzliche Belastungsspitze ist
 * der am besten belegte Prädiktor für Nicht-Kontakt-Verletzungen. Dazu kommen der aktuelle Gesundheitsstatus, das
 * Rückfallfenster nach Rückkehr aus Verletzung/Abwesenheit sowie – weil es eine Jugendmannschaft ist – der
 * Wachstumsschub aus den Körpermessungen (Apophysen-Reizungen wie Morbus Osgood-Schlatter).
 */
import { type Player } from './player';
import { type EventRating } from './profile';
import { type Absence, type Measurement, activeAbsenceOn, isInjuryAbsence, sortedMeasurements } from './records';
import { roundGrade } from './rating';

export type RiskTier = 'aussetzen' | 'reduzieren' | 'anpassen' | 'beobachten' | 'unauffaellig';

/** Sortiert von der höchsten zur niedrigsten Schwelle, damit `find` die höchste erreichte Stufe liefert. */
export const INJURY_RISK_TIERS: readonly { min: number; tier: RiskTier; level: string; action: string }[] = [
  { min: 75, tier: 'aussetzen', level: 'Nicht einsetzen', action: 'Vom Training/Spiel absehen, ärztliche/physiotherapeutische Abklärung empfohlen.' },
  { min: 55, tier: 'reduzieren', level: 'Deutlich reduzieren', action: 'Belastung spürbar zurücknehmen, Rücksprache mit Physio/Arzt erwägen.' },
  { min: 35, tier: 'anpassen', level: 'Belastung anpassen', action: 'Umfang/Intensität dosieren und auf ausreichend Erholung achten.' },
  { min: 15, tier: 'beobachten', level: 'Beobachten', action: 'Aktuell keine Anpassung nötig, Entwicklung im Blick behalten.' },
  { min: 0, tier: 'unauffaellig', level: 'Unauffällig', action: 'Belastung unauffällig; Verfügbarkeit individuell prüfen.' },
];

export interface InjuryRisk {
  readonly percentage: number;
  readonly level: string;
  readonly tier: RiskTier;
  readonly action: string;
  /** Akute Belastung der letzten 7 Tage. */
  readonly load: number;
  /** Einsätze der letzten 4 Wochen. */
  readonly recentEvents: number;
  readonly reason: string;
}

const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`);
const daysBetween = (earlier: Date, later: Date) => (later.getTime() - earlier.getTime()) / 86400000;

function isoOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * @param items alle Events mit der Bewertung dieses Spielers, neueste zuerst
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
  const factors: { label: string; points: number }[] = [];

  const attended = items
    .filter(({ rating }) => rating?.attendance === 'present' || rating?.attendance === 'limited')
    .map(({ event, rating }) => {
      const matchDuration = event.type === 'Spiel' ? (event.matchDuration ?? 90) : null;
      const exposure =
        matchDuration && rating!.minutes !== null
          ? Math.max(0.15, Math.min(1, rating!.minutes / matchDuration))
          : rating!.attendance === 'limited' ? 0.6 : 1;
      return { date: localMidnight(event.date), sessionLoad: (event.intensity || 2) * exposure };
    });

  // Akute (7 Tage) vs. chronische (28 Tage / 4 Wochen) Belastung – ACWR-Sweetspot ca. 0,8–1,3, alles darüber ist
  // eine Belastungsspitze mit deutlich erhöhtem Verletzungsrisiko.
  const acuteLoad = attended.filter((item) => daysBetween(item.date, today) <= 7).reduce((sum, item) => sum + item.sessionLoad, 0);
  const chronicLoad = attended.filter((item) => daysBetween(item.date, today) <= 28).reduce((sum, item) => sum + item.sessionLoad, 0);
  const chronicWeeklyAvg = chronicLoad / 4;
  const acwr = chronicWeeklyAvg > 0 ? acuteLoad / chronicWeeklyAvg : acuteLoad > 0 ? 2 : 0;
  if (acwr > 1.3) factors.push({ label: `Akute Belastungsspitze (ACWR ${String(roundGrade(acwr)).replace('.', ',')})`, points: Math.min(45, (acwr - 1.3) * 60) });
  else if (acwr < 0.8 && chronicWeeklyAvg > 0) factors.push({ label: 'Deutlich reduzierte Belastung', points: Math.min(10, (0.8 - acwr) * 20) });

  // Zwei Einsätze ohne mindestens einen Tag Pause dazwischen erhöhen das Risiko zusätzlich (kumulative Ermüdung).
  const [latest, previous] = attended;
  if (latest && previous) {
    const gapDays = daysBetween(previous.date, latest.date);
    if (gapDays <= 1) factors.push({ label: 'Keine Erholung seit letztem Einsatz', points: 12 });
    else if (gapDays <= 2) factors.push({ label: 'Kurze Erholungszeit', points: 6 });
  }

  // Nachlassende Einsatz-Note als Ermüdungssignal über die jüngsten bewerteten Events.
  const effortRatings = items
    .map(({ rating }) => rating)
    .filter((rating) => rating && (rating.attendance === 'present' || rating.attendance === 'limited') && rating.effort !== null)
    .slice(0, 6)
    .map((rating) => rating!.effort as number);
  if (effortRatings.length >= 3) {
    const recentAvg = effortRatings.slice(0, 2).reduce((sum, value) => sum + value, 0) / 2;
    const earlier = effortRatings.slice(2);
    const earlierAvg = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
    const decline = recentAvg - earlierAvg;
    if (decline > 0.5) factors.push({ label: 'Nachlassender Einsatz in Folge', points: Math.min(15, decline * 15) });
  }

  // Wachstumsschub: schnelles Längenwachstum aus den quartalsweisen Körpermessungen.
  const sorted = sortedMeasurements(measurements);
  if (sorted.length >= 2) {
    const [prev, last] = sorted.slice(-2);
    const months = daysBetween(localMidnight(prev.date), localMidnight(last.date)) / 30;
    const growthPerMonth = months > 0 ? ((last.height ?? 0) - (prev.height ?? 0)) / months : 0;
    const label = String(roundGrade(growthPerMonth)).replace('.', ',');
    if (growthPerMonth >= 2) factors.push({ label: `Starker Wachstumsschub (${label} cm/Monat)`, points: 18 });
    else if (growthPerMonth >= 1) factors.push({ label: `Wachstumsschub (${label} cm/Monat)`, points: 10 });
  }

  // Rückkehr nach Verletzung/längerer Abwesenheit: das Rückfallrisiko ist in den ersten Wochen danach am höchsten.
  // Das Statusfeld („ca. verletzt bis“) und eine eingetragene Verletzung beschreiben oft dieselbe Rückkehr; deshalb
  // zählt nur die jüngste der beiden, sonst würde derselbe Faktor doppelt vergeben.
  const endedInjuries = absences.filter((item) => isInjuryAbsence(item) && item.to && item.to < todayStr).map((item) => item.to);
  if (player.injuryUntil) endedInjuries.push(player.injuryUntil);
  const lastInjuryEnd = endedInjuries.sort().at(-1);
  if (lastInjuryEnd) {
    const daysSinceReturn = daysBetween(localMidnight(lastInjuryEnd), today);
    if (daysSinceReturn >= 0 && daysSinceReturn <= 21) factors.push({ label: 'Rückkehr nach Verletzung', points: Math.round(22 * (1 - daysSinceReturn / 21)) });
  }
  // Abwesenheiten ohne Verletzung (Urlaub, Klassenfahrt) wiegen beim Wiedereinstieg deutlich leichter und werden
  // getrennt und nur einmal gewertet.
  const lastEndedAbsence = absences
    .filter((item) => !isInjuryAbsence(item) && item.to && item.to < todayStr)
    .sort((a, b) => localMidnight(b.to).getTime() - localMidnight(a.to).getTime())[0];
  if (lastEndedAbsence) {
    const daysSinceEnd = daysBetween(localMidnight(lastEndedAbsence.to), today);
    if (daysSinceEnd <= 14) factors.push({ label: 'Kurz nach Abwesenheit (Wiedereinstieg)', points: Math.round(12 * (1 - daysSinceEnd / 14)) });
  }

  // Aktueller Gesundheitsstatus: eine bestehende Verletzung/Beschwerde ist der mit Abstand stärkste Einzelfaktor. Eine
  // heute laufende eingetragene Verletzung zählt genauso wie der manuell gesetzte Status „Verletzt“.
  const activeAbsence = activeAbsenceOn(absences, todayStr);
  if (player.status === 'Verletzt' || isInjuryAbsence(activeAbsence)) factors.push({ label: 'Aktuell verletzt', points: 75 });
  if (player.status === 'Angeschlagen') factors.push({ label: 'Angeschlagen', points: 45 });

  const percentage = Math.max(0, Math.min(100, Math.round(factors.reduce((sum, factor) => sum + factor.points, 0))));
  const tier = INJURY_RISK_TIERS.find((entry) => percentage >= entry.min)!;
  const topFactors = [...factors].sort((a, b) => b.points - a.points).slice(0, 2).map((factor) => factor.label);
  return {
    percentage,
    level: tier.level,
    tier: tier.tier,
    action: tier.action,
    load: roundGrade(acuteLoad),
    recentEvents: attended.filter((item) => daysBetween(item.date, today) <= 28).length,
    reason: topFactors.join(' · ') || 'Keine auffälligen Belastungsfaktoren',
  };
}
