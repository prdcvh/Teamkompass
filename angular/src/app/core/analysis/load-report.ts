/**
 * Belastungsprotokoll eines Spielers als druckbarer Bericht (SCRUM-139; PDF über „Drucken → Als PDF speichern“),
 * typischerweise für den Physio. Rechnet wie die Live-Apps (outputs/team-manager/app.js: `buildLoadReport`,
 * `loadReportHtml`) und baut auf der Belastungsrechnung aus SCRUM-137 ({@link injuryRisk}) auf.
 *
 * - Ohne „Verletzungs- und Befindensdaten einschließen“ enthält der Bericht keine Verletzungen, keine
 *   Abwesenheitsgründe und keine Verfügbarkeit; die Stufe wird dann ohne diese Daten gerechnet.
 * - Spielerangaben und Befindensfragen (SCRUM-138) gibt es in dieser Version noch nicht: die Abschnitte entfallen.
 * - Den druckbaren Bericht baut `loadReportHtml` (load-report-html.ts); jeder Nutzertext wird maskiert (SCRUM-13).
 */
import type { TeamEvent } from '../events/event';
import type { Player } from '../player/player';
import type { EventRating } from '../profile/profile';
import type { Attendance } from '../ratings/rating';
import { type Absence, absenceTitle, activeAbsenceOn, isInjuryAbsence } from '../records/absence';
import type { Measurement } from '../records/measurement';
import { addDays, formatDate, isIsoDate } from '../shared/dates';
import { type InjuryRisk, type LoadAvailability, injuryRisk, sessionLoad, sessionMinutes } from './risk';

export type LoadReportPeriod = '4' | '8' | '12' | 'custom';

export const LOAD_REPORT_PERIODS: readonly { readonly value: LoadReportPeriod; readonly label: string }[] = [
  { value: '4', label: 'Letzte 4 Wochen' },
  { value: '8', label: 'Letzte 8 Wochen' },
  { value: '12', label: 'Letzte 12 Wochen' },
  { value: 'custom', label: 'Eigener Zeitraum' },
];

const PERIOD_DAYS: Readonly<Record<Exclude<LoadReportPeriod, 'custom'>, number>> = { '4': 28, '8': 56, '12': 84 };
const MAX_DAYS = 366;

const ATTENDANCE_TEXT: Partial<Readonly<Record<Attendance, string>>> = {
  present: 'anwesend',
  limited: 'eingeschränkt',
  absent: 'gefehlt',
  excluded: 'nicht im Kader',
};

export type LoadReportRange = { readonly from: string; readonly to: string } | { readonly error: string };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
export const comma = (value: number, digits = 0) => value.toFixed(digits).replace('.', ',');

/** Zeitraum: 4 (Standard), 8, 12 Wochen bis heute oder ein eigener Zeitraum (höchstens bis heute, höchstens ein Jahr). */
export function loadReportRange(period: LoadReportPeriod, from: string, to: string, today: string): LoadReportRange {
  if (period !== 'custom') return { from: addDays(today, -(PERIOD_DAYS[period] - 1)), to: today };
  if (!isIsoDate(from) || !isIsoDate(to)) return { error: 'Bitte Beginn und Ende des Zeitraums angeben.' };
  if (from > to) return { error: 'Der Beginn liegt nach dem Ende des Zeitraums.' };
  if (from > today) return { error: 'Der Zeitraum liegt in der Zukunft.' };
  const end = to > today ? today : to;
  if (days(from, end) + 1 > MAX_DAYS) return { error: 'Der Zeitraum darf höchstens ein Jahr lang sein.' };
  return { from, to: end };
}

export interface LoadReportRow {
  readonly date: string;
  readonly type: string;
  readonly title: string;
  readonly attendance: string;
  /** Abwesenheitsgrund – nur mit Gesundheitsdaten. */
  readonly reason: string;
  readonly minutes: number | null;
  readonly exertion: number | null;
  readonly load: number | null;
}

export interface LoadReportWeek {
  readonly from: string;
  readonly to: string;
  readonly load: number;
  readonly sessions: number;
}

export interface LoadReportGrowth {
  readonly from: string;
  readonly to: string;
  readonly fromHeight: number;
  readonly toHeight: number;
  readonly perMonth: number;
}

