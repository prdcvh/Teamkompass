/**
 * Vereinsvergleich (SCRUM-197, PO-Entscheidungen vom 06.11.2026): Trainer sehen die anderen Teams IHRES Vereins im
 * Vergleich – Teilnahme, Belastung (Ø Anstrengung), Trainingsfokus, Ø Teamnote und die Schlüsselspieler – und einen
 * Spieler im Vergleich zu allen gleich alten Spielern (gleicher Jahrgang) des Vereins. Fremde Vereine: nichts.
 *
 * Datenweg: Der Trainer-Client jedes Teams schreibt eine Kurzfassung `clubs/{clubId}/comparison/{teamId}`
 * (club-comparison.service.ts). Lesen dürfen sie nur Trainer von Teams desselben Vereins (und der Vereinsadmin), und nur,
 * wenn der Vereinsadmin den Vergleich eingeschaltet hat (`clubs/{clubId}.comparisonEnabled`, Standard aus). Die
 * Kurzfassung enthält bewusst nur Werte, die die App schon berechnet (Teamanalyse, Bestenliste), und KEINE
 * Gesundheitsdaten (kein Status, keine Verletzung, keine Abwesenheitsgründe, kein Befinden), keine Notizen, keine
 * Rückmeldungen, keine Elterndaten; vom Geburtsdatum nur das Jahr. Diese Datei enthält nur reine Funktionen.
 */
import { TRAINING_FOCUSES, type TeamEvent } from '../events/event';
import { teamStats, trainingFocusCounts, isPastOrToday } from '../analysis/analysis';
import { averageGrade, gradedEvents } from '../profile/profile';
import type { PlayerData, RatingsByEvent } from '../team/team';
import { roundGrade } from '../ratings/rating';

/** Datenformat der Kurzfassung (Feld `version`). */
export const CLUB_COMPARISON_VERSION = 1;

/** Höchstzahl Spieler je Kurzfassung – gleiche Grenze in firestore.rules. */
export const COMPARISON_MAX_PLAYERS = 200;

/** Wie viele Schlüsselspieler je Team gezeigt werden (wie „Topform“ in der Teamanalyse). */
export const KEY_PLAYER_COUNT = 3;

/** Ein Spieler in der Kurzfassung – nur diese Felder (kein Status, keine Gesundheitsangaben, kein volles Geburtsdatum). */
export interface ComparisonPlayer {
  readonly id: string;
  readonly name: string;
  /** Jahrgang (aus dem Geburtsdatum); null ohne gültiges Datum. */
  readonly birthYear: number | null;
  /** Notenschnitt wie in der Bestenliste (Schulnoten-Gegenwert, kleiner ist besser); null ohne Bewertung. */
  readonly average: number | null;
  /** Benotete Termine (Grundlage des Schnitts). */
  readonly rated: number;
  /** Teilnahmequote in Prozent (Termine bis heute, wie die Teamanalyse rechnet); null ohne gesetzte Anwesenheit. */
  readonly attendanceRate: number | null;
}

/** Kennzahlen des Teams – dieselben wie in der Teamanalyse. */
export interface ComparisonTeam {
  readonly playerCount: number;
  /** Teilnahmequote in Prozent; null ohne gesetzte Anwesenheit. */
  readonly attendanceRate: number | null;
  /** Ø Anstrengung der Termine bis heute (0–10); null ohne Termine. */
  readonly avgExertion: number | null;
  /** Ø Teamnote; null ohne Noten. */
  readonly avgGrade: number | null;
  /** Trainings bis heute. */
  readonly trainings: number;
  /** Spiele bis heute. */
  readonly games: number;
  /** Trainingseinheiten je Spielphase (Schlüssel = TRAINING_FOCUSES). */
  readonly focus: Readonly<Record<string, number>>;
}

export interface ClubComparisonData {
  readonly version: number;
  readonly teamName: string;
  readonly team: ComparisonTeam;
  readonly players: readonly ComparisonPlayer[];
}

export interface ClubComparisonEntry extends ClubComparisonData {
  readonly teamId: string;
  readonly updatedAt: Date | null;
}

function birthYearOf(birthdate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const year = Number(birthdate.slice(0, 4));
  return year >= 1900 && year <= 2100 ? year : null;
}

function rate(attended: number, total: number): number | null {
  return total ? Math.round((attended / total) * 100) : null;
}

/** Teilnahmequote eines Spielers: wie `teamStats` (ohne „Offen“ und „Nicht im Kader“, nur Termine bis heute). */
export function playerAttendanceRate(items: PlayerData['items'], today: string): number | null {
  const set = items
    .filter(({ event, rating }) => rating && isPastOrToday(event, today) && rating.attendance !== 'excluded' && rating.attendance !== 'open')
    .map(({ rating }) => rating!.attendance);
  return rate(set.filter((attendance) => attendance === 'present' || attendance === 'limited').length, set.length);
}

