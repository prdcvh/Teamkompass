import { TestBed } from '@angular/core/testing';
import { emptyDraft } from './event';
import { EventsService } from './events.service';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('EventsService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.events.set('e1', { type: 'Training', title: 'Training Mo', date: '2026-10-05', intensity: 2 });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(EventsService);
  }

  const draft = (overrides = {}) => ({ ...emptyDraft('2026-10-06'), title: 'Heimspiel', type: 'Spiel' as const, opponent: 'SV Nord', ...overrides });

  describe('importGames (SCRUM-189)', () => {
    const games = (count: number) => Array.from({ length: count }, (_, i) => draft({ title: `Spiel ${i}`, opponent: `Gegner ${i}`, date: '2099-03-01', startTime: '11:00', location: 'Hauptplatz' }));

    it('legt alle Spiele in einem Schreibvorgang an, mit denselben Feldern wie von Hand', async () => {
      const events = setup();
      events.start();
      await vi.waitFor(() => expect(events.load()).toBe('ready'));
      expect(await events.importGames(games(3))).toBe('');
      expect(firebase.calls.filter((c) => c.startsWith('saveEventsBatch'))).toEqual(['saveEventsBatch:3']);
      const created = [...firebase.events.events.values()].filter((data) => data['type'] === 'Spiel');
      expect(created).toHaveLength(3);
      expect(created[0]).toMatchObject({ startTime: '11:00', location: 'Hauptplatz', date: '2099-03-01', matchDuration: 90, pointsEnabled: true, goalsFor: '' });
      // Gleiche Dokumentfelder wie beim einzelnen Speichern.
      events.save(draft({ title: 'Einzeln', opponent: 'Gegner 0', date: '2099-03-01', startTime: '11:00', location: 'Hauptplatz' }));
      await vi.waitFor(() => expect(firebase.calls.some((c) => c.startsWith('saveEvent:'))).toBe(true));
      const single = [...firebase.events.events.values()].find((data) => data['title'] === 'Einzeln')!;
      const strip = (data: Record<string, unknown>) => Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'title' && key !== 'id'));
      expect(strip(single)).toEqual(strip(created[0]));
    });

    it('schreibt nichts, wenn ein Entwurf ungültig ist oder es zu viele sind', async () => {
      const events = setup();
      events.start();
      await vi.waitFor(() => expect(events.load()).toBe('ready'));
      expect(await events.importGames([...games(2), draft({ title: '' })])).toContain('3. Spiel');
      expect(await events.importGames(games(451))).toContain('höchstens 450');
      expect(await events.importGames([])).toContain('nichts');
      expect(firebase.calls.some((c) => c.startsWith('saveEventsBatch'))).toBe(false);
    });

    it('meldet einen Fehler des Schreibvorgangs und legt nichts an', async () => {
      const events = setup();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      events.start();
      await vi.waitFor(() => expect(events.load()).toBe('ready'));
      firebase.events.failBatchNumber = 1;
      expect(await events.importGames(games(2))).toContain('Es wurde nichts angelegt');
      expect(firebase.events.events.size).toBe(1);
      expect(TestBed.inject(SyncService).state()).toBe('error');
    });

    it('erlaubt nur Trainern den Import', async () => {
      const events = setup('physio');
      events.start();
      await vi.waitFor(() => expect(events.load()).toBe('ready'));
      expect(await events.importGames(games(1))).toContain('Nur Trainer');
      expect(firebase.calls.some((c) => c.startsWith('saveEventsBatch'))).toBe(false);
    });
  });
});
