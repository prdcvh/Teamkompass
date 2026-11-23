import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { eventFromDoc } from '../events/event';
import { playerFromDoc } from '../player/player';
import { SquadService } from '../player/squad.service';
import { BLANK_RATING, type Rating } from '../ratings/rating';
import { RsvpService } from '../rsvp/rsvp.service';
import { rsvpAbsenceRating } from '../rsvp/rsvp';
import { addDays, todayIso } from '../shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { setupRecords } from '../testing/records-setup';
import { emptyAbsenceDraft } from './absence';
import { AbsenceSyncService } from './absence-sync.service';
import { OPEN_INJURY_REASON, autoAbsenceRating, keepPastOpenInjury } from './availability';
import { NEUTRAL_ABSENCE_NOTE, ratingWithoutReason } from './health-reasons';

const rating = (overrides: Partial<Rating> = {}): Rating => ({ ...BLANK_RATING, ...overrides });

describe('Gesundheitsgründe in Bewertungen (SCRUM-248)', () => {
  describe('ratingWithoutReason', () => {
    it('erkennt automatisch eingetragene Gründe und lässt nur „Fehlt“ bzw. „Abgesagt“ stehen', () => {
      const auto = rating({ attendance: 'absent', note: 'Verletzt (ca. bis 12.12.2026)', autoAbsence: true });
      expect(ratingWithoutReason(auto)).toEqual({ ...auto, note: 'Fehlt' });
      // Auch nach einer Handänderung (Markierung weg) wird der Grund noch erkannt.
      for (const note of ['Verletzung: Zerrung (bis 01.12.2026)', 'Urlaub (Ende offen)', OPEN_INJURY_REASON, 'Verletzt (ca. bis 12.12.2026)']) {
        expect(ratingWithoutReason(rating({ attendance: 'absent', note }))?.note).toBe('Fehlt');
      }
      const rsvp = rating({ attendance: 'absent', note: 'Abgesagt: krank', rsvpAbsence: true });
      expect(ratingWithoutReason(rsvp)).toEqual({ ...rsvp, note: 'Abgesagt' });
      expect(ratingWithoutReason(rating({ attendance: 'absent', note: 'Abgesagt: krank' }))?.note).toBe('Abgesagt');
    });

    it('lässt neutrale Einträge und Freitext des Trainers in Ruhe', () => {
      expect(ratingWithoutReason(rating({ attendance: 'absent', note: 'Fehlt', autoAbsence: true }))).toBeNull();
      expect(ratingWithoutReason(rating({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true }))).toBeNull();
      expect(ratingWithoutReason(rating({ attendance: 'absent', note: '' }))).toBeNull();
      expect(ratingWithoutReason(rating({ attendance: 'present', note: 'Starkes Spiel (bis 12.12.2026)' }))).toBeNull();
      expect(ratingWithoutReason(rating({ attendance: 'absent', note: 'Hat sich abgemeldet' }))).toBeNull();
    });
  });

  describe('Automatik bei widerrufener Einwilligung', () => {
    it('autoAbsenceRating: neuer Eintrag nur „Fehlt“, ein alter Grund bleibt bis zur Rückfrage stehen', () => {
      expect(autoAbsenceRating(null, NEUTRAL_ABSENCE_NOTE)).toMatchObject({ attendance: 'absent', note: 'Fehlt', autoAbsence: true });
      const old = rating({ attendance: 'absent', note: 'Verletzt (ca. bis 12.12.2026)', autoAbsence: true });
      expect(autoAbsenceRating(old, NEUTRAL_ABSENCE_NOTE)).toBeNull();
      // Abwesenheit vorbei: zurück auf „Offen“ wie bisher.
      expect(autoAbsenceRating(rating({ attendance: 'absent', note: 'Fehlt', autoAbsence: true }), null)).toEqual(BLANK_RATING);
    });

    it('keepPastOpenInjury: „Fehlt“ ohne Grund gilt als Verletzung, außer eine Abwesenheit deckt den Tag', () => {
      const neutral = rating({ attendance: 'absent', note: 'Fehlt', autoAbsence: true });
      expect(keepPastOpenInjury(neutral)).toEqual({ ...neutral, autoAbsence: false });
      expect(keepPastOpenInjury(neutral, true)).toBeNull();
      expect(keepPastOpenInjury(rating({ attendance: 'absent', note: OPEN_INJURY_REASON, autoAbsence: true }), true)?.autoAbsence).toBe(false);
    });

    it('rsvpAbsenceRating: Absage ohne Grund, ein schon markierter Eintrag bleibt stehen', () => {
      const no = { status: 'no' as const, reason: 'krank', by: 'player' as const };
      expect(rsvpAbsenceRating(null, no, { hideReason: true })).toMatchObject({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true });
      expect(rsvpAbsenceRating(rating({ attendance: 'absent', note: 'Abgesagt: krank', rsvpAbsence: true }), no, { hideReason: true })).toBeNull();
      // Zusage danach: wie bisher zurück auf „Offen“.
      expect(rsvpAbsenceRating(rating({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true }), null, { hideReason: true })).toMatchObject({ attendance: 'open', note: '' });
    });
  });

  describe('Dienste', () => {
    const date = addDays(todayIso(), 1);
    const doc = { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: addDays(todayIso(), 10) };

    function trainer(): FakeFirebase {
      const firebase = new FakeFirebase();
      TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
      TestBed.inject(SessionService).role.set('trainer');
      firebase.events.events.set('e1', { type: 'Training', title: 'Training', date });
      return firebase;
    }

    it('AbsenceSyncService: widerrufen → „Fehlt“ ohne Grund; offen → mit Grund wie bisher', async () => {
      const firebase = trainer();
      const sync = TestBed.inject(AbsenceSyncService);
      const event = eventFromDoc('e1', { type: 'Training', title: 'Training', date });
      await sync.reconcileEvent(event, [playerFromDoc('p1', { ...doc, consentStatus: 'revoked' }), playerFromDoc('p2', { ...doc, consentStatus: 'pending' })]);
      expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', note: 'Fehlt', autoAbsence: true });
      expect(firebase.ratings.ratings.get('e1')?.get('p2')?.['note']).toMatch(/^Verletzt \(ca\. bis/);
      expect(sync.lockedSkips()).toEqual([]);
    });

    it('AbsencesService (Profil): neue Abwesenheit bei widerrufener Einwilligung ohne Grund', async () => {
      const { firebase, absences } = await setupRecords();
      await firebase.players.savePlayer('p1', { ...firebase.players.players.get('p1'), consentStatus: 'revoked' });
      await vi.waitFor(() => expect(TestBed.inject(SquadService).players()[0]?.consentStatus).toBe('revoked'));
      absences.saveAbsence({ ...emptyAbsenceDraft(), reason: 'Verletzung', detail: 'Zerrung', from: '2026-10-04', to: '2026-10-10' });
      await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', note: 'Fehlt', autoAbsence: true }));
    });

    it('RsvpService: Absage bei widerrufener Einwilligung → „Abgesagt“ ohne Grund', async () => {
      const firebase = trainer();
      firebase.players.players.set('p1', { ...doc, status: 'Fit', injuryUntil: '', consentStatus: 'revoked' });
      const rsvp = TestBed.inject(RsvpService);
      await vi.waitFor(() => {
        TestBed.tick();
        expect(TestBed.inject(SquadService).load()).toBe('ready');
        expect(rsvp.responsesFor('e1')).toBeDefined();
      });
      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'no', reason: 'krank', by: 'parent' });
      await vi.waitFor(() => expect(firebase.ratings.ratings.get('e1')?.get('p1')).toMatchObject({ attendance: 'absent', note: 'Abgesagt', rsvpAbsence: true }));
    });
  });
});
