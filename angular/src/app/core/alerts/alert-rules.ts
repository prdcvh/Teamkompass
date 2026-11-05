/**
 * Wenn-dann-Regeln (SCRUM-195): feste Vorlagen, die der Trainer ein- und ausschaltet. Sie nehmen das Beobachten ab:
 * Schlägt eine Regel an, erscheint ein Hinweis in der App (Trainer auf der Startseite, Medizin in ihrer Ansicht).
 *
 * Alles hier sind reine Funktionen ohne Angular/Firebase. Die Regeln rechnen nur aus Daten, die es schon gibt:
 * Befinden nach den Terminen (SCRUM-138), Belastungsampel (SCRUM-137/176), Einwilligung (SCRUM-245) und Bewertungen.
 *
 * Protokoll „welche Regel wann ausgelöst hat“: Es wird nicht gespeichert, sondern für jeden der letzten
 * {@link ALERT_LOG_DAYS} Tage mit den Daten bis zu diesem Tag neu berechnet. Ein Eintrag entsteht an dem Tag, an dem
 * eine Regel für einen Spieler (bzw. einen Termin) neu anschlägt; solange sie weiter anschlägt, bleibt es derselbe
 * Eintrag. So braucht es keine neue Sammlung in der Datenbank (und keine Regeländerung). Folge: Werden Daten später
 * geändert (z. B. eine Bewertung nachgetragen), passt sich auch das Protokoll an.
 *
 * Schwellen (Vorschlag, im Ticket erklärt):
 * - Schmerz wiederholt: Die App fragt keinen eigenen Schmerzwert ab; der nächste Wert ist die Frage „Muskelkater“
 *   (1–7, 7 = keiner). „Schmerz ab 6 von 10“ entspricht dort „deutlich“ oder stärker (Wert 3 oder kleiner). Regel:
 *   mindestens 2 solche Antworten innerhalb von 14 Tagen.
 * - Befinden schlechter als üblich: jüngste vollständige Antwort (Summe der 4 Fragen, 4–28) mindestens 3 Punkte unter
 *   dem eigenen Normalwert (Schnitt der 28 Tage davor, frühestens ab 6 Antworten; wie die Anzeige im Profil).
 * - Belastungsspitze: genau der Hinweis „Belastungsspitze“ der Belastungsampel (Müdigkeit ab dem 1,5-fachen der
 *   Fitness, mit beiden Schutzregeln gegen Fehlalarme).
 * - Einwilligung widerrufen: solange die Einwilligung widerrufen ist und noch Gesundheitsdaten gespeichert sind (die
 *   Aufgabe „Gesundheitsdaten prüfen und löschen“ also noch offen ist).
 * - Offene Bewertungen: ein vergangener Termin der letzten 7 Tage, bei dem noch Spieler ohne Bewertung sind; ab dem Tag
 *   nach dem Termin.
 *
 * E-Mail (später über den Erinnerungsdienst, SCRUM-101): {@link ALERT_EMAIL_TEXT} ist der einzige Text, den eine E-Mail
 * je enthalten darf – ohne Namen, Regel oder Werte, nur „bitte in die App schauen“.
 */
import type { TeamEvent } from '../events/event';
import { type InjuryRisk, injuryRisk } from '../analysis/risk';
import type { Player } from '../player/player';
import { type EventRating } from '../profile/profile';
import { isRated } from '../ratings/rating';
import type { Absence } from '../records/absence';
import type { Measurement } from '../records/measurement';
import { hasWellnessAnswer, type WellnessEntry } from '../self-report/self-report';
import { wellnessStatus } from '../self-report/self-report-hints';
import { addDays } from '../shared/dates';

export const ALERT_RULE_IDS = ['pain', 'wellness', 'loadSpike', 'consentRevoked', 'openRatings'] as const;
export type AlertRuleId = (typeof ALERT_RULE_IDS)[number];

/** Wer den Hinweis sieht. Scouts, Spieler und Eltern nie. */
export type AlertAudience = 'trainer' | 'physio';

export interface AlertRule {
  readonly id: AlertRuleId;
  readonly title: string;
  /** „Wenn …“ in Alltagssprache, mit der Schwelle. */
  readonly when: string;
  /** Beruht auf Gesundheitsdaten (nur Trainer und Medizin). */
  readonly health: boolean;
  readonly audience: readonly AlertAudience[];
}

export const PAIN_MAX_VALUE = 3;
export const PAIN_MIN_COUNT = 2;
export const PAIN_WINDOW_DAYS = 14;
export const WELLNESS_DROP = 3;
export const OPEN_RATINGS_DAYS = 7;
export const ALERT_LOG_DAYS = 28;

