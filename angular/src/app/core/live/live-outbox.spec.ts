import { OUTBOX_STORAGE_KEY, type PendingLiveChange, liveSaveStatus, loadOutbox, newChangeId, outboxFor, saveOutbox } from './live-outbox';

const change = (id: string, extra: Partial<PendingLiveChange> = {}): PendingLiveChange => ({
  id, uid: 'u1', teamId: 'U17', eventId: 'e1', playerId: 'p1', delta: 1, at: 1, ...extra,
});

function memoryStorage(initial?: string): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>(initial === undefined ? [] : [[OUTBOX_STORAGE_KEY, initial]]);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('Live-Modus: Postausgang und Speicherhinweis (SCRUM-216)', () => {
  describe('Zustandshinweis aus Snapshot-Angaben', () => {
    const base = { pending: 0, online: true, fromCache: false, hasPendingWrites: false, failed: false };

    it('„Gespeichert“ nur, wenn nichts wartet und der Server bestätigt hat', () => {
      expect(liveSaveStatus(base)).toEqual({ kind: 'saved', text: 'Gespeichert' });
      expect(liveSaveStatus({ ...base, hasPendingWrites: true }).kind).toBe('saving');
      expect(liveSaveStatus({ ...base, pending: 2 })).toEqual({ kind: 'saving', text: 'Wird gespeichert … (2 Änderungen warten)' });
    });

    it('offline (Snapshot aus dem Gerätespeicher oder Browser ohne Netz) mit Anzahl der wartenden Änderungen', () => {
      expect(liveSaveStatus({ ...base, fromCache: true, hasPendingWrites: true, pending: 3 })).toEqual({
        kind: 'offline',
        text: 'Offline – wird gespeichert, sobald Netz da ist (3 Änderungen warten)',
      });
      expect(liveSaveStatus({ ...base, online: false, pending: 1 }).text).toBe('Offline – wird gespeichert, sobald Netz da ist (1 Änderung wartet)');
      expect(liveSaveStatus({ ...base, fromCache: true }).text).toBe('Offline – wird gespeichert, sobald Netz da ist');
    });

    it('ein abgelehnter Schreibvorgang geht vor', () => {
      expect(liveSaveStatus({ ...base, failed: true, fromCache: true, pending: 2 })).toEqual({ kind: 'error', text: 'Nicht gespeichert – 2 Änderungen warten' });
    });
  });

  it('Kennungen sind eindeutig und taugen als Feldname', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newChangeId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9]{8,40}$/);
    expect(newChangeId(() => 'ab-cd.ef/gh', 0)).toBe('0abcdefgh');
  });

  it('übersteht Neustart: speichern und wieder laden; Kaputtes und Doppeltes fällt heraus', () => {
    const storage = memoryStorage();
    expect(saveOutbox(storage, [change('aaaaaaaa1'), change('bbbbbbbb2', { delta: -2 })])).toBe(true);
    expect(loadOutbox(storage).map((entry) => [entry.id, entry.delta])).toEqual([['aaaaaaaa1', 1], ['bbbbbbbb2', -2]]);
    expect(saveOutbox(storage, [])).toBe(true);
    expect(storage.data.has(OUTBOX_STORAGE_KEY)).toBe(false);

    const messy = JSON.stringify([
      change('aaaaaaaa1'),
      change('aaaaaaaa1'),
      { id: 'x' },
      change('bad id !!'),
      change('cccccccc3', { delta: 0 }),
      change('dddddddd4', { delta: 1.5 }),
      7,
    ]);
    expect(loadOutbox(memoryStorage(messy)).map((entry) => entry.id)).toEqual(['aaaaaaaa1']);
    expect(loadOutbox(memoryStorage('{kaputt'))).toEqual([]);
    expect(loadOutbox(null)).toEqual([]);
  });

  it('gesperrter Speicher wirft nicht', () => {
    const fail = (): never => {
      throw new Error('gesperrt');
    };
    const locked = { getItem: fail, setItem: fail, removeItem: fail };
    expect(loadOutbox(locked)).toEqual([]);
    expect(saveOutbox(locked, [change('aaaaaaaa1')])).toBe(false);
    expect(saveOutbox(null, [])).toBe(false);
  });

  it('zählt und sendet nur Änderungen des angemeldeten Kontos im aktuellen Team', () => {
    const entries = [change('aaaaaaaa1'), change('bbbbbbbb2', { uid: 'u2' }), change('cccccccc3', { teamId: 'U15' })];
    expect(outboxFor(entries, 'u1', 'U17').map((entry) => entry.id)).toEqual(['aaaaaaaa1']);
    expect(outboxFor(entries, null, 'U17')).toEqual([]);
  });
});
