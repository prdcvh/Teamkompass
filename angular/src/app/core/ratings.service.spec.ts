import { TestBed } from '@angular/core/testing';
import { EventsService } from './events.service';
import { FirebaseService } from './firebase.service';
import { RatingsService } from './ratings.service';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('RatingsService', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'medical' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.set('e1', { type: 'Spiel', title: 'Heimspiel', date: '2026-10-10', matchDuration: 70 });
    firebase.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, grade: 2, minutes: 70, goals: '', assists: '', note: 'Gut', playerId: 'p1' }]]));
    firebase.privateNotes.set('e1', new Map([['p1', { playerId: 'p1', note: 'Nur für uns' }]]));
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    const events = TestBed.inject(EventsService);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    return TestBed.inject(RatingsService);
  }

  it('lädt Bewertungen und interne Notizen des Events in Echtzeit', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(ratings.event()?.title).toBe('Heimspiel');
    expect(ratings.matchDuration()).toBe(70);
    expect(ratings.ratingFor('p1')).toMatchObject({ attendance: 'present', effort: 2, minutes: 70, note: 'Gut' });
    expect(ratings.ratingFor('unbekannt').attendance).toBe('open');
    expect(ratings.noteFor('p1')).toBe('Nur für uns');
    expect(TestBed.inject(SyncService).state()).toBe('saved');
  });

  it('startet bei erneutem Aufruf für dasselbe Event nicht doppelt, bei einem anderen Event neu', async () => {
    const ratings = await setup();
    ratings.start('e1');
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(firebase.ratingWatchers).toBe(2); // Bewertungen + interne Notizen, je ein Abo
    ratings.start('e2');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(firebase.ratingWatchers).toBe(2);
    expect(firebase.calls).toContain('watchRatings:e2');
    expect(ratings.ratingFor('p1').attendance).toBe('open');
  });

  it('fragt interne Notizen für Nicht-Trainer gar nicht erst ab', async () => {
    const ratings = await setup('medical');
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(firebase.calls.some((call) => call.startsWith('watchPrivateNotes'))).toBe(false);
    expect(ratings.noteFor('p1')).toBe('');
    expect(ratings.setField('p1', 'effort', '1')).toBe(false);
    expect(ratings.setPrivateNote('p1', 'x')).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('saveRating') || call.startsWith('savePrivateNote'))).toBe(false);
  });

  it('speichert eine Änderung sofort lokal und mit berechneter Gesamtnote', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(ratings.setField('p2', 'attendance', 'present')).toBe(true);
    expect(ratings.ratingFor('p2').attendance).toBe('present');
    for (const [field, value] of [['effort', '1'], ['technique', '2'], ['tactics', '3'], ['comprehension', '4']] as const) ratings.setField('p2', field, value);
    await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p2')?.['grade']).toBe(2.3));
    expect(firebase.ratings.get('e1')?.get('p2')).toMatchObject({ playerId: 'p2', attendance: 'present', effort: 1, technique: 2, tactics: 3, comprehension: 4 });
  });

  it('schnelle aufeinanderfolgende Änderungen am selben Spieler überschreiben sich nicht', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    ratings.setField('p3', 'effort', '1');
    ratings.setField('p3', 'technique', '2');
    ratings.setField('p3', 'goals', '1');
    expect(ratings.ratingFor('p3')).toMatchObject({ effort: 1, technique: 2, goals: 1 });
  });

  it('begrenzt Minuten auf die Spieldauer des Events', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    ratings.setField('p1', 'minutes', '120');
    expect(ratings.ratingFor('p1').minutes).toBe(70);
  });

  it('schreibt interne Notizen nur in den privaten Pfad, nie in die Bewertung', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    expect(ratings.setPrivateNote('p1', 'Vertraulich')).toBe(true);
    await vi.waitFor(() => expect(firebase.privateNotes.get('e1')?.get('p1')?.['note']).toBe('Vertraulich'));
    expect(JSON.stringify([...(firebase.ratings.get('e1')?.values() ?? [])])).not.toContain('Vertraulich');
    expect(ratings.setPrivateNote('p1', 'Vertraulich')).toBe(false);
  });

  it('nimmt bei einer Handänderung die Abwesenheits-Markierung zurück', async () => {
    const ratings = await setup();
    firebase.ratings.get('e1')?.set('p9', { attendance: 'absent', note: 'Verletzt', autoAbsence: true, playerId: 'p9' });
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    ratings.setField('p9', 'note', 'Doch krank');
    await vi.waitFor(() => expect(firebase.ratings.get('e1')?.get('p9')?.['autoAbsence']).toBe(false));
  });

  it('meldet Lade- und Speicherfehler', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ratings = await setup();
    firebase.watchRatingsError = { code: 'permission-denied' };
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('error'));
    expect(ratings.error()).toContain('Die Bewertungen konnten nicht geladen werden');
    firebase.watchRatingsError = null;
    ratings.stop();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    TestBed.inject(SyncService).clearError();

    firebase.saveRatingError = { code: 'unavailable' };
    ratings.setField('p1', 'effort', '3');
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(TestBed.inject(SyncService).detail()).toContain('Bewertung konnte nicht gespeichert werden');
  });

  it('verwirft Daten und Abos beim Abmelden', async () => {
    const ratings = await setup();
    ratings.start('e1');
    await vi.waitFor(() => expect(ratings.load()).toBe('ready'));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(ratings.load()).toBe('idle');
    expect(ratings.ratingFor('p1').attendance).toBe('open');
    expect(firebase.ratingWatchers).toBe(0);
  });
});
