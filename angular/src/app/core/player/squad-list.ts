/**
 * Kaderliste: Filtern, Sortieren, Statuszählung und Gruppieren nach Mannschaftsteil. Maßgeblich ist der wirksame
 * Status (`statusOf`): eine heute laufende Abwesenheit überlagert den gespeicherten Status (SCRUM-164).
 */
import type { EffectiveStatus } from '../records/availability';
import { type Player, positionText } from './player';

/** Liefert den anzuzeigenden Status eines Spielers; ohne Angabe der gespeicherte. */
export type StatusOf = (player: Player) => EffectiveStatus;
const storedStatus: StatusOf = (player) => player.status;

/** Alle Status der Kaderliste in Anzeige-Reihenfolge (Filter und Zähler). */
export const SQUAD_STATUSES: readonly EffectiveStatus[] = ['Fit', 'Angeschlagen', 'Verletzt', 'Abwesend', 'Gesperrt', 'Pause'];

export type SortKey = 'number' | 'name' | 'position' | 'age' | 'status';
export const SORT_OPTIONS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: 'number', label: 'Rückennummer' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'position', label: 'Position' },
  { key: 'age', label: 'Alter (jüngste zuerst)' },
  { key: 'status', label: 'Status' },
];

export interface SquadFilter {
  readonly query: string;
  /** 'all' oder eine Position. */
  readonly position: string;
  /** 'all' oder ein Status. */
  readonly status: string;
}

export function filterPlayers(players: readonly Player[], filter: SquadFilter, statusOf: StatusOf = storedStatus): Player[] {
  const query = filter.query.trim().toLowerCase();
  return players.filter((player) => {
    const status = statusOf(player);
    if (filter.position !== 'all' && !player.positions.includes(filter.position)) return false;
    if (filter.status !== 'all' && status !== filter.status) return false;
    if (!query) return true;
    return [player.name, positionText(player), status, String(player.number)].join(' ').toLowerCase().includes(query);
  });
}

export function sortPlayers(players: readonly Player[], key: SortKey, statusOf: StatusOf = storedStatus): Player[] {
  const byNumber = (a: Player, b: Player) => a.number - b.number;
  const collate = (a: string, b: string) => a.localeCompare(b, 'de');
  const sorted = [...players];
  switch (key) {
    case 'name':
      sorted.sort((a, b) => collate(a.name, b.name) || byNumber(a, b));
      break;
    case 'position':
      sorted.sort((a, b) => collate(positionText(a), positionText(b)) || byNumber(a, b));
      break;
    case 'age':
      // Jüngste zuerst = späteste Geburtsdaten zuerst; ohne Datum ans Ende.
      sorted.sort((a, b) => (b.birthdate || '0000').localeCompare(a.birthdate || '0000') || byNumber(a, b));
      break;
    case 'status':
      sorted.sort((a, b) => collate(statusOf(a), statusOf(b)) || byNumber(a, b));
      break;
    default:
      sorted.sort(byNumber);
  }
  return sorted;
}

export function statusCounts(players: readonly Player[], statusOf: StatusOf = storedStatus): Record<EffectiveStatus, number> {
  const counts: Record<EffectiveStatus, number> = { Fit: 0, Angeschlagen: 0, Verletzt: 0, Abwesend: 0, Gesperrt: 0, Pause: 0 };
  for (const player of players) counts[statusOf(player)] += 1;
  return counts;
}

/** Mannschaftsteile für die Gruppen der Handy-Ansicht (Figma: TOR · 2, ABWEHR · 4 …). */
export const POSITION_LINES: readonly { readonly title: string; readonly positions: readonly string[] }[] = [
  { title: 'Tor', positions: ['TW'] },
  { title: 'Abwehr', positions: ['IV', 'LIB', 'LV', 'RV'] },
  { title: 'Mittelfeld', positions: ['DM', 'ZM', 'OM', 'LM', 'RM'] },
  { title: 'Angriff', positions: ['LA', 'RA', 'HS', 'ST'] },
];

export interface PlayerGroup {
  readonly title: string;
  readonly players: readonly Player[];
}

/** Gruppiert nach der ersten Position; eigene Positionen landen in „Weitere“. Reihenfolge der Spieler bleibt erhalten. */
export function groupByLine(players: readonly Player[]): PlayerGroup[] {
  const groups = [...POSITION_LINES.map((line) => ({ title: line.title, players: [] as Player[] })), { title: 'Weitere', players: [] as Player[] }];
  for (const player of players) {
    const index = POSITION_LINES.findIndex((line) => line.positions.includes(player.positions[0] ?? ''));
    groups[index === -1 ? groups.length - 1 : index].players.push(player);
  }
  return groups.filter((group) => group.players.length > 0);
}
