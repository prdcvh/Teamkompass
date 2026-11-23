import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import type { Role } from '../auth/role';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { emptyLevelDraft, emptyPathDraft } from './learning-path';
import { LearningService } from './learning.service';

describe('LearningService (SCRUM-192)', () => {
  let firebase: FakeFirebase;

  const pathDoc = {
    title: 'Torwart',
    position: 'TW',
    ageGroup: 'U14',
    levels: [
      { id: 'a', title: 'A', unit: 'x', minutes: 3, url: null, homeTask: '' },
      { id: 'b', title: 'B', unit: 'y', minutes: 4, url: null, homeTask: '' },
    ],
  };

  async function setup(role: Role | null, playerId: string | null = null) {
    firebase = new FakeFirebase();
    firebase.learning.paths.set('lp1', pathDoc);
    firebase.learning.progress.set('p1', { playerId: 'p1', paths: { lp1: { a: '2026-10-13' } } });
    firebase.learning.progress.set('p2', { playerId: 'p2', paths: { lp1: { a: '2026-10-20', b: '2026-10-27' } } });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.playerId.set(playerId);
    const service = TestBed.inject(LearningService);
    service.start();
    return service;
  }

  it('Trainer lädt alle Pfade und den Fortschritt aller Spieler', async () => {
    const service = await setup('trainer');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(firebase.calls).toContain('watchAllLearningProgress');
    expect(service.paths().map((path) => path.id)).toEqual(['lp1']);
    expect(service.progressOf('p2')).toEqual({ lp1: { a: '2026-10-20', b: '2026-10-27' } });
  });

  it('Spieler laden nur den eigenen Fortschritt (gezielter Abruf, keine Liste)', async () => {
    const service = await setup('player', 'p1');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(firebase.calls).toContain('watchLearningProgress:p1');
    expect(firebase.calls).not.toContain('watchAllLearningProgress');
    expect(service.progressOf('p1')).toEqual({ lp1: { a: '2026-10-13' } });
    expect(service.progressOf('p2')).toEqual({});
  });

  it('Eltern ebenso – und weder Spieler noch Eltern können schreiben', async () => {
    const service = await setup('parent', 'p1');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(service.canWrite()).toBe(false);
    expect(service.confirmNext('p1', 'lp1')).toBe(false);
    expect(service.undoLast('p1', 'lp1')).toBe(false);
    expect(service.deletePath('lp1')).toBe(false);
    expect(Object.keys(service.savePath({ ...emptyPathDraft('U14'), title: 'X', levels: [{ ...emptyLevelDraft(), title: 'a', unit: 'b' }] }))).not.toHaveLength(0);
    expect(firebase.calls.filter((call) => /^(setLevel|savePath|deletePath)/.test(call))).toEqual([]);
  });

  it('Medizin, Scout und Spieler ohne Verknüpfung laden nichts', async () => {
    for (const [role, playerId] of [['physio', null], ['scout', null], ['player', null]] as const) {
      TestBed.resetTestingModule();
      const service = await setup(role, playerId);
      expect(service.load()).toBe('idle');
      expect(firebase.calls.filter((call) => call.includes('Learning'))).toEqual([]);
    }
  });

  it('Trainer bestätigt die nächste Stufe und nimmt die letzte zurück', async () => {
    const service = await setup('trainer');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(service.confirmNext('p1', 'lp1', '2026-11-03')).toBe(true);
    expect(firebase.calls).toContain('setLevel:p1:lp1:b:2026-11-03');
    await vi.waitFor(() => expect(service.progressOf('p1')['lp1']).toEqual({ a: '2026-10-13', b: '2026-11-03' }));
    // Alles bestätigt: keine weitere Stufe.
    expect(service.confirmNext('p1', 'lp1')).toBe(false);
    expect(service.undoLast('p1', 'lp1')).toBe(true);
    expect(firebase.calls).toContain('setLevel:p1:lp1:b:null');
    await vi.waitFor(() => expect(service.progressOf('p1')['lp1']).toEqual({ a: '2026-10-13' }));
  });

  it('Trainer legt Pfade an (geprüft) und löscht sie samt Bestätigungen', async () => {
    const service = await setup('trainer');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    expect(service.savePath({ ...emptyPathDraft('U14'), title: '' }).title).toBeDefined();
    expect(firebase.calls.some((call) => call.startsWith('savePath'))).toBe(false);
    expect(service.savePath({ ...emptyPathDraft('U14'), title: 'Neu', levels: [{ ...emptyLevelDraft('n1'), title: 'Eins', unit: 'Üben' }] })).toEqual({});
    await vi.waitFor(() => expect(service.paths()).toHaveLength(2));
    expect(service.deletePath('lp1')).toBe(true);
    expect(firebase.calls).toContain('deletePath:lp1:p1,p2');
    await vi.waitFor(() => expect(service.paths().map((path) => path.title)).toEqual(['Neu']));
    expect(service.progressOf('p1')).toEqual({});
  });

  it('Regeln kennen die Lernpfade noch nicht: Zustand „denied“ statt Fehler', async () => {
    firebase = new FakeFirebase();
    firebase.learning.watchError = { code: 'permission-denied' };
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(LearningService);
    service.start();
    await vi.waitFor(() => expect(service.load()).toBe('denied'));
  });

  it('beim Abmelden werden die Daten verworfen', async () => {
    const service = await setup('trainer');
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(service.load()).toBe('idle');
    expect(service.paths()).toEqual([]);
  });
});
