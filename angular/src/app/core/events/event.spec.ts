import {
  type EventDraft,
  type TeamEvent,
  docFromEvent,
  eventEnd,
  eventStart,
  draftFromEvent,
  emptyDraft,
  eventFromDoc,
  eventFromDraft,
  filterEvents,
  groupByMonth,
  monthLabel,
  resultText,
  sortEvents,
  validateDraft,
} from './event';

describe('event (Logik)', () => {
  const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({ ...emptyDraft('2026-10-06'), title: 'Training Dienstag', ...overrides });
  const event = (overrides: Partial<TeamEvent> = {}): TeamEvent => eventFromDraft(draft(), 'e1') && { ...eventFromDraft(draft(), 'e1'), ...overrides };

  describe('validateDraft', () => {
    it('akzeptiert ein gültiges Training', () => {
      expect(validateDraft(draft())).toEqual({});
    });

    it('verlangt Titel und gültiges Datum und begrenzt die Längen', () => {
      expect(validateDraft(draft({ title: '  ' })).title).toBeTruthy();
      expect(validateDraft(draft({ title: 'x'.repeat(61) })).title).toContain('60');
      expect(validateDraft(draft({ date: '' })).date).toBeTruthy();
      expect(validateDraft(draft({ date: '2026-02-31' })).date).toBeTruthy();
      expect(validateDraft(draft({ location: 'x'.repeat(51) })).location).toContain('50');
      expect(validateDraft(draft({ notes: 'x'.repeat(1001) })).notes).toContain('1000');
      expect(validateDraft(draft({ intensity: 7 })).intensity).toBeTruthy();
    });

    it('prüft Spielfelder nur bei Spielen', () => {
      const bad = { goalsFor: 'abc', goalsAgainst: '100', matchDuration: '0', opponent: 'x'.repeat(51) };
      expect(validateDraft(draft({ type: 'Training', ...bad }))).toEqual({});
      const errors = validateDraft(draft({ type: 'Spiel', ...bad }));
      expect(Object.keys(errors).sort()).toEqual(['goalsAgainst', 'goalsFor', 'matchDuration', 'opponent']);
    });

    it('verlangt beide Tore oder keines', () => {
      expect(validateDraft(draft({ type: 'Spiel', goalsFor: '2', goalsAgainst: '' })).goalsAgainst).toContain('beide');
      expect(validateDraft(draft({ type: 'Spiel', goalsFor: '', goalsAgainst: '1' })).goalsFor).toContain('beide');
      expect(validateDraft(draft({ type: 'Spiel', goalsFor: '', goalsAgainst: '' }))).toEqual({});
      expect(validateDraft(draft({ type: 'Spiel', goalsFor: '0', goalsAgainst: '0' }))).toEqual({});
    });
  });

  describe('Umwandlung', () => {
    it('Training: Spielfelder werden geleert, Fokus bleibt', () => {
      const result = eventFromDraft(draft({ type: 'Training', goalsFor: '3', goalsAgainst: '1', opponent: 'FC Test' }), 'e1');
      expect(result).toMatchObject({ trainingFocus: 'Eigener Ballbesitz', goalsFor: null, goalsAgainst: null, matchDuration: null });
    });

    it('Spiel: Ergebnis und Dauer werden übernommen, Fokus geleert', () => {
      const result = eventFromDraft(draft({ type: 'Spiel', goalsFor: '3', goalsAgainst: '1', matchDuration: '70', opponent: ' FC Test ' }), 'e1');
      expect(result).toMatchObject({ trainingFocus: '', goalsFor: 3, goalsAgainst: 1, matchDuration: 70, opponent: 'FC Test' });
      expect(resultText(result)).toBe('3:1');
    });

    it('schreibt Felder mit den Leerwerten der bisherigen App ("" statt null)', () => {
      expect(docFromEvent(eventFromDraft(draft(), 'e1'))).toMatchObject({ goalsFor: '', goalsAgainst: '', matchDuration: '', id: 'e1' });
      expect(docFromEvent(event({ type: 'Spiel', goalsFor: 2, goalsAgainst: 0, matchDuration: 90 }))).toMatchObject({ goalsFor: 2, goalsAgainst: 0, matchDuration: 90 });
    });

    it('liest ältere und unvollständige Dokumente', () => {
      const parsed = eventFromDoc('x', { type: 'Spiel', title: 'Derby', date: '2026-10-10', goalsFor: '2', goalsAgainst: '', matchDuration: '', intensity: '3' });
      expect(parsed).toMatchObject({ type: 'Spiel', title: 'Derby', goalsFor: 2, goalsAgainst: null, matchDuration: 90, intensity: 3 });
      const bare = eventFromDoc('y', {});
      expect(bare).toMatchObject({ type: 'Training', title: '', intensity: 2, trainingFocus: 'Eigener Ballbesitz', goalsFor: null });
      expect(resultText(parsed)).toBe('');
    });

    it('Bearbeiten-Entwurf bildet das Event ab', () => {
      const game = event({ type: 'Spiel', goalsFor: 1, goalsAgainst: 1, matchDuration: 80, opponent: 'SV Nord' });
      expect(draftFromEvent(game)).toMatchObject({ id: 'e1', type: 'Spiel', goalsFor: '1', goalsAgainst: '1', matchDuration: '80', opponent: 'SV Nord' });
      expect(draftFromEvent(event()).goalsFor).toBe('');
    });
  });

  describe('Startzeit, Dauer und Ortskoordinaten (SCRUM-95)', () => {
    const coords = { lat: 50.1833, lon: 8.4667, name: 'Königstein im Taunus' };

    it('prüft Uhrzeit HH:MM', () => {
      expect(validateDraft(draft({ startTime: '' }))).toEqual({});
      expect(validateDraft(draft({ startTime: '18:30' }))).toEqual({});
      expect(validateDraft(draft({ startTime: '00:00' }))).toEqual({});
      for (const bad of ['24:00', '9:30', '18:60', 'abc', '18:3']) {
        expect(validateDraft(draft({ startTime: bad })).startTime).toBeTruthy();
      }
    });

    it('prüft die Trainingsdauer (1–300) nur bei Training', () => {
      expect(validateDraft(draft({ durationMinutes: '' }))).toEqual({});
      expect(validateDraft(draft({ durationMinutes: '1' }))).toEqual({});
      expect(validateDraft(draft({ durationMinutes: '300' }))).toEqual({});
      for (const bad of ['0', '301', '-5', '1.5', 'abc']) {
        expect(validateDraft(draft({ durationMinutes: bad })).durationMinutes).toBeTruthy();
      }
      expect(validateDraft(draft({ type: 'Spiel', durationMinutes: '999' })).durationMinutes).toBeUndefined();
    });

    it('prüft den Bereich der Koordinaten', () => {
      expect(validateDraft(draft({ locationCoords: coords }))).toEqual({});
      expect(validateDraft(draft({ locationCoords: { ...coords, lat: 91 } })).locationCoords).toBeTruthy();
      expect(validateDraft(draft({ locationCoords: { ...coords, lon: -181 } })).locationCoords).toBeTruthy();
      expect(validateDraft(draft({ locationCoords: { ...coords, lat: Number.NaN } })).locationCoords).toBeTruthy();
    });

    it('Entwurf → Event → Dokument → Event bewahrt die Werte', () => {
      const training = eventFromDraft(draft({ startTime: '18:00', durationMinutes: '90', locationCoords: coords }), 'e1');
      expect(training).toMatchObject({ startTime: '18:00', durationMinutes: 90, locationCoords: coords });
      const doc = docFromEvent(training);
      expect(doc).toMatchObject({ startTime: '18:00', durationMinutes: 90, locationCoords: coords });
      expect(eventFromDoc('e1', doc)).toEqual(training);
      expect(draftFromEvent(training)).toMatchObject({ startTime: '18:00', durationMinutes: '90', locationCoords: coords });
    });

    it('Spiel nutzt matchDuration, keine Trainingsdauer', () => {
      const game = eventFromDraft(draft({ type: 'Spiel', startTime: '10:30', durationMinutes: '90', matchDuration: '70' }), 'e2');
      expect(game).toMatchObject({ startTime: '10:30', durationMinutes: null, matchDuration: 70 });
    });

    it('ältere Dokumente liefern null-Werte ohne Fehler und werden mit Leerwerten geschrieben', () => {
      const old = eventFromDoc('x', { type: 'Training', title: 'Alt', date: '2026-10-01' });
      expect(old).toMatchObject({ startTime: null, durationMinutes: null, locationCoords: null });
      expect(docFromEvent(old)).toMatchObject({ startTime: '', durationMinutes: '', locationCoords: null });
    });

    it('ignoriert ungültige gespeicherte Werte', () => {
      const parsed = eventFromDoc('x', { startTime: '25:99', durationMinutes: 999, locationCoords: { lat: 200, lon: 1, name: 'x' } });
      expect(parsed).toMatchObject({ startTime: null, durationMinutes: null, locationCoords: null });
      expect(eventFromDoc('y', { startTime: 5, durationMinutes: 'abc', locationCoords: 'Platz' })).toMatchObject({ startTime: null, durationMinutes: null, locationCoords: null });
    });

    describe('eventEnd', () => {
      it('Training: Start + Dauer (Sommerzeit, UTC+2)', () => {
        const e = event({ date: '2026-10-06', startTime: '18:00', durationMinutes: 90 });
        expect(eventStart(e)?.toISOString()).toBe('2026-10-06T16:00:00.000Z');
        expect(eventEnd(e)?.toISOString()).toBe('2026-10-06T17:30:00.000Z');
      });

      it('Winterzeit (UTC+1)', () => {
        expect(eventEnd(event({ date: '2026-12-01', startTime: '18:00', durationMinutes: 60 }))?.toISOString()).toBe('2026-12-01T18:00:00.000Z');
      });

      it('Tage der Zeitumstellung', () => {
        expect(eventStart(event({ date: '2026-10-25', startTime: '10:00', durationMinutes: 60 }))?.toISOString()).toBe('2026-10-25T09:00:00.000Z');
        expect(eventStart(event({ date: '2026-03-29', startTime: '10:00', durationMinutes: 60 }))?.toISOString()).toBe('2026-03-29T08:00:00.000Z');
      });

      it('Spiel: Start + matchDuration', () => {
        const e = event({ type: 'Spiel', date: '2026-10-10', startTime: '11:00', matchDuration: 70, durationMinutes: null });
        expect(eventEnd(e)?.toISOString()).toBe('2026-10-10T10:10:00.000Z');
      });

      it('null, wenn Zeit oder Dauer fehlen', () => {
        expect(eventEnd(event({ startTime: null, durationMinutes: 90 }))).toBeNull();
        expect(eventEnd(event({ startTime: '18:00', durationMinutes: null }))).toBeNull();
        expect(eventEnd(event({ type: 'Spiel', startTime: '18:00', matchDuration: null }))).toBeNull();
        expect(eventEnd(event({ date: '', startTime: '18:00', durationMinutes: 90 }))).toBeNull();
        expect(eventEnd(event({ startTime: 'x', durationMinutes: 90 }))).toBeNull();
      });
    });
  });

  describe('Liste', () => {
    const list = [
      event({ id: 'a', title: 'Heimspiel', type: 'Spiel', date: '2026-10-10', opponent: 'SV Nord' }),
      event({ id: 'b', title: 'Training Mo', date: '2026-10-05', location: 'Kunstrasen' }),
      event({ id: 'c', title: 'Training Mi', date: '2026-09-30' }),
    ];

    it('filtert nach Typ und Suche in Titel, Gegner und Ort', () => {
      expect(filterEvents(list, { query: '', type: 'Spiel' }).map((e) => e.id)).toEqual(['a']);
      expect(filterEvents(list, { query: 'nord', type: 'all' }).map((e) => e.id)).toEqual(['a']);
      expect(filterEvents(list, { query: 'KUNST', type: 'all' }).map((e) => e.id)).toEqual(['b']);
      expect(filterEvents(list, { query: 'zzz', type: 'all' })).toEqual([]);
    });

    it('sortiert nach Datum und gruppiert nach Monat', () => {
      expect(sortEvents(list, 'date-desc').map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(sortEvents(list, 'date-asc').map((e) => e.id)).toEqual(['c', 'b', 'a']);
      const months = groupByMonth(sortEvents(list, 'date-desc'));
      expect(months.map((m) => [m.label, m.events.length])).toEqual([
        ['Oktober 2026', 2],
        ['September 2026', 1],
      ]);
      expect(monthLabel('')).toBe('Ohne Datum');
    });
  });
});
