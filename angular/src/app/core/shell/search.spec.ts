import { describe, expect, it } from 'vitest';
import { type TeamEvent } from '../events/event';
import { type Opponent } from '../opponents/opponent';
import type { Player } from '../player/player';
import { MAX_SEARCH_HITS, searchTeam } from './search';

const player = (id: string, name: string, number: number): Player => ({
  id,
  name,
  positions: [],
  number,
  birthdate: '2011-01-01',
  status: 'Fit',
  injuryUntil: '',
  injuredSince: '',
  consentStatus: 'granted',
  consentDate: '',
});
const event = (id: string, title: string, type: 'Training' | 'Spiel', date: string) => ({ id, title, type, date }) as TeamEvent;
const opponent = (id: string, name: string, formation = '') => ({ id, name, formation }) as Opponent;

const source = {
  players: [player('p1', 'Anna Beispiel', 7), player('p2', 'Ben Muster', 10)],
  events: [event('e1', 'Spiel gegen Eppstein', 'Spiel', '2026-10-03'), event('e2', 'Techniktraining', 'Training', '2026-10-05')],
  opponents: [opponent('o1', 'SG Eppstein', '4-4-2'), opponent('o2', 'TSG Kelkheim')],
};

describe('searchTeam', () => {
  it('findet Spieler über Namen und Nummer, ohne auf Groß-/Kleinschreibung zu achten', () => {
    expect(searchTeam(source, 'anna').map((hit) => hit.id)).toEqual(['p1']);
    expect(searchTeam(source, 'nr. 10').map((hit) => hit.id)).toEqual(['p2']);
  });

  it('findet Events und Gegner und führt zum passenden Ziel', () => {
    const hits = searchTeam(source, 'eppstein');
    expect(hits.map((hit) => [hit.kind, hit.id])).toEqual([
      ['event', 'e1'],
      ['opponent', 'o1'],
    ]);
    expect(hits[0].link).toEqual(['/events', 'e1']);
    expect(hits[1].link).toEqual(['/gegneranalyse']);
    expect(hits[1].queryParams).toEqual({ suche: 'SG Eppstein' });
  });

  it('findet Bereiche und nennt bei Gegnern die Formation', () => {
    expect(searchTeam(source, 'kader').map((hit) => hit.link)).toEqual([['/kader']]);
    expect(searchTeam(source, '4-4-2')[0].meta).toBe('Gegner · 4-4-2');
  });

  it('zeigt ohne Suchbegriff die ersten Treffer, höchstens 12', () => {
    const many = { ...source, players: Array.from({ length: 30 }, (_, index) => player(`x${index}`, `Spieler ${index}`, index)) };
    const hits = searchTeam(many, '  ');
    expect(hits).toHaveLength(MAX_SEARCH_HITS);
    expect(hits[0].kind).toBe('view');
  });

  it('meldet bei Unsinn keinen Treffer', () => {
    expect(searchTeam(source, 'qqqq')).toEqual([]);
  });
});
