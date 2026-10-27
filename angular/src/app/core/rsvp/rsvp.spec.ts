import { BLANK_RATING, type Rating, applyChange, docFromRating, ratingFromDoc } from '../ratings/rating';
import { eventFromDoc } from '../events/event';
import {
  type EventResponses,
  type RsvpResponse,
  buildRsvpResponse,
  responseFromDoc,
  responseKey,
  rsvpAbsenceNote,
  rsvpAbsenceRating,
  rsvpCounts,
  rsvpCountsText,
  rsvpEventIds,
  rsvpReason,
  upcomingRsvpEvents,
} from './rsvp';

const no = (reason = ''): RsvpResponse => ({ status: 'no', reason, by: 'player' });
const yes: RsvpResponse = { status: 'yes', reason: '', by: 'parent' };
const rating = (overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, ...overrides });

describe('Zu-/Absagen (SCRUM-205, gleiche Regeln wie SCRUM-175)', () => {
  describe('Absage → „Fehlt“', () => {
    it('belegt eine fehlende oder unbearbeitete Bewertung mit „Fehlt“ und markiert sie', () => {
      expect(rsvpAbsenceRating(null, no('Familienfeier'))).toEqual({ ...BLANK_RATING, attendance: 'absent', note: 'Abgesagt: Familienfeier', rsvpAbsence: true });
      expect(rsvpAbsenceRating(rating(), no())).toEqual({ ...BLANK_RATING, attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true });
    });

    it('lässt von Hand gesetzte Anwesenheit, Noten und Notizen stehen', () => {
      expect(rsvpAbsenceRating(rating({ attendance: 'present' }), no())).toBeNull();
      expect(rsvpAbsenceRating(rating({ effort: 2 }), no())).toBeNull();
      expect(rsvpAbsenceRating(rating({ note: 'Gut gemacht' }), no())).toBeNull();
      expect(rsvpAbsenceRating(rating({ attendance: 'absent', note: 'Krank gemeldet' }), no())).toBeNull();
    });

    it('überschreibt keine Abwesenheit, die die Abwesenheits-Automatik gesetzt hat (Verletzung hat Vorrang)', () => {
      expect(rsvpAbsenceRating(rating({ attendance: 'absent', note: 'Verletzt (ca. bis 01.11.2026)', autoAbsence: true }), no())).toBeNull();
    });

    it('aktualisiert bei einem markierten Eintrag nur den Grund; unverändert = nichts zu schreiben', () => {
      const marked = rating({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true });
      expect(rsvpAbsenceRating(marked, no('Schule'))).toEqual({ ...marked, note: 'Abgesagt: Schule' });
      expect(rsvpAbsenceRating(marked, no())).toBeNull();
    });
  });

  describe('Zusage nach Absage → „Offen“', () => {
    it('setzt nur einen von einer Absage gesetzten, unbearbeiteten Eintrag zurück', () => {
      const marked = rating({ attendance: 'absent', note: 'Abgesagt: Schule', rsvpAbsence: true });
      expect(rsvpAbsenceRating(marked, yes)).toEqual({ ...BLANK_RATING, rsvpAbsence: false });
      // Rückmeldung gelöscht (z. B. vom Trainer): ebenso zurück auf „Offen“.
      expect(rsvpAbsenceRating(marked, null)).toEqual({ ...BLANK_RATING, rsvpAbsence: false });
    });

    it('lässt alles ohne Markierung stehen – auch ein von Hand gesetztes „Fehlt“', () => {
      expect(rsvpAbsenceRating(null, yes)).toBeNull();
      expect(rsvpAbsenceRating(rating({ attendance: 'absent', note: 'Abgesagt' }), yes)).toBeNull();
      expect(rsvpAbsenceRating(rating({ attendance: 'present', effort: 2 }), yes)).toBeNull();
    });

    it('eine Handänderung nimmt die Markierung weg; danach setzt eine Zusage nichts mehr zurück', () => {
      const marked = rating({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true });
      const { rating: edited, clearedAuto } = applyChange(marked, 'note', 'Hat abgesagt, kommt später', 90);
      expect(clearedAuto).toBe(true);
      expect(edited.rsvpAbsence).toBe(false);
      expect(docFromRating(edited, { clearAuto: clearedAuto })).toMatchObject({ rsvpAbsence: false, autoAbsence: false });
      expect(rsvpAbsenceRating(edited, yes)).toBeNull();
    });
  });

  describe('Bewertungsdokument (gleich wie die bisherige App)', () => {
    it('liest und schreibt die Markierung rsvpAbsence; ohne Markierung kommt das Feld gar nicht vor', () => {
      expect(ratingFromDoc({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true }).rsvpAbsence).toBe(true);
      expect('rsvpAbsence' in ratingFromDoc({ attendance: 'absent' })).toBe(false);
      expect(docFromRating(rating({ attendance: 'absent', rsvpAbsence: true }))).toMatchObject({ rsvpAbsence: true });
      expect(docFromRating(rating({ rsvpAbsence: false }))).toMatchObject({ rsvpAbsence: false });
      expect('rsvpAbsence' in docFromRating(rating())).toBe(false);
      expect('rsvpAbsence' in applyChange(rating(), 'effort', '2', 90).rating).toBe(false);
    });
  });

  describe('Zählung zugesagt/abgesagt/offen', () => {
    const players = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];

    it('zählt je Spieler des Kaders; ohne Rückmeldung = offen', () => {
      const responses: EventResponses = new Map([
        ['p1', yes],
        ['p2', no('Schule')],
        ['p3', yes],
      ]);
      expect(rsvpCounts(responses, players)).toEqual({ yes: 2, no: 1, open: 1 });
      expect(rsvpCountsText(rsvpCounts(responses, players))).toBe('2 zugesagt · 1 abgesagt · 1 offen');
    });

    it('Rückmeldungen gelöschter Spieler zählen nicht; ohne geladene Rückmeldungen ist alles offen', () => {
      expect(rsvpCounts(new Map([['weg', yes]]), players)).toEqual({ yes: 0, no: 0, open: 4 });
      expect(rsvpCounts(undefined, players)).toEqual({ yes: 0, no: 0, open: 4 });
    });
  });

  describe('Dokument der Rückmeldung (Regeln aus SCRUM-175)', () => {
    it('baut genau die erlaubten Felder; Grund nur bei Absage, bereinigt und gekürzt', () => {
      expect(buildRsvpResponse('p1', 'no', '  Familien\n feier ', 'player')).toEqual({ playerId: 'p1', status: 'no', reason: 'Familien feier', by: 'player' });
      expect(buildRsvpResponse('p1', 'yes', 'egal', 'parent')).toEqual({ playerId: 'p1', status: 'yes', reason: '', by: 'parent' });
      expect(buildRsvpResponse('p1', 'no', 'x'.repeat(300), 'player')?.reason).toHaveLength(200);
    });

    it('nur Spieler und Eltern mit verknüpftem Spieler, nur zu/ab', () => {
      expect(buildRsvpResponse('p1', 'yes', '', 'trainer')).toBeNull();
      expect(buildRsvpResponse('p1', 'yes', '', 'physio')).toBeNull();
      expect(buildRsvpResponse('p1', 'yes', '', 'scout')).toBeNull();
      expect(buildRsvpResponse(null, 'yes', '', 'player')).toBeNull();
      expect(buildRsvpResponse('p1', 'maybe', '', 'player')).toBeNull();
    });

    it('liest Dokumente der bisherigen App', () => {
      expect(responseFromDoc({ playerId: 'p1', status: 'no', reason: 'Schule', by: 'parent', updatedAt: {} })).toEqual({ status: 'no', reason: 'Schule', by: 'parent' });
      expect(responseFromDoc({ status: 'vielleicht' })).toBeNull();
      expect(responseFromDoc(null)).toBeNull();
    });

    it('Notiz und Kennung', () => {
      expect(rsvpAbsenceNote(no())).toBe('Abgesagt');
      expect(rsvpAbsenceNote(no('Schule'))).toBe('Abgesagt: Schule');
      expect(rsvpReason('  a   b ')).toBe('a b');
      expect(responseKey(null)).toBe('open');
      expect(responseKey(yes)).toBe('yes');
      expect(responseKey(no('Schule'))).toBe('no|Schule');
    });
  });

  describe('Welche Termine', () => {
    const events = [
      eventFromDoc('alt', { type: 'Training', title: 'Alt', date: '2026-10-01' }),
      eventFromDoc('vor10', { type: 'Training', title: 'Vor 10 Tagen', date: '2026-10-16' }),
      eventFromDoc('heute', { type: 'Spiel', title: 'Heute', date: '2026-10-26', startTime: '18:00' }),
      eventFromDoc('heute-frueh', { type: 'Training', title: 'Heute früh', date: '2026-10-26', startTime: '09:00' }),
      eventFromDoc('morgen', { type: 'Training', title: 'Morgen', date: '2026-10-27' }),
    ];

    it('Spieler/Eltern: heute und später, chronologisch, höchstens die nächsten 10', () => {
      expect(upcomingRsvpEvents(events, '2026-10-26').map((event) => event.id)).toEqual(['heute-frueh', 'heute', 'morgen']);
      expect(upcomingRsvpEvents(events, '2026-10-26', 2)).toHaveLength(2);
    });

    it('Trainer: auch die der letzten 14 Tage (späte Absagen)', () => {
      expect(rsvpEventIds(events, '2026-10-26', 14)).toEqual(['vor10', 'heute', 'heute-frueh', 'morgen']);
      expect(rsvpEventIds(events, '2026-10-26')).toEqual(['heute', 'heute-frueh', 'morgen']);
    });
  });
});