/**
 * Teamdaten → Kurzfassung. Rechnet mit denselben Funktionen wie Teamanalyse und Bestenliste
 * (`teamStats`, `trainingFocusCounts`, `averageGrade`), es entstehen keine neuen Kennzahlen.
 */
export function comparisonFromTeam(
  teamName: string,
  data: readonly PlayerData[],
  events: readonly TeamEvent[],
  ratings: RatingsByEvent,
  today: string,
): ClubComparisonData {
  const stats = teamStats(events, ratings, today);
  const focus = trainingFocusCounts(events, today);
  const past = events.filter((event) => isPastOrToday(event, today));
  const hasAttendance = past.some((event) =>
    [...(ratings.get(event.id)?.values() ?? [])].some((rating) => rating.attendance !== 'excluded' && rating.attendance !== 'open'),
  );
  const players = data
    .map(({ player, items }): ComparisonPlayer => {
      const graded = gradedEvents(items);
      return {
        id: player.id,
        name: player.name,
        birthYear: birthYearOf(player.birthdate),
        average: averageGrade(graded),
        rated: graded.length,
        attendanceRate: playerAttendanceRate(items, today),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id))
    .slice(0, COMPARISON_MAX_PLAYERS);
  return {
    version: CLUB_COMPARISON_VERSION,
    teamName: teamName.slice(0, 100),
    team: {
      playerCount: data.length,
      attendanceRate: hasAttendance ? stats.attendanceRate : null,
      avgExertion: stats.avgIntensity,
      avgGrade: stats.avgGrade,
      trainings: past.filter((event) => event.type === 'Training').length,
      games: stats.games,
      focus: Object.fromEntries(TRAINING_FOCUSES.map((name) => [name, focus[name] ?? 0])),
    },
    players,
  };
}

/** Vergleichsschlüssel: gleicher Inhalt → kein erneutes Schreiben. */
export function comparisonKey(data: ClubComparisonData): string {
  const { team } = data;
  return JSON.stringify([
    data.version,
    data.teamName,
    [team.playerCount, team.attendanceRate, team.avgExertion, team.avgGrade, team.trainings, team.games, TRAINING_FOCUSES.map((name) => team.focus[name] ?? 0)],
    data.players.map((p) => [p.id, p.name, p.birthYear, p.average, p.rated, p.attendanceRate]),
  ]);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Firestore-Dokument → Kurzfassung (null, wenn es fehlt oder ein anderes Format hat). */
export function comparisonFromDoc(teamId: string, data: Readonly<Record<string, unknown>> | null | undefined): ClubComparisonEntry | null {
  if (!data || data['version'] !== CLUB_COMPARISON_VERSION) return null;
  const team = (data['team'] && typeof data['team'] === 'object' ? data['team'] : {}) as Record<string, unknown>;
  const focusRaw = (team['focus'] && typeof team['focus'] === 'object' ? team['focus'] : {}) as Record<string, unknown>;
  const raw = Array.isArray(data['players']) ? (data['players'] as unknown[]) : [];
  const players: ComparisonPlayer[] = raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry['id'] === 'string' ? entry['id'] : '',
      name: typeof entry['name'] === 'string' ? entry['name'] : '',
      birthYear: num(entry['birthYear']),
      average: num(entry['average']),
      rated: count(entry['rated']),
      attendanceRate: num(entry['attendanceRate']),
    }))
    .filter((player) => player.id);
  return {
    teamId,
    version: CLUB_COMPARISON_VERSION,
    teamName: typeof data['teamName'] === 'string' ? data['teamName'] : '',
    team: {
      playerCount: count(team['playerCount']),
      attendanceRate: num(team['attendanceRate']),
      avgExertion: num(team['avgExertion']),
      avgGrade: num(team['avgGrade']),
      trainings: count(team['trainings']),
      games: count(team['games']),
      focus: Object.fromEntries(TRAINING_FOCUSES.map((name) => [name, count(focusRaw[name])])),
    },
    players,
    updatedAt: (data['updatedAt'] as { toDate?: () => Date } | null | undefined)?.toDate?.() ?? null,
  };
}

/** Schlüsselspieler eines Teams: bester Notenschnitt zuerst (wie „Topform“), nur benotete Spieler. */
export function keyPlayers(entry: Pick<ClubComparisonData, 'players'>, limit = KEY_PLAYER_COUNT): ComparisonPlayer[] {
  return entry.players
    .filter((player): player is ComparisonPlayer & { average: number } => player.average !== null)
    .sort((a, b) => a.average - b.average || b.rated - a.rated || a.name.localeCompare(b.name, 'de'))
    .slice(0, limit);
}

