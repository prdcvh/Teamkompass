import {
  MAX_DETAIL_LENGTH,
  MAX_FORMATION_LENGTH,
  MAX_NAME_LENGTH,
  type Opponent,
  detailsOf,
  docFromOpponent,
  draftFromOpponent,
  emptyDraft,
  filterOpponents,
  opponentFromDoc,
  opponentFromDraft,
  opponentForEvent,
  opponentRecord,
  recordText,
  validateDraft,
} from './opponent';
import type { TeamEvent } from '../events/event';
import { docFromEvent, eventFromDoc, eventFromDraft, draftFromEvent } from '../events/event';

const opponent = (extra: Partial<Opponent> = {}): Opponent => ({
  id: 'o1',
  name: 'JSG Taunus',
  formation: '4-3-3',
  style: 'Pressing',
  strengths: 'Außen schnell',
  weaknesses: '',
  keyPlayers: '',
  setPieces: '',
  gamePlan: 'Tief stehen',
  notes: '',
  updatedAt: '2026-10-01',
  ...extra,
});

describe('Gegnerprofile', () => {
  it('verlangt einen Namen und begrenzt Längen', () => {
    expect(validateDraft(emptyDraft()).name).toBe('Bitte den Namen des Gegners eingeben.');
    expect(validateDraft({ ...emptyDraft(), name: '  ' }).name).toBeDefined();
    expect(validateDraft({ ...emptyDraft(), name: 'a'.repeat(MAX_NAME_LENGTH + 1) }).name).toContain('höchstens');
    expect(validateDraft({ ...emptyDraft(), name: 'ok', formation: 'x'.repeat(MAX_FORMATION_LENGTH + 1) }).formation).toContain('höchstens');
    expect(validateDraft({ ...emptyDraft(), name: 'ok', gamePlan: 'x'.repeat(MAX_DETAIL_LENGTH + 1) }).gamePlan).toContain('Matchplan');
    expect(validateDraft({ ...emptyDraft(), name: 'ok' })).toEqual({});
  });

  it('Entwurf → Gegner: trimmt, setzt das Änderungsdatum, fällt bei unbekannter Spielweise auf „Unbekannt“', () => {
    const draft = { ...emptyDraft(), name: ' JSG ', formation: ' 4-4-2 ', style: 'Quatsch' as never, notes: ' x ' };
    expect(opponentFromDraft(draft, 'o9', '2026-10-08')).toMatchObject({ id: 'o9', name: 'JSG', formation: '4-4-2', style: 'Unbekannt', notes: 'x', updatedAt: '2026-10-08' });
  });

  it('Dokument ↔ Gegner: gleiche Feldnamen wie die bisherige App, ältere Dokumente werden ergänzt', () => {
    const doc = docFromOpponent(opponent());
    expect(Object.keys(doc).sort()).toEqual(['formation', 'gamePlan', 'id', 'keyPlayers', 'name', 'notes', 'setPieces', 'strengths', 'style', 'updatedAt', 'weaknesses']);
    expect(opponentFromDoc('o1', doc)).toEqual(opponent());
    expect(opponentFromDoc('o2', { name: 'Alt' })).toMatchObject({ id: 'o2', name: 'Alt', style: 'Unbekannt', formation: '', updatedAt: '' });
    expect(opponentFromDoc('o3', { name: 5, style: 'x', updatedAt: 'gestern' })).toMatchObject({ name: '', style: 'Unbekannt', updatedAt: '' });
  });

  it('bearbeiten: Entwurf enthält alle Felder des Gegners', () => {
    expect(draftFromOpponent(opponent())).toMatchObject({ id: 'o1', name: 'JSG Taunus', strengths: 'Außen schnell', gamePlan: 'Tief stehen' });
  });

  it('filtert nach Name, Formation und Spielweise und sortiert nach Name', () => {
    const list = [opponent({ id: 'b', name: 'Zeta' }), opponent({ id: 'a', name: 'Alpha', formation: '3-2-3', style: 'Ballbesitz' })];
    expect(filterOpponents(list, '').map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(filterOpponents(list, '3-2').map((entry) => entry.id)).toEqual(['a']);
    expect(filterOpponents(list, 'ballbesitz').map((entry) => entry.id)).toEqual(['a']);
    expect(filterOpponents(list, 'nichts')).toEqual([]);
  });

  it('Details: nur gefüllte Felder, in fester Reihenfolge', () => {
    expect(detailsOf(opponent())).toEqual([
      { label: 'Stärken', value: 'Außen schnell' },
      { label: 'Matchplan', value: 'Tief stehen' },
    ]);
    expect(detailsOf(opponent({ strengths: '', gamePlan: '' }))).toEqual([]);
  });
});

describe('Spiele mit Gegnerprofilen verknüpfen (SCRUM-34)', () => {
  const nord = opponent({ id: 'o1', name: 'SV Nord' });
  const sued = opponent({ id: 'o2', name: 'FC Süd' });
  const profiles = [nord, sued];
  const game = (id: string, date: string, extra: Partial<TeamEvent> = {}): TeamEvent => ({
    id, type: 'Spiel', title: id, date, exertion: 5, intensity: 2, location: '', trainingFocus: '', opponent: '',
    goalsFor: null, goalsAgainst: null, matchDuration: 90, startTime: null, durationMinutes: null, locationCoords: null, notes: '', ...extra,
  });

  it('ordnet über opponentId zu; Altdaten ohne ID nur über den Namen (Anzeige)', () => {
    expect(opponentForEvent(game('a', '2026-01-01', { opponentId: 'o2', opponent: 'SV Nord' }), profiles)?.id).toBe('o2');
    expect(opponentForEvent(game('a', '2026-01-01', { opponent: '  sv   NORD ' }), profiles)?.id).toBe('o1');
    expect(opponentForEvent(game('a', '2026-01-01', { opponentId: 'weg', opponent: 'FC Süd' }), profiles)?.id).toBe('o2');
    expect(opponentForEvent(game('a', '2026-01-01', { opponent: 'Unbekannt' }), profiles)).toBeNull();
    expect(opponentForEvent({ ...game('a', '2026-01-01', { opponent: 'SV Nord' }), type: 'Training' }, profiles)).toBeNull();
  });

  it('Bilanz zählt nur Spiele mit Ergebnis gegen diesen Gegner, neueste zuerst', () => {
    const events = [
      game('g1', '2026-01-01', { opponentId: 'o1', opponent: 'SV Nord', goalsFor: 3, goalsAgainst: 1 }),
      game('g2', '2026-03-01', { opponent: 'sv nord', goalsFor: 2, goalsAgainst: 2 }),
      game('g3', '2026-02-01', { opponentId: 'o1', opponent: 'SV Nord', goalsFor: 0, goalsAgainst: 4 }),
      game('g4', '2026-04-01', { opponentId: 'o1', opponent: 'SV Nord' }),
      game('g5', '2026-05-01', { opponentId: 'o2', opponent: 'FC Süd', goalsFor: 9, goalsAgainst: 0 }),
      game('g6', '2099-01-01', { opponentId: 'o1', opponent: 'SV Nord', goalsFor: 0, goalsAgainst: 0 }),
    ];
    const record = opponentRecord(nord, events, profiles, '2026-06-01');
    expect([record.wins, record.draws, record.losses, record.goalsFor, record.goalsAgainst]).toEqual([1, 1, 1, 5, 7]);
    expect(record.games.map((entry) => entry.eventId)).toEqual(['g2', 'g3', 'g1']);
    expect(recordText(record)).toBe('Bilanz 1 S · 1 U · 1 N · Tore 5:7');
    expect(recordText(opponentRecord(opponent({ id: 'x', name: 'Nie' }), events, profiles, '2026-06-01'))).toContain('keine Spiele');
  });

  it('opponentId wird gespeichert und gelesen; Events ohne ID bleiben ohne', () => {
    const draft = { ...draftFromEvent(game('a', '2026-01-01', { opponent: 'SV Nord' })), opponentId: 'o1' };
    const saved = eventFromDraft(draft, 'a');
    expect(saved.opponentId).toBe('o1');
    expect(eventFromDoc('a', docFromEvent(saved)).opponentId).toBe('o1');
    const legacy = eventFromDoc('b', { type: 'Spiel', opponent: 'SV Nord' });
    expect(legacy.opponentId).toBeUndefined();
    expect(eventFromDraft({ ...draft, type: 'Training' }, 'a').opponentId).toBeUndefined();
  });
});
