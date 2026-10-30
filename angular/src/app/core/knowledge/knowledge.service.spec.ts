import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { emptyKnowledgeDraft } from './knowledge';
import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService (SCRUM-106)', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'player' | 'parent' | 'scout' | 'physio' | null = 'trainer', doc: Record<string, unknown> | null = null) {
    firebase = new FakeFirebase();
    firebase.knowledge.doc = doc;
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    const service = TestBed.inject(KnowledgeService);
    service.start();
    if (role === 'trainer') await vi.waitFor(() => expect(service.load()).toBe('ready'));
    return service;
  }

  const link = { ...emptyKnowledgeDraft(), title: 'Pressing', url: 'https://example.com/v', category: 'Taktik' };

  it('legt Einträge an, ändert und löscht sie', async () => {
    const service = await setup();
    expect(service.entries()).toEqual([]);
    expect(service.saveEntry(link)).toEqual({});
    await vi.waitFor(() => expect(service.entries()).toHaveLength(1));
    const [entry] = service.entries();
    expect(entry).toMatchObject({ type: 'link', title: 'Pressing', url: 'https://example.com/v', category: 'Taktik' });
    expect(service.categories()).toEqual(['Taktik']);

    expect(service.saveEntry({ ...link, id: entry.id, title: 'Pressing 2', url: 'https://example.com/w' })).toEqual({});
    await vi.waitFor(() => expect(service.entries()[0].title).toBe('Pressing 2'));
    expect(service.entries()).toHaveLength(1);

    expect(service.deleteEntry(entry.id)).toBe(true);
    await vi.waitFor(() => expect(service.entries()).toEqual([]));
  });

  it('speichert nichts bei ungültigen Eingaben, auch nicht bei javascript:/http:', async () => {
    const service = await setup();
    expect(service.saveEntry({ ...link, url: 'javascript:alert(1)' }).url).toBeDefined();
    expect(service.saveEntry({ ...link, url: 'http://example.com' }).url).toBeDefined();
    expect(service.saveEntry({ ...link, title: '' }).title).toBeDefined();
    expect(firebase.calls).not.toContain('saveEntry');
  });

  it('Glossar ohne Link ist möglich', async () => {
    const service = await setup();
    expect(service.saveEntry({ ...emptyKnowledgeDraft(), type: 'glossary', title: 'Abseits', description: 'Regel 11' })).toEqual({});
    await vi.waitFor(() => expect(service.entries()[0]).toMatchObject({ type: 'glossary', url: null }));
  });

  it.each(['player', 'parent', 'scout', 'physio', null] as const)('liest und schreibt nicht als %s', async (role) => {
    const service = await setup(role);
    expect(firebase.knowledge.watchers).toBe(0);
    expect(service.saveEntry(link).title).toBeDefined();
    expect(service.deleteEntry('x')).toBe(false);
    expect(firebase.calls).not.toContain('saveEntry');
    expect(firebase.calls).not.toContain('watchKnowledge');
  });

  it('zeigt eine Meldung, wenn Speichern fehlschlägt', async () => {
    const service = await setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    firebase.knowledge.saveError = Object.assign(new Error('x'), { code: 'permission-denied' });
    service.saveEntry(link);
    await vi.waitFor(() => expect(TestBed.inject(SyncService).state()).toBe('error'));
    expect(TestBed.inject(SyncService).detail()).toContain('Der Eintrag konnte nicht gespeichert werden.');
  });

  it('verwirft die Daten beim Abmelden', async () => {
    const service = await setup('trainer', { knowledge: { a: { type: 'link', title: 'A', url: 'https://example.com/a' } } });
    expect(service.entries()).toHaveLength(1);
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(service.entries()).toEqual([]);
    expect(firebase.knowledge.watchers).toBe(0);
  });

  it('meldet einen Ladefehler und versucht es erneut', async () => {
    firebase = new FakeFirebase();
    firebase.knowledge.watchError = new Error('x');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set('trainer');
    const service = TestBed.inject(KnowledgeService);
    service.start();
    await vi.waitFor(() => expect(service.load()).toBe('error'));
    firebase.knowledge.watchError = null;
    service.retry();
    await vi.waitFor(() => expect(service.load()).toBe('ready'));
  });
});
