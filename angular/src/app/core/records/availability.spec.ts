import type { Player } from '../player/player';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import type { Absence } from './absence';
import { autoAbsenceRating, effectiveStatus, unavailabilityReason } from './availability';

describe('Verfügbarkeit', () => {
  const player = (overrides: Partial<Player> = {}): Player => ({
    id: 'p1', name: 'Test', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit', injuryUntil: '', consentStatus: 'granted', consentDate: '', ...overrides,
  });
  const absence = (overrides: Partial<Absence> = {}): Absence => ({ id: 'a1', kind: 'absence', label: 'Urlaub', detail: '', from: '2026-10-05', to: '2026-10-12', ...overrides });

  it('Nicht-Verfügbarkeit: Status „Verletzt“ mit Datum oder eingetragene Abwesenheit', () => {
    expect(unavailabilityReason(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [], '2026-10-10')).toBe('Verletzt (ca. bis 20.10.2026)');
    expect(unavailabilityReason(player({ status: 'Verletzt', injuryUntil: '2026-10-20' }), [], '2026-10-21')).toBeNull();
    expect(unavailabilityReason(player(), [absence()], '2026-10-06')).toBe('Urlaub (bis 12.10.2026)');
    expect(unavailabilityReason(player(), [absence({ kind: 'injury', label: 'Verletzung', to: '' })], '2026-10-06')).toBe('Verletzung (Ende offen)');
    expect(unavailabilityReason(player(), [], '2026-10-06')).toBeNull();
  });

  it('Anzeige-Status: laufende Abwesenheit überlagert den Status', () => {
    expect(effectiveStatus(player(), [], '2026-10-06')).toBe('Fit');
    expect(effectiveStatus(player(), [absence()], '2026-10-06')).toBe('Abwesend');
    expect(effectiveStatus(player(), [absence({ label: 'Sperre (3 Spiele)' })], '2026-10-06')).toBe('Gesperrt');
    expect(effectiveStatus(player(), [absence({ kind: 'injury', label: 'Verletzung' })], '2026-10-06')).toBe('Verletzt');
    expect(effectiveStatus(player({ status: 'Pause' }), [absence()], '2026-11-01')).toBe('Pause');
  });

  describe('Abwesenheits-Automatik (SCRUM-18)', () => {
    const REASON = 'Urlaub (bis 12.10.2026)';
    const manual = (overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, ...overrides });

    it('vorwärts: setzt nur komplett unbearbeitete Bewertungen auf „Fehlt“ und markiert sie', () => {
      expect(autoAbsenceRating(null, REASON)).toEqual({ ...BLANK_RATING, attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(manual(), REASON)).toMatchObject({ attendance: 'absent', autoAbsence: true });
    });

    it('lässt manuell gesetzte Anwesenheit sowie Teilnoten und Notizen unangetastet', () => {
      expect(autoAbsenceRating(manual({ attendance: 'present' }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ effort: 2 }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ note: 'Hat sich gemeldet' }), REASON)).toBeNull();
      expect(autoAbsenceRating(manual({ goals: 1 }), REASON)).toBeNull();
    });

    it('ohne Grund passiert bei nicht markierten Bewertungen nichts', () => {
      expect(autoAbsenceRating(null, null)).toBeNull();
      expect(autoAbsenceRating(manual(), null)).toBeNull();
      expect(autoAbsenceRating(manual({ attendance: 'absent', note: REASON }), null)).toBeNull();
    });

    it('rückwärts: gelöschte Abwesenheit setzt den markierten Eintrag zurück auf leer', () => {
      const auto = manual({ attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(auto, null)).toEqual({ ...BLANK_RATING });
    });

    it('verkürzt/geändert: gleicher Grund = keine Änderung, anderer Grund = neue Notiz', () => {
      const auto = manual({ attendance: 'absent', note: REASON, autoAbsence: true });
      expect(autoAbsenceRating(auto, REASON)).toBeNull();
      expect(autoAbsenceRating(auto, 'Urlaub (bis 10.10.2026)')).toMatchObject({ attendance: 'absent', note: 'Urlaub (bis 10.10.2026)', autoAbsence: true });
    });

    it('eine von Hand geänderte Bewertung (Markierung weg) wird nie wieder zurückgesetzt', () => {
      const edited = manual({ attendance: 'absent', note: REASON, autoAbsence: false });
      expect(autoAbsenceRating(edited, null)).toBeNull();
    });
  });
});
