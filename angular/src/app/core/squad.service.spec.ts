import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase.service';
import { emptyDraft } from './player';
import { SessionService } from './session.service';
import { SquadService } from './squad.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('SquadService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'medical' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(SquadService);
  }

  const draft = (overrides = {}) => ({ ...emptyDraft([]), name: 'Neu Neumann', positions: ['IV'], birthdate: '2012-01-01', number: '4', ...overrides });

  it('lädt den Kader in Echtzeit und meldet den Sync-Status', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.players().map((p) => p.name)).toEqual(['Ali Adler']);
    expect(TestBed.inject(SyncService).state()).toBe('saved');

    firebase.players.set('p2', { name: 'Zoe Zander', positions: ['TW'], number: 1, birthdate: '2013-01-01' });
    firebase.emitPlayers();
    expect(squad.players()).toHaveLength(2);
  });

  it('startet nur ein Abo, auch bei mehrfachem Aufruf', async () => {
    const squad = setup();
    squad.start();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    squad.start();
    expect(firebase.playerWatchers).toBe(1);
  });

  it('zeigt Offline- und Wartezustand aus dem Snapshot', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    const sync = TestBed.inject(SyncService);
    firebase.emitPlayers({ fromCache: true, hasPendingWrites: false });
    expect(sync.state()).toBe('offline');
    firebase.emitPlayers({ fromCache: false, hasPendingWrites: true });
    expect(sync.state()).toBe('syncing');
    firebase.emitPlayers({ fromCache: false, hasPendingWrites: false });
    expect(sync.state()).toBe('saved');
  });

  it('meldet Ladefehler verständlich und erlaubt einen neuen Versuch', async () => {
    const squad = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    firebase.failPlayers({ code: 'permission-denied' });
    expect(squad.load()).toBe('error');
    expect(squad.error()).toContain('permission-denied');
    expect(TestBed.inject(SyncService).state()).toBe('error');
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(firebase.playerWatchers).toBe(1);
  });

  it('meldet einen Fehler beim Starten des Abos', async () => {
    const squad = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.watchPlayersError = { code: 'unavailable' };
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('error'));
  });

  it('speichert einen neuen Spieler mit allen Feldern der bisherigen App', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.save(draft())).toEqual({});
    await vi.waitFor(() => expect(squad.players()).toHaveLength(2));
    const saved = squad.players().find((p) => p.name === 'Neu Neumann');
    expect(saved).toMatchObject({ number: 4, positions: ['IV'], status: 'Fit', consentStatus: 'pending' });
    expect(saved?.id).toMatch(/^p/);
  });

  it('bearbeitet einen vorhandenen Spieler unter seiner ID', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.save(draft({ id: 'p1', name: 'Ali Adler', number: '9', positions: ['ST'], status: 'Verletzt', injuryUntil: '2026-12-01' }))).toEqual({});
    await vi.waitFor(() => expect(squad.players()[0].status).toBe('Verletzt'));
    expect(squad.players()).toHaveLength(1);
    expect(squad.players()[0].injuryUntil).toBe('2026-12-01');
  });

  it('schreibt bei ungültigen Eingaben nichts (z. B. doppelte Rückennummer)', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    const errors = squad.save(draft({ number: '9' }));
    expect(errors.number).toContain('bereits vergeben');
    expect(firebase.calls.some((call) => call.startsWith('savePlayer'))).toBe(false);
  });

  it('zeigt einen fehlgeschlagenen Schreibvorgang im Sync-Status', async () => {
    const squad = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    firebase.savePlayerError = { code: 'permission-denied' };
    squad.save(draft());
    const sync = TestBed.inject(SyncService);
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.detail()).toContain('konnte nicht gespeichert werden');
  });

  it('löscht einen Spieler und meldet Fehler', async () => {
    const squad = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    firebase.deletePlayerError = { code: 'unavailable' };
    expect(await squad.remove('p1')).toBe(false);
    expect(squad.players()).toHaveLength(1);
    firebase.deletePlayerError = null;
    expect(await squad.remove('p1')).toBe(true);
    expect(squad.players()).toHaveLength(0);
  });

  it.each(['medical', 'player'] as const)('Rolle %s darf nichts schreiben', async (role) => {
    const squad = setup(role);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    expect(squad.canWrite()).toBe(false);
    expect(Object.keys(squad.save(draft()))).not.toHaveLength(0);
    expect(await squad.remove('p1')).toBe(false);
    expect(firebase.calls.some((call) => call.startsWith('savePlayer') || call.startsWith('deletePlayer'))).toBe(false);
  });

  it('verwirft Daten und Abo beim Abmelden', async () => {
    const squad = setup();
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    TestBed.inject(SessionService).clear();
    TestBed.tick();
    expect(squad.players()).toEqual([]);
    expect(squad.load()).toBe('idle');
    expect(firebase.playerWatchers).toBe(0);
  });

  it('verwirft ein Abo, das erst nach dem Stoppen fertig wird', async () => {
    const squad = setup();
    squad.start();
    squad.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(firebase.playerWatchers).toBe(0);
    expect(squad.players()).toEqual([]);
  });

  it('lässt vor dem vollständigen Laden nichts speichern (Rückennummern-Prüfung wäre sonst wirkungslos)', () => {
    const squad = setup();
    expect(squad.canEdit()).toBe(false);
    expect(squad.save(draft({ number: '9' })).name).toContain('noch nicht geladen');
    expect(firebase.calls.some((call) => call.startsWith('savePlayer'))).toBe(false);
  });

  it('lässt einen Schreibfehler sichtbar, auch wenn danach der zurückgerollte Snapshot eintrifft', async () => {
    const squad = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    firebase.savePlayerError = { code: 'permission-denied' };
    squad.save(draft());
    const sync = TestBed.inject(SyncService);
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    firebase.emitPlayers({ fromCache: false, hasPendingWrites: false }); // Firestore rollt zurück und meldet neu
    expect(sync.state()).toBe('error');
    expect(sync.detail()).toContain('„Neu Neumann“');
    // Erst ein erfolgreicher Schreibvorgang nimmt den Fehler zurück.
    firebase.savePlayerError = null;
    squad.save(draft());
    await vi.waitFor(() => expect(sync.state()).toBe('saved'));
    expect(sync.detail()).toBe('');
  });
});
