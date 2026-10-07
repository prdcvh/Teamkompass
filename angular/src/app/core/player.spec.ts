import {
  type Player,
  type PlayerDraft,
  ageFromBirthdate,
  consentRevokedMessage,
  isConsentRevoked,
  docFromPlayer,
  draftFromPlayer,
  emptyDraft,
  filterPlayers,
  groupByLine,
  nextFreeNumber,
  parsePositions,
  playerFromDoc,
  playerFromDraft,
  sortPlayers,
  statusCounts,
  validateDraft,
} from './player';

const NOW = new Date(2026, 9, 2); // 2. Oktober 2026

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

function draft(overrides: Partial<PlayerDraft> = {}): PlayerDraft {
  return { ...emptyDraft([]), name: 'Luca Weber', positions: ['ZM'], birthdate: '2012-03-12', ...overrides };
}

describe('Spieler-Logik', () => {
  it('liest Positionen aus Text und Liste ohne Duplikate', () => {
    expect(parsePositions('ZM, OM; zm/OM|ST')).toEqual(['ZM', 'OM', 'zm', 'ST']);
    expect(parsePositions(['IV', ' IV ', 'LV'])).toEqual(['IV', 'LV']);
    expect(parsePositions(undefined)).toEqual([]);
  });

  it('berechnet das Alter in vollen Jahren', () => {
    expect(ageFromBirthdate('2012-10-02', NOW)).toBe(14);
    expect(ageFromBirthdate('2012-10-03', NOW)).toBe(13);
    expect(ageFromBirthdate('', NOW)).toBeNull();
    expect(ageFromBirthdate('2012-02-30', NOW)).toBeNull();
  });

  it('vergibt die kleinste freie Rückennummer', () => {
    expect(nextFreeNumber([])).toBe(1);
    expect(nextFreeNumber([player({ id: 'a', number: 1 }), player({ id: 'b', number: 3 })])).toBe(2);
  });

  describe('Prüfung', () => {
    it('akzeptiert gültige Eingaben', () => {
      expect(validateDraft(draft(), [], NOW)).toEqual({});
    });

    it('verlangt Name, Position und Geburtsdatum', () => {
      const errors = validateDraft(draft({ name: '  ', positions: [], customPositions: '', birthdate: '' }), [], NOW);
      expect(Object.keys(errors).sort()).toEqual(['birthdate', 'name', 'positions']);
    });

    it('akzeptiert eigene Positionen statt einer Standardposition', () => {
      expect(validateDraft(draft({ positions: [], customPositions: 'Hybrid-8' }), [], NOW)).toEqual({});
    });

    it('lehnt eine vergebene Rückennummer ab, erlaubt aber die eigene beim Bearbeiten', () => {
      const others = [player({ id: 'a', number: 8 })];
      expect(validateDraft(draft({ number: '8' }), others, NOW).number).toContain('bereits vergeben');
      expect(validateDraft(draft({ id: 'a', number: '8' }), others, NOW).number).toBeUndefined();
    });

    it('lehnt ungültige Rückennummern ab', () => {
      for (const number of ['', '0', '100', '1.5', 'abc']) {
        expect(validateDraft(draft({ number }), [], NOW).number, number).toBeDefined();
      }
    });

    it('lehnt ein Geburtsdatum in der Zukunft ab', () => {
      expect(validateDraft(draft({ birthdate: '2026-10-03' }), [], NOW).birthdate).toContain('Zukunft');
    });

    it('prüft das Verletzungsdatum nur bei Status „Verletzt“', () => {
      expect(validateDraft(draft({ status: 'Verletzt', injuryUntil: 'morgen' }), [], NOW).injuryUntil).toBeDefined();
      expect(validateDraft(draft({ status: 'Fit', injuryUntil: 'morgen' }), [], NOW).injuryUntil).toBeUndefined();
    });
  });

  describe('Umwandlung', () => {
    it('baut aus dem Entwurf einen Spieler mit geordneten Positionen und löscht das Verletzungsdatum bei „Fit“', () => {
      const result = playerFromDraft(draft({ positions: ['OM', 'ZM'], customPositions: 'Libero', injuryUntil: '2026-11-01', number: '10' }), 'p1');
      expect(result).toMatchObject({ id: 'p1', number: 10, positions: ['ZM', 'OM', 'Libero'], injuryUntil: '' });
    });

    it('behält das Verletzungsdatum bei „Verletzt“', () => {
      expect(playerFromDraft(draft({ status: 'Verletzt', injuryUntil: '2026-11-01' }), 'p1').injuryUntil).toBe('2026-11-01');
    });

    it('trennt beim Bearbeiten Standard- und eigene Positionen', () => {
      const result = draftFromPlayer(player({ id: 'a', positions: ['ZM', 'Hybrid-8'] }));
      expect(result.positions).toEqual(['ZM']);
      expect(result.customPositions).toBe('Hybrid-8');
    });

    it('schreibt dieselben Felder wie die bisherige App und liest sie zurück', () => {
      const original = player({ id: 'a', positions: ['IV', 'LV'], status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'granted', consentDate: '2026-08-01' });
      const doc = docFromPlayer(original);
      expect(Object.keys(doc).sort()).toEqual(['birthdate', 'consentDate', 'consentStatus', 'id', 'injuryUntil', 'name', 'number', 'positions', 'status']);
      expect(playerFromDoc('a', doc, NOW)).toEqual(original);
    });

    it('versteht ältere Dokumente (position als Text, age statt Geburtsdatum, unbekannter Status)', () => {
      const legacy = playerFromDoc('x', { name: 'Alt', position: 'ST, LA', age: 14, number: '9', status: 'Gesperrt' }, NOW);
      expect(legacy).toMatchObject({ positions: ['ST', 'LA'], birthdate: '2012-07-01', number: 9, status: 'Fit', consentStatus: 'pending' });
    });
  });

  describe('Filter und Sortierung', () => {
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
});

describe('Einwilligung (SCRUM-51)', () => {
  it('warnt nur bei widerrufen', () => {
    expect(isConsentRevoked({ consentStatus: 'revoked' })).toBe(true);
    expect(isConsentRevoked({ consentStatus: 'pending' })).toBe(false);
    expect(isConsentRevoked({ consentStatus: 'granted' })).toBe(false);
    expect(isConsentRevoked(null)).toBe(false);
  });

  it('nennt den Spieler in der Warnung', () => {
    expect(consentRevokedMessage('Ali Adler')).toContain('Ali Adler');
  });
});
