import type { Player } from './player';
import { filterPlayers, groupByLine, sortPlayers, statusCounts } from './squad-list';

function player(overrides: Partial<Player> & { id: string }): Player {
  return {
    name: 'Test Spieler',
    positions: ['ZM'],
    number: 8,
    birthdate: '2012-03-12',
    status: 'Fit',
    injuryUntil: '',
    consentStatus: 'pending',
    consentDate: '',
    ...overrides,
  };
}
describe('Kaderliste: Filter und Sortierung', () => {
  const squad = [
    player({ id: 'a', name: 'Zoe Zander', number: 3, positions: ['TW'], birthdate: '2012-01-01', status: 'Fit' }),
    player({ id: 'b', name: 'Ali Adler', number: 10, positions: ['ST', 'LA'], birthdate: '2013-05-05', status: 'Verletzt' }),
    player({ id: 'c', name: 'Max Meyer', number: 7, positions: ['ZM'], birthdate: '2011-09-09', status: 'Angeschlagen' }),
  ];
  const none = { query: '', position: 'all', status: 'all' };

  it('sucht in Name, Position, Status und Nummer', () => {
    expect(filterPlayers(squad, { ...none, query: 'adler' }).map((p) => p.id)).toEqual(['b']);
    expect(filterPlayers(squad, { ...none, query: 'la' }).map((p) => p.id)).toContain('b');
    expect(filterPlayers(squad, { ...none, query: 'angeschlagen' }).map((p) => p.id)).toEqual(['c']);
    expect(filterPlayers(squad, { ...none, query: '7' }).map((p) => p.id)).toEqual(['c']);
  });

  it('filtert nach Position (auch bei mehreren Positionen) und Status', () => {
    expect(filterPlayers(squad, { ...none, position: 'LA' }).map((p) => p.id)).toEqual(['b']);
    expect(filterPlayers(squad, { ...none, status: 'Fit' }).map((p) => p.id)).toEqual(['a']);
    expect(filterPlayers(squad, { query: '', position: 'LA', status: 'Fit' })).toEqual([]);
  });

  it('sortiert nach Nummer, Name, Position, Alter und Status', () => {
    const ids = (key: Parameters<typeof sortPlayers>[1]) => sortPlayers(squad, key).map((p) => p.id);
    expect(ids('number')).toEqual(['a', 'c', 'b']);
    expect(ids('name')).toEqual(['b', 'c', 'a']);
    expect(ids('position')).toEqual(['b', 'a', 'c']); // „ST, LA“ < „TW“ < „ZM“
    expect(ids('age')).toEqual(['b', 'a', 'c']); // jüngste zuerst
    expect(ids('status')).toEqual(['c', 'a', 'b']); // Angeschlagen, Fit, Verletzt
  });

  it('verändert die Eingabeliste nicht und setzt Spieler ohne Geburtsdatum ans Ende', () => {
    const input = [player({ id: 'x', number: 5, birthdate: '' }), player({ id: 'y', number: 6, birthdate: '2010-01-01' })];
    expect(sortPlayers(input, 'age').map((p) => p.id)).toEqual(['y', 'x']);
    expect(input.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('zählt Status und gruppiert nach Mannschaftsteil', () => {
    expect(statusCounts(squad)).toEqual({ Fit: 1, Angeschlagen: 1, Verletzt: 1, Pause: 0 });
    const custom = player({ id: 'd', positions: ['Libero'] });
    expect(groupByLine([...squad, custom]).map((g) => [g.title, g.players.map((p) => p.id)])).toEqual([
      ['Tor', ['a']],
      ['Mittelfeld', ['c']],
      ['Angriff', ['b']],
      ['Weitere', ['d']],
    ]);
  });
});
