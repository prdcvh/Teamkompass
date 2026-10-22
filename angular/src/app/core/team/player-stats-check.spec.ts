import { BLANK_RATING, type Rating } from '../ratings/rating';
import { buildPlayerStats, compareStats, rebuildPlan, statsEntry } from './player-stats';
import type { RatingsByEvent } from './team';

type Raw = Record<string, unknown>;

describe('Prüfung „Zusammenfassung = Neuberechnung“ (SCRUM-201)', () => {
  const events = ['e1', 'e2'];
  const rating = (grade: number): Rating => ({ ...BLANK_RATING, attendance: 'present', effort: grade, technique: grade, tactics: grade, comprehension: grade });
  const ratings: RatingsByEvent = new Map([
    ['e1', new Map([['p1', rating(2)], ['p2', { ...BLANK_RATING, attendance: 'absent' as const }]])],
    ['e2', new Map([['p1', rating(3)]])],
  ]);
  const expected = buildPlayerStats(events, ratings);
  const stored = () => [...expected].map(([id, doc]) => ({ id, data: JSON.parse(JSON.stringify(doc)) as Raw }));

  it('stimmt überein', () => {
    expect(compareStats(stored(), expected, events)).toEqual([]);
  });

  it('findet abweichende, fehlende, überzählige und unsauber gespeicherte Einträge', () => {
    const docs = stored();
    const p1 = docs.find((entry) => entry.id === 'p1')!.data as { events: Record<string, Raw> };
    p1.events['e1'] = { ...p1.events['e1'], effort: 5 }; // abweichend
    delete p1.events['e2']; // fehlt
    const p2 = docs.find((entry) => entry.id === 'p2')!.data as { events: Record<string, Raw> };
    p2.events['e1'] = { ...p2.events['e1'], goals: '' }; // gleiche Bedeutung, aber nicht so, wie die App schreibt
    docs.push({ id: 'p9', data: { playerId: 'p9', version: 1, events: { e2: statsEntry(rating(1)) } } }); // überzählig
    expect(compareStats(docs, expected, events)).toEqual([
      { playerId: 'p1', eventId: 'e1' },
      { playerId: 'p1', eventId: 'e2' },
      { playerId: 'p2', eventId: 'e1' },
      { playerId: 'p9', eventId: 'e2' },
    ]);
  });

  it('Neuberechnung ersetzt alle Zusammenfassungen und löscht verwaiste', () => {
    const plan = rebuildPlan(['p1', 'alt'], expected);
    expect(plan.set.map((doc) => doc.playerId).sort()).toEqual(['p1', 'p2']);
    expect(plan.remove).toEqual(['alt']);
  });
});