export interface LoadReportReturn {
  readonly kind: 'Verletzung' | 'Abwesenheit';
  readonly text: string;
  readonly from: string;
  readonly to: string;
  readonly returned: boolean;
}

export interface LoadReport {
  readonly teamName: string;
  readonly playerName: string;
  readonly playerNumber: number;
  readonly from: string;
  readonly to: string;
  readonly created: string;
  readonly createdBy: string;
  readonly includeHealth: boolean;
  readonly assessment: Pick<InjuryRisk, 'level' | 'tier' | 'action' | 'reasons'> & {
    readonly load: number;
    readonly baseline: number;
    readonly availability: LoadAvailability | null;
  };
  readonly weeks: readonly LoadReportWeek[];
  readonly rows: readonly LoadReportRow[];
  readonly totals: { readonly sessions: number; readonly minutes: number; readonly load: number; readonly missed: number };
  readonly markers: { readonly growth: readonly LoadReportGrowth[]; readonly returns: readonly LoadReportReturn[]; readonly recovery: readonly string[] };
}

export interface LoadReportInput {
  readonly teamName: string;
  readonly player: Player;
  readonly items: readonly EventRating[];
  readonly absences: readonly Absence[];
  readonly measurements: readonly Measurement[];
  readonly includeHealth: boolean;
  readonly from: string;
  readonly to: string;
  readonly today: string;
  readonly createdBy: string;
}

/**
 * Wer das Protokoll erstellen darf (PO-Entscheidung 20.10.2026): der Trainer für jeden Spieler, ein Spieler nur für sich
 * selbst. Eltern, Medizin-/Scout-Zugang und jede andere Rolle nicht – deshalb eine Positivliste.
 */
export function canCreateLoadReport(role: string | null, ownPlayerId: string | null, playerId: string): boolean {
  if (role === 'trainer') return true;
  return role === 'player' && !!ownPlayerId && ownPlayerId === playerId;
}

const took = (item: EventRating) => item.rating?.attendance === 'present' || item.rating?.attendance === 'limited';