/** Lage im Jahrgang – bewusst nur grob (Drittel), keine Rangliste. */
export type CohortBand = 'oben' | 'mitte' | 'unten';

export const COHORT_BAND_LABELS: Readonly<Record<CohortBand, string>> = {
  oben: 'oberes Drittel',
  mitte: 'Mittelfeld',
  unten: 'unteres Drittel',
};

export interface CohortValue {
  /** Wert des Spielers. */
  readonly value: number;
  /** Mittel der anderen Spieler des Jahrgangs mit Wert. */
  readonly cohortAverage: number;
  /** Anteil der anderen, die schlechter liegen (Gleichstand halb), in Prozent. */
  readonly betterThan: number;
  readonly band: CohortBand;
  /** Wie viele andere Spieler einen Wert haben. */
  readonly compared: number;
}

export interface CohortComparison {
  readonly birthYear: number;
  /** Andere Spieler des Jahrgangs im Verein (alle Teams, ohne den Spieler selbst). */
  readonly others: number;
  /** Davon in anderen Teams. */
  readonly otherTeamPlayers: number;
  /** Anzahl Teams, aus denen die anderen Spieler kommen. */
  readonly teams: number;
  /** Notenschnitt im Vergleich (kleiner ist besser); null ohne eigenen Schnitt oder ohne Vergleichswerte. */
  readonly grade: CohortValue | null;
  /** Teilnahmequote im Vergleich (größer ist besser). */
  readonly attendance: CohortValue | null;
}

function bandOf(betterThan: number): CohortBand {
  return betterThan >= 200 / 3 ? 'oben' : betterThan <= 100 / 3 ? 'unten' : 'mitte';
}

function cohortValue(value: number | null, others: readonly (number | null)[], lowerIsBetter: boolean): CohortValue | null {
  const values = others.filter((entry): entry is number => entry !== null);
  if (value === null || values.length === 0) return null;
  const worse = values.filter((entry) => (lowerIsBetter ? entry > value : entry < value)).length;
  const ties = values.filter((entry) => entry === value).length;
  const betterThan = Math.round(((worse + ties / 2) / values.length) * 100);
  const mean = values.reduce((sum, entry) => sum + entry, 0) / values.length;
  return {
    value,
    cohortAverage: lowerIsBetter ? roundGrade(mean) : Math.round(mean),
    betterThan,
    band: bandOf(betterThan),
    compared: values.length,
  };
}

/**
 * Ein Spieler im Vergleich zu allen gleich alten Spielern (gleicher Jahrgang) des Vereins – in der Gesamtheit, nicht als
 * Rangliste. Grundlage sind die Kurzfassungen aller Teams (auch die des eigenen Teams). null, wenn der Spieler (noch)
 * nicht in der Kurzfassung des eigenen Teams steht, kein Jahrgang bekannt ist oder es in anderen Teams keinen Spieler
 * desselben Jahrgangs gibt (dann wäre es kein Vereinsvergleich).
 */
export function cohortComparison(playerId: string, ownTeamId: string, entries: readonly ClubComparisonEntry[]): CohortComparison | null {
  const own = entries.find((entry) => entry.teamId === ownTeamId)?.players.find((player) => player.id === playerId);
  if (!own || own.birthYear === null) return null;
  const year = own.birthYear;
  const others = entries.flatMap((entry) =>
    entry.players
      .filter((player) => player.birthYear === year && !(entry.teamId === ownTeamId && player.id === playerId))
      .map((player) => ({ teamId: entry.teamId, player })),
  );
  const otherTeams = others.filter((entry) => entry.teamId !== ownTeamId);
  if (otherTeams.length === 0) return null;
  return {
    birthYear: year,
    others: others.length,
    otherTeamPlayers: otherTeams.length,
    teams: new Set(others.map((entry) => entry.teamId)).size,
    grade: cohortValue(own.average, others.map((entry) => entry.player.average), true),
    attendance: cohortValue(own.attendanceRate, others.map((entry) => entry.player.attendanceRate), false),
  };
}

/** Häufigster Trainingsfokus (bei Gleichstand der erste in TRAINING_FOCUSES); null ohne Trainings. */
export function mainFocus(team: Pick<ComparisonTeam, 'focus'>): { name: string; share: number } | null {
  const total = TRAINING_FOCUSES.reduce((sum, name) => sum + (team.focus[name] ?? 0), 0);
  if (!total) return null;
  const name = TRAINING_FOCUSES.reduce((best, entry) => ((team.focus[entry] ?? 0) > (team.focus[best] ?? 0) ? entry : best), TRAINING_FOCUSES[0]);
  return { name, share: Math.round(((team.focus[name] ?? 0) / total) * 100) };
}
