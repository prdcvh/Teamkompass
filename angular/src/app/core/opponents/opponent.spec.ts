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
  validateDraft,
} from './opponent';

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
