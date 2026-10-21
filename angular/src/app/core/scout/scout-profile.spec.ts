import { eventFromDoc } from '../events/event';
import { playerFromDoc } from '../player/player';
import { ratingFromDoc } from '../ratings/rating';
import { normalizeRole } from '../auth/role';
import { buildScoutProfiles, scoutProfileChanges, scoutViewFromDocs, stableJson } from './scout-profile';

/** Felder, die ein Dokument bzw. ein Termin-Eintrag haben darf (gleiche Liste wie hasOnly in firestore.rules). */
const PROFILE_KEYS = ['birthdate', 'entries', 'name', 'number', 'playerId', 'positions', 'version'];
const ENTRY_KEYS = ['assists', 'attendance', 'comprehension', 'date', 'effort', 'eventId', 'goals', 'goalsAgainst', 'goalsFor', 'matchDuration', 'minutes', 'opponent', 'tactics', 'technique', 'title', 'type'];

describe('Scout-Sicht (SCRUM-170)', () => {
  const players = [
    playerFromDoc('p1', { name: 'Mika', number: 7, positions: ['ZM', 'OM'], birthdate: '2012-03-14', status: 'Verletzt', injuryUntil: '2026-12-01', injuredSince: '2026-10-01', consentStatus: 'granted' }),
    playerFromDoc('p2', { name: 'Widerruf', number: 9, positions: ['ST'], birthdate: '2012-05-05', consentStatus: 'revoked' }),
    playerFromDoc('p3', { name: 'Offen', number: 4, positions: ['IV'], birthdate: '2013-01-01', status: 'Angeschlagen' }),
  ];
  const events = [
    eventFromDoc('e2', { type: 'Spiel', title: 'Liga', date: '2026-10-12', opponent: 'FC Test', goalsFor: 2, goalsAgainst: 1, matchDuration: 70, notes: 'Mika hatte Knieschmerzen', location: 'Heimplatz' }),
    eventFromDoc('e1', { type: 'Training', title: 'Training', date: '2026-10-01', notes: 'Knie-Reha', trainingFocus: 'Pressing' }),
    eventFromDoc('e3', { type: 'Training', title: 'Zukunft', date: '2026-11-01' }),
  ];
  const ratings = new Map([
    ['e2', new Map([
      ['p1', ratingFromDoc({ attendance: 'limited', effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: '', note: 'Belastung dosiert wegen Knie' })],
      ['p3', ratingFromDoc({ attendance: 'absent', note: 'Verletzt', autoAbsence: true })],
    ])],
    ['e1', new Map([
      ['p1', ratingFromDoc({ attendance: 'present', effort: 1, technique: 2, tactics: 2, comprehension: 2, note: 'Stark' })],
      ['p2', ratingFromDoc({ attendance: 'present', effort: 3, technique: 3, tactics: 3, comprehension: 3, note: 'x' })],
      ['p3', ratingFromDoc({ attendance: 'excluded', note: 'Urlaub' })],
    ])],
    ['e3', new Map([['p1', ratingFromDoc({ attendance: 'open' })]])],
  ]);

  it('enthält keine Gesundheitsdaten, Gründe, Rückmeldungen oder Notizen und nur erlaubte Felder', () => {
    const profiles = buildScoutProfiles(players, events, ratings);
    const text = JSON.stringify([...profiles.values()]);
    for (const forbidden of ['Verletzt', 'Knie', 'Urlaub', 'Belastung', 'Stark', 'injury', 'injured', 'status', 'consent', 'Angeschlagen', 'Heimplatz', 'Pressing', 'note', 'autoAbsence', 'limited', 'exertion']) {
      expect(text).not.toContain(forbidden);
    }
    for (const profile of profiles.values()) {
      expect(Object.keys(profile).sort()).toEqual(PROFILE_KEYS);
      for (const entry of profile.entries) expect(Object.keys(entry).every((key) => ENTRY_KEYS.includes(key))).toBe(true);
    }
  });

  it('enthält Noten, Statistik und Anwesenheit ohne Grund – im selben Format wie die Live-Apps', () => {
    const profiles = buildScoutProfiles(players, events, ratings);
    expect([...profiles.keys()]).toEqual(['p1', 'p3']);
    const p1 = profiles.get('p1')!;
    expect({ ...p1, entries: undefined }).toEqual({ playerId: 'p1', name: 'Mika', number: 7, positions: ['ZM', 'OM'], birthdate: '2012-03-14', version: 1, entries: undefined });
    // Gleiche Werte wie tests/scout-profile.test.mjs für outputs/*/app.js erwartet.
    expect(p1.entries).toEqual([
      { eventId: 'e1', date: '2026-10-01', type: 'Training', title: 'Training', attendance: 'present', effort: 1, technique: 2, tactics: 2, comprehension: 2, minutes: null, goals: null, assists: null },
      { eventId: 'e2', date: '2026-10-12', type: 'Spiel', title: 'Liga', attendance: 'present', opponent: 'FC Test', goalsFor: 2, goalsAgainst: 1, matchDuration: 70, effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: null },
    ]);
    expect(profiles.get('p3')!.entries).toEqual([
      { eventId: 'e1', date: '2026-10-01', type: 'Training', title: 'Training', attendance: 'excluded' },
      { eventId: 'e2', date: '2026-10-12', type: 'Spiel', title: 'Liga', attendance: 'absent', opponent: 'FC Test', goalsFor: 2, goalsAgainst: 1, matchDuration: 70 },
    ]);
  });

  it('gleicht ab: schreibt nur Geändertes, löscht Überzähliges, Reihenfolge der Felder egal', () => {
    const wanted = buildScoutProfiles(players, events, ratings);
    const reversed = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(reversed) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)])) : value;
    expect(stableJson(reversed(wanted.get('p1')))).toBe(stableJson(wanted.get('p1')));
    const published = new Map<string, unknown>([['p1', reversed(wanted.get('p1'))], ['p3', { ...wanted.get('p3')!, name: 'Alt' }], ['weg', { playerId: 'weg' }]]);
    expect(scoutProfileChanges(published, wanted).map((change) => `${change.type}:${change.id}`).sort()).toEqual(['delete:weg', 'set:p3']);
    expect(scoutProfileChanges(published, new Map()).map((change) => change.type)).toEqual(['delete', 'delete', 'delete']);
  });

  it('baut aus der Scout-Sicht Profile mit denselben Noten, ohne Notizen und ohne fremde Felder', () => {
    const docs = [...buildScoutProfiles(players, events, ratings)].map(([id, data]) => ({ id, data: JSON.parse(JSON.stringify(data)) as Record<string, unknown> }));
    docs.push({ id: 'x', data: { playerId: 'x', name: 'X', entries: [{ eventId: 'e9', type: 'Training', date: '2026-01-01', attendance: 'limited', note: 'geheim', reason: 'Verletzt', effort: 2, technique: 2, tactics: 2, comprehension: 2 }] } });
    const view = scoutViewFromDocs(docs);
    expect(view.players.map((player) => player.id)).toEqual(['p1', 'p3', 'x']);
    const p1 = view.items.get('p1')!;
    expect(p1.map((item) => item.event.id)).toEqual(['e2', 'e1']);
    expect(p1[0].rating).toMatchObject({ attendance: 'present', effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 35, goals: 1, assists: null, note: '' });
    expect(p1[0].event).toMatchObject({ goalsFor: 2, goalsAgainst: 1, matchDuration: 70, opponent: 'FC Test', notes: '', location: '' });
    const odd = view.items.get('x')![0];
    expect(odd.rating?.attendance).toBe('present');
    expect(odd.rating?.note).toBe('');
    expect(JSON.stringify(view.items.get('x'))).not.toContain('Verletzt');
  });

  it('bisherige Scout-Konten („medical“) werden Scouts, nicht Medizin', () => {
    expect(normalizeRole('medical')).toBe('scout');
    expect(normalizeRole('scout')).toBe('scout');
    expect(normalizeRole('physio')).toBe('physio');
    expect(normalizeRole('irgendwas')).toBeNull();
  });
});