/**
 * Die Vorlagen. Medizin bekommt nur die beiden Befindens-Regeln: Bewertungen (und damit die Belastung) darf sie nicht
 * lesen, und bei widerrufener Einwilligung sieht sie den Spieler gar nicht.
 */
export const ALERT_RULES: readonly AlertRule[] = [
  {
    id: 'pain',
    title: 'Schmerz wiederholt',
    when: `Ein Spieler meldet innerhalb von ${PAIN_WINDOW_DAYS} Tagen mindestens ${PAIN_MIN_COUNT}-mal Muskelkater/Schmerz „deutlich“ oder stärker (entspricht etwa 6 von 10).`,
    health: true,
    audience: ['trainer', 'physio'],
  },
  {
    id: 'wellness',
    title: 'Befinden schlechter als üblich',
    when: `Das Befinden (Summe der 4 Fragen) liegt mindestens ${WELLNESS_DROP} Punkte unter dem eigenen Normalwert der 4 Wochen davor.`,
    health: true,
    audience: ['trainer', 'physio'],
  },
  {
    id: 'loadSpike',
    title: 'Belastungsspitze',
    when: 'Die Belastungsampel meldet eine Belastungsspitze (Müdigkeit ab dem 1,5-fachen der Fitness).',
    health: false,
    audience: ['trainer'],
  },
  {
    id: 'consentRevoked',
    title: 'Einwilligung widerrufen',
    when: 'Die Einwilligung eines Spielers ist widerrufen und es sind noch Gesundheitsdaten gespeichert.',
    health: false,
    audience: ['trainer'],
  },
  {
    id: 'openRatings',
    title: 'Offene Bewertungen',
    when: `Ein Termin der letzten ${OPEN_RATINGS_DAYS} Tage ist vorbei und noch nicht für alle Spieler bewertet.`,
    health: false,
    audience: ['trainer'],
  },
];

export function alertRule(id: AlertRuleId): AlertRule {
  return ALERT_RULES.find((rule) => rule.id === id)!;
}

/** Ein/Aus je Vorlage. Standard: alle an (möglichst wenig Handarbeit). */
export type AlertSwitches = Readonly<Record<AlertRuleId, boolean>>;
export const DEFAULT_ALERT_SWITCHES: AlertSwitches = { pain: true, wellness: true, loadSpike: true, consentRevoked: true, openRatings: true };

/** Dokument `meta/settings` → Schalter; fehlende oder ungültige Werte gelten als „an“. */
export function alertSwitchesFromDoc(doc: Readonly<Record<string, unknown>> | null): AlertSwitches {
  const raw = doc?.['alertRules'];
  const stored = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(ALERT_RULE_IDS.map((id) => [id, typeof stored[id] === 'boolean' ? stored[id] : DEFAULT_ALERT_SWITCHES[id]])) as unknown as AlertSwitches;
}

export function docFromAlertSwitches(switches: AlertSwitches): Record<string, unknown> {
  return { alertRules: Object.fromEntries(ALERT_RULE_IDS.map((id) => [id, switches[id] !== false])) };
}

/** Daten eines Spielers für die Regeln. `null` = für diese Rolle nicht lesbar oder nicht geladen (Regel schweigt). */
export interface AlertPlayerData {
  readonly player: Player;
  /** Alle Termine mit der Bewertung dieses Spielers (Medizin: null, sie liest keine Bewertungen). */
  readonly items: readonly EventRating[] | null;
  readonly absences: readonly Absence[];
  readonly measurements: readonly Measurement[];
  readonly wellness: readonly WellnessEntry[] | null;
}

/** Ein Treffer an einem Tag. `key` ist je Regel und Spieler (bzw. Termin) eindeutig. */
export interface AlertMatch {
  readonly key: string;
  readonly ruleId: AlertRuleId;
  readonly playerId: string | null;
  readonly eventId: string | null;
  /** Spielername bzw. Termin. */
  readonly subject: string;
  /** Kurzer Grund (nur in der App, nie in einer E-Mail). */
  readonly detail: string;
}

