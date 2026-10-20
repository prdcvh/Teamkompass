import { memberRole } from '../auth/role';
import { playerFromDoc } from '../player/player';
import { type Rating, ratingFromDoc } from '../ratings/rating';
import { eventFromDoc } from '../events/event';
import {
  buildScoutProfiles,
  scoutItems,
  scoutPlayerFromDoc,
  scoutProfileFor,
  scoutProfileWrites,
  scoutRating,
  scoutRatingsFromDoc,
  stableJson,
} from './scout-profile';

// SCRUM-170: Scouts sehen nur Kompetenzprofil, Notenverlauf und Statistik – keine Gesundheitsdaten.
describe('Scout-Ansicht (reine Logik)', () => {
  const player = playerFromDoc('p1', {
    name: 'Mika',
    number: 7,
    positions: ['ST', 'RA'],
    birthdate: '2012-03-14',
    status: 'Verletzt',
    injuryUntil: '2026-11-30',
    injuredSince: '2026-10-01',
    consentStatus: 'revoked',
    consentDate: '2026-09-01',
  });
  const ratings = new Map<string, ReadonlyMap<string, Rating>>([
    ['e1', new Map([['p1', ratingFromDoc({ attendance: 'absent', note: 'Verletzung: Kreuzbandriss', autoAbsence: true })]])],
    ['e2', new Map([['p1', ratingFromDoc({ attendance: 'limited', effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 45, goals: 1, assists: 0, note: 'Belastung dosiert wegen Knie' })]])],
    ['e3', new Map([['p1', ratingFromDoc({ attendance: 'open' })]])],
    ['e4', new Map([['p2', ratingFromDoc({ attendance: 'present', effort: 1 })]])],
  ]);
  const forbidden = ['Verletz', 'Kreuzband', 'Knie', 'revoked', 'limited', 'autoAbsence', 'note', 'status', 'consent', '2026-11-30', 'injur'];

  it('Profil enthält nur Name, Nummer, Positionen, Geburtsdatum und Teilnoten – keine Gesundheitsdaten', () => {
    const profile = scoutProfileFor(player, ratings);
    expect(Object.keys(profile).sort()).toEqual(['birthdate', 'name', 'number', 'playerId', 'positions', 'ratings']);
    expect(Object.keys(profile.ratings).sort()).toEqual(['e1', 'e2']);
    expect(profile.ratings['e1']).toEqual({ attendance: 'absent', effort: '', technique: '', tactics: '', comprehension: '', minutes: '', goals: '', assists: '' });
    expect(profile.ratings['e2']).toEqual({ attendance: 'present', effort: 2, technique: 3, tactics: 2, comprehension: 1, minutes: 45, goals: 1, assists: 0 });
    const json = JSON.stringify(profile);
    for (const text of forbidden) expect(json).not.toContain(text);
  });

  it('gleiches Format wie die Live-Apps (Leerwerte als "", „Teilweise“ → anwesend, „Nicht im Kader“ → fehlt)', () => {
    expect(scoutRating({ attendance: 'excluded', effort: 'Fehlt wegen Krankheit (Grippe)', goals: { x: 1 }, minutes: 90 })).toEqual({
      attendance: 'absent', effort: '', technique: '', tactics: '', comprehension: '', minutes: 90, goals: '', assists: '',
    });
    expect(scoutRating(null).attendance).toBe('open');
  });

  it('Abgleich schreibt nur Abweichungen und entfernt Profile gelöschter Spieler', () => {
    const other = playerFromDoc('p2', { name: 'Ben', number: 4, birthdate: '2012-01-01' });
    const expected = buildScoutProfiles([player, other], ratings);
    expect(scoutProfileWrites(expected, {}).set.map(([id]) => id)).toEqual(['p1', 'p2']);
    const existing: Record<string, unknown> = JSON.parse(JSON.stringify(expected));
    existing['p1'] = Object.fromEntries(Object.entries(existing['p1'] as object).reverse());
    expect(scoutProfileWrites(expected, existing)).toEqual({ set: [], remove: [] });
    existing['p2'] = { ...(existing['p2'] as object), status: 'Verletzt' };
    existing['p9'] = { playerId: 'p9' };
    const next = scoutProfileWrites(expected, existing);
    expect(next.set.map(([id]) => id)).toEqual(['p2']);
    expect(next.remove).toEqual(['p9']);
  });

  it('stableJson ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(stableJson({ b: 1, a: [1, { d: 2, c: null }] })).toBe(stableJson({ a: [1, { c: null, d: 2 }], b: 1 }));
  });

  it('Scout-Seite: aus dem Profil entstehen nur Spieler ohne Status und Bewertungen ohne Notiz', () => {
    const doc = { ...scoutProfileFor(player, ratings), status: 'Verletzt', ratings: { e2: { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, note: 'Knie' } } };
    const scoutPlayer = scoutPlayerFromDoc('p1', doc);
    expect(scoutPlayer).toEqual({ id: 'p1', name: 'Mika', number: 7, positions: ['ST', 'RA'], birthdate: '2012-03-14' });
    const byEvent = scoutRatingsFromDoc(doc);
    expect(byEvent.get('e2')?.note).toBe('');
    expect(byEvent.get('e2')?.effort).toBe(2);
    const events = [eventFromDoc('e1', { type: 'Training', title: 'A', date: '2026-09-01' }), eventFromDoc('e2', { type: 'Spiel', title: 'B', date: '2026-09-08' })];
    const items = scoutItems(events, byEvent);
    expect(items.map((item) => item.event.id)).toEqual(['e2', 'e1']);
    expect(items[1].rating).toBeNull();
  });

  it('Rolle: Alt-Konten „medical“ ohne healthAccess sind Scouts; Medizin nur mit healthAccess === true', () => {
    expect(memberRole({ role: 'medical' })).toBe('scout');
    expect(memberRole({ role: 'medical', healthAccess: 'true' })).toBe('scout');
    expect(memberRole({ role: 'medical', healthAccess: true })).toBe('medical');
    expect(memberRole({ role: 'scout' })).toBe('scout');
    expect(memberRole({ role: 'trainer' })).toBe('trainer');
    expect(memberRole({ role: 'player' })).toBe('player');
    expect(memberRole({ role: 'admin' })).toBeNull();
    expect(memberRole({})).toBeNull();
  });
});
