import { TestBed } from '@angular/core/testing';
import { OpponentsService } from './opponents.service';
import { emptyDraft } from './opponent';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('OpponentsService', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.opponents.opponents.set('o1', { name: 'JSG Taunus', formation: '4-3-3', style: 'Pressing', updatedAt: '2026-10-01' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(OpponentsService);
  }
  const draft = (overrides = {}) => ({ ...emptyDraft(), name: 'SV Nord', formation: '3-5-2', style: 'Ballbesitz' as const, ...overrides });

  it('lädt die Gegner in Echtzeit und meldet den Sync-Status', async () => {
    const opponents = setup();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    expect(opponents.opponents().map((entry) => entry.name)).toEqual(['JSG Taunus']);
    expect(TestBed.inject(SyncService).state()).toBe('saved');
    firebase.opponents.opponents.set('o2', { name: 'Zeta' });
    firebase.opponents.emitOpponents();
    expect(opponents.opponents()).toHaveLength(2);
  });

  it('startet nur ein Abo und nur für Trainer', async () => {
    const opponents = setup();
    opponents.start();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    expect(firebase.opponents.opponentWatchers).toBe(1);

    TestBed.resetTestingModule();
    const other = setup('player');
    other.start();
    expect(other.load()).toBe('idle');
    expect(firebase.calls).not.toContain('watchOpponents');
  });

  it('meldet Ladefehler verständlich und erlaubt einen neuen Versuch', async () => {
    const opponents = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.opponents.watchOpponentsError = { code: 'permission-denied' };
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('error'));
    expect(opponents.error()).toContain('Gegner konnten nicht geladen werden');
    firebase.opponents.watchOpponentsError = null;
    opponents.stop();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
  });

  it('speichert einen neuen Gegner mit Präfix-ID und Änderungsdatum', async () => {
    const opponents = setup();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    expect(opponents.save(draft())).toEqual({});
    await vi.waitFor(() => expect(firebase.calls.some((call) => call.startsWith('saveOpponent:o'))).toBe(true));
    const [id, data] = [...firebase.opponents.opponents].find(([key]) => key !== 'o1')!;
    expect(id.startsWith('o')).toBe(true);
    expect(data).toMatchObject({ name: 'SV Nord', formation: '3-5-2', style: 'Ballbesitz' });
    expect(String(data['updatedAt'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('bearbeitet unter derselben ID und schreibt bei ungültigen Eingaben nichts', async () => {
    const opponents = setup();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    expect(opponents.save(draft({ id: 'o1', name: 'JSG Neu' }))).toEqual({});
    await vi.waitFor(() => expect(firebase.opponents.opponents.get('o1')?.['name']).toBe('JSG Neu'));
    expect(firebase.opponents.opponents.size).toBe(1);
    firebase.calls.length = 0;
    expect(opponents.save(draft({ name: '' })).name).toBeDefined();
    expect(firebase.calls.some((call) => call.startsWith('saveOpponent'))).toBe(false);
  });

  it('erlaubt anderen Rollen kein Schreiben', async () => {
    const opponents = setup('physio');
    expect(opponents.save(draft()).name).toContain('Nur Trainer');
    expect(await opponents.remove('o1')).toBe(false);
    expect(firebase.calls).toEqual([]);
  });

  it('meldet einen Speicherfehler im Sync-Status', async () => {
    const opponents = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    firebase.opponents.saveOpponentError = { code: 'permission-denied' };
    opponents.save(draft());
    await vi.waitFor(() => expect(TestBed.inject(SyncService).isFailed()).toBe(true));
  });

  it('löscht einen Gegner und meldet Fehler', async () => {
    const opponents = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    firebase.opponents.deleteOpponentError = { code: 'unavailable' };
    expect(await opponents.remove('o1')).toBe(false);
    expect(firebase.opponents.opponents.has('o1')).toBe(true);
    firebase.opponents.deleteOpponentError = null;
    expect(await opponents.remove('o1')).toBe(true);
    expect(firebase.opponents.opponents.has('o1')).toBe(false);
  });

  it('verwirft Daten und Abo beim Abmelden', async () => {
    const opponents = setup();
    opponents.start();
    await vi.waitFor(() => expect(opponents.load()).toBe('ready'));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(opponents.opponents()).toEqual([]);
    expect(opponents.load()).toBe('idle');
    expect(firebase.opponents.opponentWatchers).toBe(0);
  });
});
