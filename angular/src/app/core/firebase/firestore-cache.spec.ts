import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import { type FirestoreSdk, openFirestore, wipeFirestore } from './firestore-cache';

describe('Lokaler Firestore-Speicher (SCRUM-199)', () => {
  const app = { name: 'test' } as FirebaseApp;
  const db = { type: 'db' } as unknown as Firestore;
  const fallback = { type: 'fallback' } as unknown as Firestore;

  function sdk(overrides: Partial<FirestoreSdk> = {}) {
    const calls: string[] = [];
    const fake = {
      initializeFirestore: vi.fn((_app: FirebaseApp, settings: unknown) => {
        calls.push('initializeFirestore');
        expect(settings).toEqual({ localCache: { kind: 'persistent', tabManager: 'multi-tab' } });
        return db;
      }),
      getFirestore: vi.fn(() => fallback),
      persistentLocalCache: vi.fn((settings: unknown) => ({
        kind: 'persistent',
        tabManager: (settings as { tabManager: string }).tabManager,
      })),
      persistentMultipleTabManager: vi.fn(() => 'multi-tab'),
      terminate: vi.fn(async () => void calls.push('terminate')),
      clearIndexedDbPersistence: vi.fn(async () => void calls.push('clear')),
      ...overrides,
    };
    return { fake: fake as unknown as FirestoreSdk, calls, mocks: fake };
  }

  afterEach(() => vi.restoreAllMocks());

  it('startet Firestore mit dauerhaftem lokalem Speicher für mehrere Tabs', () => {
    const { fake } = sdk();
    expect(openFirestore(app, fake)).toBe(db);
  });

  it('fällt ohne nutzbaren Browser-Speicher auf Firestore ohne Speicher zurück', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fake, mocks } = sdk({
      initializeFirestore: vi.fn(() => {
        throw new Error('indexeddb nicht verfügbar');
      }),
    });
    expect(openFirestore(app, fake)).toBe(fallback);
    expect(mocks.getFirestore).toHaveBeenCalledWith(app);
  });

  it('beendet Firestore und leert danach den Speicher (in dieser Reihenfolge)', async () => {
    const { fake, calls } = sdk();
    expect(await wipeFirestore(db, fake)).toBe(true);
    expect(calls).toEqual(['terminate', 'clear']);
  });

  it('meldet, wenn der Speicher nicht geleert werden konnte (z. B. anderer Tab), und wirft nicht', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { fake } = sdk({
      clearIndexedDbPersistence: vi.fn(async () => {
        throw { code: 'failed-precondition' };
      }),
    });
    expect(await wipeFirestore(db, fake)).toBe(false);
  });
});
