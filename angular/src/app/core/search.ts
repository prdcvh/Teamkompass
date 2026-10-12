/**
 * Globale Suche (Trainer): Bereiche, Spieler, Events und Gegner in einer Liste. Gleiche Regeln wie die bisherige
 * Suche (Strg/⌘ + K in outputs/team-manager/next-level.js): Treffer sind Teilstrings von „Name + Zusatz“ ohne
 * Beachtung der Groß-/Kleinschreibung, höchstens 12 Treffer, Reihenfolge Bereiche → Spieler → Events → Gegner.
 */
import { type TeamEvent } from './event';
import { SIDEBAR_ITEMS } from './navigation';
import { type Opponent } from './opponent';
import { type Player } from './player';

export const MAX_SEARCH_HITS = 12;

export type SearchKind = 'view' | 'player' | 'event' | 'opponent';

export interface SearchHit {
  readonly kind: SearchKind;
  readonly id: string;
  readonly label: string;
  readonly meta: string;
  /** Ziel für den Router. */
  readonly link: readonly string[];
  readonly queryParams?: Readonly<Record<string, string>>;
}

export interface SearchSource {
  readonly players: readonly Player[];
  readonly events: readonly TeamEvent[];
  readonly opponents: readonly Opponent[];
}

export function searchTeam(source: SearchSource, query: string, limit = MAX_SEARCH_HITS): SearchHit[] {
  const needle = query.trim().toLowerCase();
  const hits: SearchHit[] = [
    ...SIDEBAR_ITEMS.map<SearchHit>((item) => ({ kind: 'view', id: item.path, label: item.label, meta: 'Bereich', link: [item.path] })),
    ...source.players.map<SearchHit>((player) => ({
      kind: 'player',
      id: player.id,
      label: player.name,
      meta: `Spieler · Nr. ${player.number}`,
      link: ['/profile', player.id],
    })),
    ...source.events.map<SearchHit>((event) => ({
      kind: 'event',
      id: event.id,
      label: event.title,
      meta: `${event.type} · ${event.date}`,
      link: ['/events', event.id],
    })),
    ...source.opponents.map<SearchHit>((opponent) => ({
      kind: 'opponent',
      id: opponent.id,
      label: opponent.name,
      meta: `Gegner${opponent.formation ? ` · ${opponent.formation}` : ''}`,
      link: ['/gegneranalyse'],
      queryParams: { suche: opponent.name },
    })),
  ];
  return hits.filter((hit) => !needle || `${hit.label} ${hit.meta}`.toLowerCase().includes(needle)).slice(0, limit);
}