export function buildLoadReport(input: LoadReportInput): LoadReport {
  const { player, from, includeHealth, today } = input;
  const asOf = input.to < today ? input.to : today;
  const past = input.items.filter((item) => isIsoDate(item.event.date) && item.event.date <= asOf);
  const absences = includeHealth ? input.absences : [];

  // Stufe zum Ende des Zeitraums; ohne Häkchen ohne Status, Verletzungen und Abwesenheiten gerechnet.
  const riskPlayer: Player = includeHealth ? player : { ...player, status: 'Fit', injuryUntil: '' };
  const risk = injuryRisk(riskPlayer, past, absences, input.measurements.filter((item) => item.date <= asOf), new Date(`${asOf}T12:00:00`));

  const rows: LoadReportRow[] = past
    .filter((item) => item.event.date >= from && item.rating && ATTENDANCE_TEXT[item.rating.attendance])
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.title.localeCompare(b.event.title))
    .map((item) => {
      const rating = item.rating!;
      const event: TeamEvent = item.event;
      const active = took(item);
      let reason = '';
      if (includeHealth && rating.attendance === 'absent') {
        const absence = activeAbsenceOn(absences, event.date);
        if (absence) reason = absenceTitle(absence);
        else if (
          player.status === 'Verletzt' &&
          (!player.injuredSince || event.date >= player.injuredSince) &&
          (!player.injuryUntil || event.date <= player.injuryUntil)
        ) {
          reason = 'Verletzt';
        }
      }
      return {
        date: event.date,
        type: event.type === 'Spiel' ? 'Spiel' : 'Training',
        title: event.title,
        attendance: ATTENDANCE_TEXT[rating.attendance]!,
        reason,
        minutes: active ? Math.round(sessionMinutes(event, rating)) : null,
        exertion: active ? event.exertion : null,
        load: active ? Math.round(sessionLoad(event, rating)) : null,
      };
    });

  // Wochenverlauf: Wochen rückwärts ab dem Ende des Zeitraums; die erste Woche kann kürzer sein.
  const weeks: LoadReportWeek[] = [];
  for (let end = asOf; end >= from; end = addDays(end, -7)) {
    const start = addDays(end, -6) < from ? from : addDays(end, -6);
    const inWeek = rows.filter((row) => row.load !== null && row.date >= start && row.date <= end);
    weeks.unshift({ from: start, to: end, load: inWeek.reduce((sum, row) => sum + (row.load ?? 0), 0), sessions: inWeek.length });
  }

  // Erholungs-Hinweise: zwei sehr harte Einheiten (≥ 7) innerhalb von 48 Stunden; Wochen ab dem 1,5-fachen der 3 Wochen davor.
  const recovery: string[] = [];
  const hard = rows.filter((row) => row.exertion !== null && row.exertion >= 7);
  hard.forEach((row, index) => {
    if (index > 0 && days(hard[index - 1].date, row.date) <= 2) {
      recovery.push(`Zwei sehr harte Einheiten innerhalb von 48 Stunden (${formatDate(hard[index - 1].date)} und ${formatDate(row.date)})`);
    }
  });
  const weekLoad = (end: string) => {
    const start = addDays(end, -6);
    return past.filter((item) => item.event.date >= start && item.event.date <= end && took(item)).reduce((sum, item) => sum + sessionLoad(item.event, item.rating!), 0);
  };
  for (const week of weeks) {
    if (week.load <= 0 || days(week.from, week.to) < 6) continue;
    const previous = [1, 2, 3].map((n) => weekLoad(addDays(week.to, -7 * n)));
    if (previous.filter((value) => value > 0).length < 2) continue;
    const baseline = (previous[0] + previous[1] + previous[2]) / 3;
    if (baseline > 0 && week.load / baseline >= 1.5) {
      recovery.push(`Belastungsspitze in der Woche ${formatDate(week.from)}–${formatDate(week.to)} (${comma(week.load / baseline, 1)}-fach des Schnitts der 3 Wochen davor)`);
    }
  }

  // Wachstum: cm pro Monat zwischen zwei Messungen, deren spätere im Zeitraum liegt.
  const measured = [...input.measurements]
    .filter((item) => isIsoDate(item.date) && item.date <= asOf && (item.height ?? 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const growth: LoadReportGrowth[] = [];
  measured.forEach((item, index) => {
    if (index === 0 || item.date < from) return;
    const prev = measured[index - 1];
    const months = days(prev.date, item.date) / 30;
    if (months <= 0) return;
    const perMonth = ((item.height ?? 0) - (prev.height ?? 0)) / months;
    growth.push({ from: prev.date, to: item.date, fromHeight: prev.height ?? 0, toHeight: item.height ?? 0, perMonth: Math.round(perMonth * 10) / 10 });
  });

  // Rückkehr nach Verletzung/Abwesenheit: Einträge, die den Zeitraum berühren (nur mit Häkchen).
  const returns: LoadReportReturn[] = absences
    .filter((item) => item.from && item.from <= asOf && (!item.to || item.to >= from))
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((item) => ({
      kind: isInjuryAbsence(item) ? 'Verletzung' : 'Abwesenheit',
      text: absenceTitle(item),
      from: item.from,
      to: item.to,
      returned: Boolean(item.to && item.to >= from && item.to < asOf),
    }));
  if (includeHealth && player.status === 'Verletzt' && player.injuryUntil && player.injuryUntil >= from && !returns.some((item) => item.kind === 'Verletzung' && item.to === player.injuryUntil)) {
    returns.push({ kind: 'Verletzung', text: 'Verletzt (laut Spielerstatus)', from: '', to: player.injuryUntil, returned: player.injuryUntil < asOf });
  }

  return {
    teamName: input.teamName,
    playerName: player.name,
    playerNumber: player.number,
    from,
    to: asOf,
    created: today,
    createdBy: input.createdBy,
    includeHealth,
    assessment: {
      level: risk.level,
      tier: risk.tier,
      action: risk.action,
      reasons: risk.reasons,
      load: Math.round(risk.load),
      baseline: Math.round(risk.baseline),
      availability: includeHealth ? risk.availability : null,
    },
    weeks,
    rows,
    totals: {
      sessions: rows.filter((row) => row.load !== null).length,
      minutes: rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0),
      load: rows.reduce((sum, row) => sum + (row.load ?? 0), 0),
      missed: rows.filter((row) => row.attendance === 'gefehlt').length,
    },
    markers: { growth, returns, recovery },
  };
}
