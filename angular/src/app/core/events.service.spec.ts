import { TestBed } from '@angular/core/testing';
import { emptyDraft } from './event';
import { EventsService } from './events.service';
import { FirebaseService } from './firebase.service';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('EventsService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'medical' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.events.set('e1', { type: 'Training', title: 'Training Mo', date: '2026-10-05', intensity: 2 });
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(EventsService);
  }

  const draft = (overrides = {}) => ({ ...emptyDraft('2026-10-06'), title: 'Heimspiel', type: 'Spiel' as const, opponent: 'SV Nord', ...overrides });

  it('lädt die Events in Echtzeit und meldet den Sync-Status', async () => {
    const events = setup();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    expect(events.events().map((e) => e.title)).toEqual(['Training Mo']);
    expect(TestBed.inject(SyncService).state()).toBe('saved');
    firebase.events.set('e2', { type: 'Spiel', title: 'Derby', date: '2026-10-10' });
    firebase.emitEvents();
    expect(events.events()).toHaveLength(2);
  });

  it('startet nur ein Abo, auch bei mehrfachem Aufruf', async () => {
    const events = setup();
    events.start();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    events.start();
    expect(firebase.eventWatchers).toBe(1);
  });

  it('meldet Ladefehler verständlich und erlaubt einen neuen Versuch', async () => {
    const events = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.watchEventsError = { code: 'permission-denied' };
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('error'));
    expect(events.error()).toContain('Die Events konnten nicht geladen werden');
    expect(TestBed.inject(SyncService).state()).toBe('error');
    firebase.watchEventsError = null;
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
  });

  it('speichert ein neues Event mit Präfix-ID und nur Metadaten', async () => {
    const events = setup();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    expect(events.save(draft({ goalsFor: '2', goalsAgainst: '1' }))).toEqual({});
    await vi.waitFor(() => expect(firebase.calls.some((c) => c.startsWith('saveEvent:e'))).toBe(true));
    const saved = [...firebase.events.entries()].find(([, data]) => data['title'] === 'Heimspiel')!;
    expect(saved[0]).toMatch(/^e/);
    expect(saved[1]).toMatchObject({ type: 'Spiel', goalsFor: 2, goalsAgainst: 1, opponent: 'SV Nord' });
    expect(Object.keys(saved[1])).not.toContain('ratings');
    expect(Object.keys(saved[1])).not.toContain('privateNotes');
  });

  it('bearbeitet ein bestehendes Event unter derselben ID', async () => {
    const events = setup();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    expect(events.save({ ...draft(), id: 'e1', type: 'Training', title: 'Training Di' })).toEqual({});
    await vi.waitFor(() => expect(firebase.events.get('e1')?.['title']).toBe('Training Di'));
    expect(firebase.events.size).toBe(1);
  });

  it('schreibt bei ungültigen Eingaben nichts', async () => {
    const events = setup();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    expect(events.save(draft({ title: '' })).title).toBeTruthy();
    expect(firebase.calls.some((c) => c.startsWith('saveEvent'))).toBe(false);
  });

  it('erlaubt anderen Rollen kein Schreiben', async () => {
    const events = setup('medical');
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    expect(events.canWrite()).toBe(false);
    expect(events.save(draft()).title).toContain('Nur Trainer');
    expect(await events.remove('e1')).toBe(false);
    expect(firebase.calls.some((c) => c.startsWith('saveEvent') || c.startsWith('deleteEvent'))).toBe(false);
  });

  it('meldet einen Speicherfehler im Sync-Status', async () => {
    const events = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    firebase.saveEventError = { code: 'unavailable' };
    events.save(draft());
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(TestBed.inject(SyncService).detail()).toContain('Heimspiel');
  });

  it('löscht ein Event und meldet Fehler', async () => {
    const events = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    firebase.deleteEventError = { code: 'unavailable' };
    expect(await events.remove('e1')).toBe(false);
    expect(TestBed.inject(SyncService).state()).toBe('error');
    firebase.deleteEventError = null;
    expect(await events.remove('e1')).toBe(true);
    expect(events.events()).toHaveLength(0);
  });

  it('verwirft Daten und Abo beim Abmelden', async () => {
    const events = setup();
    events.start();
    await vi.waitFor(() => expect(events.load()).toBe('ready'));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(events.events()).toEqual([]);
    expect(events.load()).toBe('idle');
    expect(firebase.eventWatchers).toBe(0);
  });
});
