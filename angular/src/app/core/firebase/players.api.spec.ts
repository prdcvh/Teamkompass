import { TestBed } from '@angular/core/testing';
import { CurrentTeam } from '../team/current-team.service';
import { PlayerStatsMode } from '../team/player-stats-mode';
import { FirebaseConnection } from './firebase-connection';
import { PlayersApi } from './players.api';

/**
 * Nachgebautes Firestore (nur Pfade): jede Sammlung enthält die hier eingetragenen Dokumente, `writeBatch` merkt sich
 * alle gelöschten Pfade. So prüft der Test, was `deletePlayer` wirklich löscht – ohne Server.
 */
const store = vi.hoisted(() => ({ docs: new Map<string, string[]>(), deleted: [] as string[] }));

vi.mock('firebase/firestore', () => {
  const ref = (path: string) => ({ path });
  const join = (_db: unknown, ...segments: string[]) => segments.join('/');
  return {
    collection: (db: unknown, ...segments: string[]) => ({ path: join(db, ...segments) }),
    doc: (db: unknown, ...segments: string[]) => ref(join(db, ...segments)),
    query: (collection: { path: string }) => collection,
    where: () => null,
    getDocs: async (collection: { path: string }) => ({
      docs: (store.docs.get(collection.path) ?? []).map((id) => ({ id, ref: ref(`${collection.path}/${id}`) })),
    }),
    // Einzel-Löschen (z. B. Lernpfad-Stand, SCRUM-192) zählt wie ein Löschen im Block.
    deleteDoc: async (target: { path: string }) => void store.deleted.push(target.path),
    writeBatch: () => {
      const pending: string[] = [];
      return {
        delete: (target: { path: string }) => void pending.push(target.path),
        commit: async () => void store.deleted.push(...pending),
      };
    },
  };
});

describe('PlayersApi.deletePlayer (SCRUM-278)', () => {
  beforeEach(() => {
    store.docs.clear();
    store.deleted = [];
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseConnection, useValue: { get: async () => ({ db: {} }) } },
        { provide: CurrentTeam, useValue: { id: () => 'T1' } },
        { provide: PlayerStatsMode, useValue: { writesSummary: async () => true } },
      ],
    });
  });

  it('löscht auch die Angaben aus dem Check-in (Anstrengung und Befinden)', async () => {
    store.docs.set('teams/T1/events', ['e1']);
    store.docs.set('teams/T1/players/p1/selfReports', ['e1', 'e2']);
    store.docs.set('teams/T1/players/p1/wellness', ['e1']);
    // Ein anderer Spieler bleibt unberührt.
    store.docs.set('teams/T1/players/p2/wellness', ['e1']);

    await TestBed.inject(PlayersApi).deletePlayer('p1');

    expect(store.deleted).toEqual(
      expect.arrayContaining([
        'teams/T1/players/p1/selfReports/e1',
        'teams/T1/players/p1/selfReports/e2',
        'teams/T1/players/p1/wellness/e1',
      ]),
    );
    expect(store.deleted.some((path) => path.includes('/p2'))).toBe(false);
  });

  it('löscht alle Unterdaten, Bewertungen und Notizen und das Spielerdokument zuletzt', async () => {
    store.docs.set('teams/T1/events', ['e1']);
    store.docs.set('teams/T1/players/p1/developmentPlans', ['d1']);
    store.docs.set('teams/T1/players/p1/absences', ['a1']);
    store.docs.set('teams/T1/players/p1/measurements', ['m1']);
    store.docs.set('teams/T1/players/p1/selfReports', ['e1']);
    store.docs.set('teams/T1/players/p1/wellness', ['e1']);

    await TestBed.inject(PlayersApi).deletePlayer('p1');

    expect(store.deleted).toEqual(
      expect.arrayContaining([
        'teams/T1/players/p1/developmentPlans/d1',
        'teams/T1/players/p1/absences/a1',
        'teams/T1/players/p1/measurements/m1',
        'teams/T1/events/e1/ratings/p1',
        'teams/T1/events/e1/privateNotes/p1',
        'teams/T1/events/e1/responses/p1',
        'teams/T1/playerStats/p1',
        'teams/T1/playerCards/p1',
      ]),
    );
    expect(store.deleted.at(-1)).toBe('teams/T1/players/p1');
  });
});