const dayDate = (iso: string) => new Date(`${iso}T12:00:00`);
const comma = (value: number) => (Math.round(value * 10) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/** Schmerz wiederholt am Tag `day`. */
export function painMatch(wellness: readonly WellnessEntry[] | null, day: string): { count: number } | null {
  if (!wellness) return null;
  const from = addDays(day, -(PAIN_WINDOW_DAYS - 1));
  const count = wellness.filter((entry) => entry.soreness !== null && entry.soreness <= PAIN_MAX_VALUE && entry.date >= from && entry.date <= day).length;
  return count >= PAIN_MIN_COUNT ? { count } : null;
}

/** Befinden schlechter als üblich am Tag `day`. */
export function wellnessDropMatch(wellness: readonly WellnessEntry[] | null, day: string): { current: number; baseline: number } | null {
  if (!wellness) return null;
  const status = wellnessStatus(wellness, day);
  if (status.current === null || status.baseline === null) return null;
  return status.current <= status.baseline - WELLNESS_DROP ? { current: status.current, baseline: status.baseline } : null;
}

/** Belastungsspitze am Tag `day` (Belastungsampel, nur mit lesbaren Bewertungen). */
export function loadSpikeMatch(data: AlertPlayerData, day: string): InjuryRisk | null {
  if (!data.items) return null;
  const risk = injuryRisk(data.player, data.items, data.absences, data.measurements, dayDate(day));
  return risk.spike ? risk : null;
}

/** Einwilligung widerrufen und noch Gesundheitsdaten da (Status, Abwesenheiten, Messwerte oder Befinden). */
export function consentRevokedMatch(data: AlertPlayerData): boolean {
  const { player } = data;
  if (player.consentStatus !== 'revoked') return false;
  const statusStored = player.status !== 'Fit' || !!player.injuryUntil || !!player.injuredSince;
  return statusStored || data.absences.length > 0 || data.measurements.length > 0 || (data.wellness ?? []).some(hasWellnessAnswer);
}

/** Vergangene Termine der letzten 7 Tage (vor `day`), bei denen noch Spieler ohne Bewertung sind. */
export function openRatingsMatches(players: readonly AlertPlayerData[], events: readonly TeamEvent[], day: string): { event: TeamEvent; open: number; total: number }[] {
  const readable = players.filter((entry) => entry.items !== null);
  if (readable.length === 0) return [];
  const from = addDays(day, -OPEN_RATINGS_DAYS);
  return events
    .filter((event) => event.date >= from && event.date < day)
    .map((event) => {
      const open = readable.filter((entry) => {
        const rating = entry.items!.find((item) => item.event.id === event.id)?.rating ?? null;
        return rating === null || !isRated(rating);
      }).length;
      return { event, open, total: readable.length };
    })
    .filter((entry) => entry.open > 0)
    .sort((a, b) => a.event.date.localeCompare(b.event.date));
}

/** Alle Treffer der eingeschalteten Regeln für diese Rolle am Tag `day`. */
export function alertMatchesOn(
  players: readonly AlertPlayerData[],
  events: readonly TeamEvent[],
  switches: AlertSwitches,
  audience: AlertAudience,
  day: string,
): AlertMatch[] {
  const on = (id: AlertRuleId) => switches[id] && alertRule(id).audience.includes(audience);
  const matches: AlertMatch[] = [];
  const add = (ruleId: AlertRuleId, data: AlertPlayerData, detail: string) =>
    matches.push({ key: `${ruleId}:${data.player.id}`, ruleId, playerId: data.player.id, eventId: null, subject: data.player.name, detail });
  for (const data of players) {
    if (on('pain')) {
      const pain = painMatch(data.wellness, day);
      if (pain) add('pain', data, `${pain.count}× Muskelkater/Schmerz „deutlich“ oder stärker in ${PAIN_WINDOW_DAYS} Tagen`);
    }
    if (on('wellness')) {
      const drop = wellnessDropMatch(data.wellness, day);
      if (drop) add('wellness', data, `Befinden ${drop.current} statt üblich ${comma(drop.baseline)} (von 28)`);
    }
    if (on('loadSpike')) {
      const spike = loadSpikeMatch(data, day);
      if (spike) add('loadSpike', data, `Müdigkeit ${comma(spike.ratio ?? 0)}-fach der Fitness`);
    }
    if (on('consentRevoked') && consentRevokedMatch(data)) add('consentRevoked', data, 'Gesundheitsdaten prüfen und löschen');
  }
  if (on('openRatings')) {
    for (const { event, open, total } of openRatingsMatches(players, events, day)) {
      matches.push({
        key: `openRatings:${event.id}`,
        ruleId: 'openRatings',
        playerId: null,
        eventId: event.id,
        subject: `${event.title || event.type} am ${shortDate(event.date)}`,
        detail: `${open} von ${total} Spielern noch ohne Bewertung`,
      });
    }
  }
  return matches;
}

export interface AlertHint extends AlertMatch {
  readonly title: string;
  /** Erster Tag, an dem die Regel (ohne Unterbrechung bis heute) anschlägt. */
  readonly since: string;
  /** Schlägt schon seit Beginn des Protokolls an (das genaue erste Datum liegt davor). */
  readonly sinceBefore: boolean;
}

export interface AlertLogEntry {
  readonly date: string;
  readonly key: string;
  readonly ruleId: AlertRuleId;
  readonly title: string;
  readonly subject: string;
  readonly detail: string;
  /** Liegt der Beginn vor dem Protokollfenster? */
  readonly sinceBefore: boolean;
  /** Schlägt heute noch an. */
  readonly active: boolean;
  /** Letzter Tag mit Treffer (heute, wenn aktiv). */
  readonly until: string;
}

export interface AlertResult {
  /** Hinweise von heute, Regel-Reihenfolge wie {@link ALERT_RULES}, dann Name. */
  readonly hints: readonly AlertHint[];
  /** Protokoll der letzten {@link ALERT_LOG_DAYS} Tage, neueste zuerst. */
  readonly log: readonly AlertLogEntry[];
}

const ruleOrder = (id: AlertRuleId) => ALERT_RULE_IDS.indexOf(id);

/**
 * Hinweise für heute und das Protokoll: Jeder Tag von heute − {@link ALERT_LOG_DAYS} + 1 bis heute wird mit den Daten
 * bis zu diesem Tag ausgewertet. Ein Protokolleintrag beginnt, wenn ein Treffer neu auftritt, und endet am letzten Tag
 * ohne Unterbrechung.
 * @param today ISO-Datum des Auswertungstags
 */
export function evaluateAlerts(
  players: readonly AlertPlayerData[],
  events: readonly TeamEvent[],
  switches: AlertSwitches,
  audience: AlertAudience,
  today: string,
): AlertResult {
  const first = addDays(today, -(ALERT_LOG_DAYS - 1));
  const open = new Map<string, { start: string; last: string; match: AlertMatch }>();
  const closed: { start: string; last: string; match: AlertMatch }[] = [];
  for (let day = first; day <= today; day = addDays(day, 1)) {
    const seen = new Set<string>();
    for (const match of alertMatchesOn(players, events, switches, audience, day)) {
      seen.add(match.key);
      const run = open.get(match.key);
      if (run) open.set(match.key, { ...run, last: day, match });
      else open.set(match.key, { start: day, last: day, match });
    }
    for (const [key, run] of open) {
      if (seen.has(key)) continue;
      closed.push(run);
      open.delete(key);
    }
  }
  const entry = (run: { start: string; last: string; match: AlertMatch }, active: boolean): AlertLogEntry => ({
    date: run.start,
    key: run.match.key,
    ruleId: run.match.ruleId,
    title: alertRule(run.match.ruleId).title,
    subject: run.match.subject,
    detail: run.match.detail,
    sinceBefore: run.start === first,
    active,
    until: run.last,
  });
  const hints = [...open.values()]
    .map((run) => ({ ...run.match, title: alertRule(run.match.ruleId).title, since: run.start, sinceBefore: run.start === first }))
    .sort((a, b) => ruleOrder(a.ruleId) - ruleOrder(b.ruleId) || a.subject.localeCompare(b.subject, 'de'));
  const log = [...closed.map((run) => entry(run, false)), ...[...open.values()].map((run) => entry(run, true))].sort(
    (a, b) => b.date.localeCompare(a.date) || ruleOrder(a.ruleId) - ruleOrder(b.ruleId) || a.subject.localeCompare(b.subject, 'de'),
  );
  return { hints, log };
}

/**
 * Text einer späteren E-Mail (Erinnerungsdienst, SCRUM-101): bewusst ohne Namen, Regel, Werte oder Anzahl – nur der
 * Hinweis, in die App zu schauen. Gesundheitsdaten gehören nie in eine E-Mail.
 */
export const ALERT_EMAIL_SUBJECT = 'TeamKompass: Neuer Hinweis';
export const ALERT_EMAIL_TEXT = 'In TeamKompass gibt es einen neuen Hinweis für dich. Bitte schau in die App.';

/** E-Mail zu den Hinweisen; ohne Hinweis keine E-Mail. Der Inhalt hängt absichtlich nicht von den Hinweisen ab. */
export function alertEmail(hints: readonly AlertHint[]): { subject: string; text: string } | null {
  return hints.length > 0 ? { subject: ALERT_EMAIL_SUBJECT, text: ALERT_EMAIL_TEXT } : null;
}
