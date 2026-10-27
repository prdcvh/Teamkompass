import { TestBed } from '@angular/core/testing';
import type { Role } from '../auth/role';
import { SessionService } from '../auth/session.service';
import { EventsService } from '../events/events.service';
import { SquadService } from '../player/squad.service';
import { addDays, todayIso } from '../shared/dates';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { RsvpService } from './rsvp.service';

describe('RsvpService (SCRUM-205)', () => {
  let firebase: FakeFirebase;
  const today = todayIso();
  const tomorrow = addDays(today, 1);

  async function setup(role: Role, playerId: string | null = null) {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Jonas Keller', positions: ['TW'], number: 1, birthdate: '2012-05-05', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Mia Berg', positions: ['ST'], number: 9, birthdate: '2012-03-03', status: 'Fit' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training morgen', date: tomorrow });
    firebase.events.events.set('alt', { type: 'Training', title: 'Lange her', date: addDays(today, -40) });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    const rsvp = TestBed.inject(RsvpService);
    TestBed.tick();
    // Medizin und Scouts: der Dienst startet nichts (auch keine Eventliste).
    if (role === 'physio' || role === 'scout') expect(TestBed.inject(EventsService).load()).toBe('idle');
    else await vi.waitFor(() => expect(TestBed.inject(EventsService).load()).toBe('ready'));
    return rsvp;
  }

  async function trainerReady() {
    const rsvp = await setup('trainer');
    await vi.waitFor(() => {
      TestBed.tick();
      expect(TestBed.inject(SquadService).load()).toBe('ready');
      expect(rsvp.responsesFor('e1')).toBeDefined();
    });
    return rsvp;
  }

  const rating = (playerId: string, eventId = 'e1') => firebase.ratings.ratings.get(eventId)?.get(playerId);

  describe('Spieler und Eltern', () => {
    it('liest nur die eigene Rückmeldung zu kommenden Terminen und speichert Zu-/Absagen', async () => {
      const rsvp = await setup('player', 'p1');
      await vi.waitFor(() => expect(firebase.calls).toContain('watchOwnResponse:e1:p1'));
      expect(firebase.calls.some((call) => call.startsWith('watchResponses'))).toBe(false); // nie die ganze Liste
      expect(firebase.calls).not.toContain('watchOwnResponse:alt:p1'); // vergangener Termin
      expect(rsvp.upcoming().map((event) => event.id)).toEqual(['e1']);

      expect(await rsvp.answer('e1', 'no', ' Familienfeier ')).toBe(true);
      expect(firebase.rsvp.responses.get('e1')?.get('p1')).toEqual({ playerId: 'p1', status: 'no', reason: 'Familienfeier', by: 'player', updatedAt: 'server-time' });
      await vi.waitFor(() => expect(rsvp.own('e1')).toEqual({ status: 'no', reason: 'Familienfeier', by: 'player' }));

      expect(await rsvp.answer('e1', 'yes', 'wird ignoriert')).toBe(true);
      expect(firebase.rsvp.responses.get('e1')?.get('p1')).toMatchObject({ status: 'yes', reason: '' });
      // Spieler schreiben nie Bewertungen (das macht der Trainer-Client).
      expect(firebase.calls.some((call) => call.startsWith('saveRating'))).toBe(false);
    });

    it('Eltern antworten für das eigene Kind (by = parent); vergangene Termine sind gesperrt', async () => {
      const rsvp = await setup('parent', 'p2');
      expect(await rsvp.answer('e1', 'no', 'Schule')).toBe(true);
      expect(firebase.rsvp.responses.get('e1')?.get('p2')).toMatchObject({ playerId: 'p2', by: 'parent' });
      expect(await rsvp.answer('alt', 'no', '')).toBe(false);
      expect(firebase.rsvp.responses.get('alt')).toBeUndefined();
    });

    it('meldet einen Fehler beim Speichern verständlich', async () => {
      const rsvp = await setup('player', 'p1');
      firebase.rsvp.saveError = { code: 'permission-denied' };
      expect(await rsvp.answer('e1', 'yes', '')).toBe(false);
      expect(rsvp.error()).toContain('Rückmeldung konnte nicht gespeichert werden.');
    });

    it('Medizin und Scouts lesen keine Rückmeldungen und können nicht antworten', async () => {
      for (const role of ['physio', 'scout'] as const) {
        TestBed.resetTestingModule();
        const rsvp = await setup(role);
        expect(rsvp.canAnswer()).toBe(false);
        expect(await rsvp.answer('e1', 'yes', '')).toBe(false);
        expect(firebase.calls.some((call) => call.includes('Response'))).toBe(false);
      }
    });
  });

  describe('Trainer', () => {
    it('liest alle Rückmeldungen kommender und kürzlich vergangener Termine', async () => {
      await trainerReady();
      expect(firebase.calls).toContain('watchResponses:e1');
      expect(firebase.calls).not.toContain('watchResponses:alt'); // älter als 14 Tage
    });

    it('Absage → „Fehlt“, Zusage nach Absage → zurück auf „Offen“', async () => {
      const rsvp = await trainerReady();
      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'no', reason: 'Familienfeier', by: 'parent' });
      await vi.waitFor(() => expect(rating('p1')).toMatchObject({ attendance: 'absent', note: 'Abgesagt: Familienfeier', rsvpAbsence: true }));
      expect(rsvp.responsesFor('e1')?.get('p1')?.status).toBe('no');

      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'yes', reason: '', by: 'parent' });
      await vi.waitFor(() => expect(rating('p1')).toMatchObject({ attendance: 'open', note: '', rsvpAbsence: false }));
      expect(rating('p2')).toBeUndefined(); // ohne Rückmeldung wird nichts angelegt
    });

    it('eine Zusage setzt ein von Hand gesetztes oder bearbeitetes „Fehlt“ nicht zurück', async () => {
      await trainerReady();
      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'no', reason: '', by: 'player' });
      await vi.waitFor(() => expect(rating('p1')).toMatchObject({ attendance: 'absent', rsvpAbsence: true }));
      // Der Trainer ändert die Bewertung von Hand (wie RatingsService.setField): die Markierung fällt weg.
      await firebase.ratings.saveRating('e1', 'p1', { ...rating('p1'), note: 'Abgemeldet beim Trainer', rsvpAbsence: false, autoAbsence: false });
      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'yes', reason: '', by: 'player' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rating('p1')).toMatchObject({ attendance: 'absent', note: 'Abgemeldet beim Trainer', rsvpAbsence: false });
    });

    it('eine Absage überschreibt keine schon erfasste Bewertung', async () => {
      await trainerReady();
      await firebase.ratings.saveRating('e1', 'p2', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2 });
      firebase.rsvp.set('e1', 'p2', { playerId: 'p2', status: 'no', reason: 'krank', by: 'player' });
      await vi.waitFor(() => expect(firebase.calls).toContain('readRatingDoc:e1:p2'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rating('p2')).toMatchObject({ attendance: 'present', effort: 2 });
    });

    it('liest eine Bewertung nur, wenn sich die Rückmeldung geändert hat', async () => {
      await trainerReady();
      firebase.rsvp.set('e1', 'p1', { playerId: 'p1', status: 'no', reason: '', by: 'player' });
      await vi.waitFor(() => expect(rating('p1')).toMatchObject({ attendance: 'absent' }));
      const reads = () => firebase.calls.filter((call) => call === 'readRatingDoc:e1:p1').length;
      const before = reads();
      firebase.rsvp.set('e1', 'p2', { playerId: 'p2', status: 'yes', reason: '', by: 'player' }); // anderer Spieler
      await vi.waitFor(() => expect(firebase.calls).toContain('readRatingDoc:e1:p2'));
      expect(reads()).toBe(before);
    });
  });
});
