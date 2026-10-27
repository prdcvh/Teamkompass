import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { EventsService } from '../events/events.service';
import { SquadService } from '../player/squad.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { RankingService } from './ranking.service';

describe('RankingService (MVP der Woche/des Monats)', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'player' | 'scout' | null = 'trainer') {
    // Mittwoch, 21.10.2026: Woche 19.–25.10., Monat Oktober.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T12:00:00'));
    firebase = new FakeFirebase();
    for (const [id, name] of [['p1', 'Ali'], ['p2', 'Ben'], ['p3', 'Cem']]) {
      firebase.players.players.set(id, { name, positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Fit' });
    }
    firebase.events.events.set('t-alt', { type: 'Training', title: 'Training Sep', date: '2026-09-30' });
    firebase.events.events.set('t-monat', { type: 'Training', title: 'Training', date: '2026-10-05' });
    firebase.events.events.set('t-woche', { type: 'Training', title: 'Training', date: '2026-10-20' });
    firebase.events.events.set('s-nein', { type: 'Spiel', title: 'Spiel ohne Punkte', date: '2026-10-21', pointsEnabled: false });
    firebase.events.events.set('s-ja', { type: 'Spiel', title: 'Spiel mit Punkten', date: '2026-10-22', pointsEnabled: true });
    const notes = (entries: Record<string, number>) => new Map(Object.entries(entries).map(([id, points]) => [id, { playerId: id, points }]));
    firebase.ratings.privateNotes.set('t-alt', notes({ p1: 100 }));
    firebase.ratings.privateNotes.set('t-monat', notes({ p1: 5, p2: 8, p3: 8 }));
    firebase.ratings.privateNotes.set('t-woche', notes({ p1: 3, p2: 4 }));
    firebase.ratings.privateNotes.set('s-nein', notes({ p3: 50 }));
    firebase.ratings.privateNotes.set('s-ja', notes({ p1: 2, p3: 1 }));
    TestBed.configureTestingModule({ providers: provideFakeFirebase(firebase) });
    TestBed.inject(SessionService).role.set(role);
    return TestBed.inject(RankingService);
  }

  /** Wie die Startseite des Trainers: Events und Kader starten. */
  const startTeam = () => {
    TestBed.inject(EventsService).start();
    TestBed.inject(SquadService).start();
  };

  afterEach(() => vi.useRealTimers());

  const shape = (entries: readonly { rank: number; name: string; points?: number }[]) => entries.map((entry) => `${entry.rank} ${entry.name} ${entry.points}`);

  it('Trainer: rechnet Woche und Monat nur aus Events mit Punkten und ignoriert fremde Zeiträume', async () => {
    const service = setup();
    startTeam();
    await service.start();
    expect(service.load()).toBe('ready');
    // Woche: Ali 3+2=5, Ben 4, Cem 1 (Spiel ohne Punkte zählt nicht).
    expect(shape(service.week())).toEqual(['1 Ali 5', '2 Ben 4', '3 Cem 1']);
    // Monat: Ali 5+3+2=10, Ben 8+4=12, Cem 8+1=9 (September und Spiel ohne Punkte zählen nicht).
    expect(shape(service.month())).toEqual(['1 Ben 12', '2 Ali 10', '3 Cem 9']);
    // Die September-Punkte und das Spiel ohne Punkte werden gar nicht erst gelesen.
    expect(firebase.calls).not.toContain('readPrivateNotes:t-alt');
    expect(firebase.calls).not.toContain('readPrivateNotes:s-nein');
  });

  it('Trainer: negative Punkte werden in die Summe eingerechnet (SCRUM-213)', async () => {
    const service = setup();
    firebase.ratings.privateNotes.set('t-woche', new Map([['p1', { playerId: 'p1', points: -5 }], ['p2', { playerId: 'p2', points: 4 }]]));
    startTeam();
    await service.start();
    // Woche: Ali -5+2=-3 (kein Platz, nur Punkte über 0 werden gelistet), Ben 4, Cem 1.
    expect(shape(service.week())).toEqual(['1 Ben 4', '2 Cem 1']);
    // Monat: Ali 5-5+2=2 (statt 7 mit „negativ = 0“), Ben 12, Cem 9.
    expect(shape(service.month())).toEqual(['1 Ben 12', '2 Cem 9', '3 Ali 2']);
  });

  it('Trainer: veröffentlicht die Rangliste für Spieler (Platz, Name, Punkte), aber keine Spieler-IDs', async () => {
    const service = setup();
    startTeam();
    await service.start();
    const doc = firebase.ranking.doc as { week: { from: string; to: string; entries: unknown[] }; month: { entries: unknown[] } };
    expect(doc.week.from).toBe('2026-10-19');
    expect(doc.week.to).toBe('2026-10-25');
    expect(doc.week.entries[0]).toEqual({ rank: 1, name: 'Ali', points: 5 });
    expect(JSON.stringify(doc)).not.toContain('p1');
    expect(firebase.calls.filter((call) => call === 'saveRanking')).toHaveLength(1);
    // Kein erneutes Schreiben, wenn sich nichts geändert hat.
    service.invalidate();
    await service.start();
    expect(firebase.calls.filter((call) => call === 'saveRanking')).toHaveLength(1);
  });

  it('Trainer: liest innerhalb von fünf Minuten nicht erneut, nach einer Punkteänderung schon', async () => {
    const service = setup();
    startTeam();
    await service.start();
    const reads = () => firebase.calls.filter((call) => call.startsWith('readPrivateNotes')).length;
    const first = reads();
    await service.start();
    expect(reads()).toBe(first);
    service.invalidate();
    await service.start();
    expect(reads()).toBe(first * 2);
  });

  it('Spieler: liest nur das Ranglisten-Dokument und nie Trainer-Dokumente', async () => {
    const service = setup('player');
    firebase.ranking.doc = {
      week: { from: '2026-10-19', to: '2026-10-25', entries: [{ rank: 1, name: 'Ali', points: 5 }] },
      month: { from: '2026-10-01', to: '2026-10-31', entries: [{ rank: 1, name: 'Ben', points: 12 }, { rank: 2, name: 'Ali', points: 10 }] },
      updatedAt: 'x',
    };
    await service.start();
    expect(shape(service.week())).toEqual(['1 Ali 5']);
    expect(shape(service.month())).toEqual(['1 Ben 12', '2 Ali 10']);
    expect(firebase.calls.filter((call) => call.startsWith('readPrivateNotes'))).toEqual([]);
    expect(firebase.calls).not.toContain('saveRanking');
    expect(firebase.calls).not.toContain('watchEvents');
  });

  it('Spieler: eine Rangliste aus einer früheren Woche wird als leer gezeigt, der Monat bleibt', async () => {
    const service = setup('player');
    firebase.ranking.doc = {
      week: { from: '2026-10-12', to: '2026-10-18', entries: [{ rank: 1, name: 'Ali', points: 5 }] },
      month: { from: '2026-10-01', to: '2026-10-31', entries: [{ rank: 1, name: 'Ben', points: 12 }] },
      updatedAt: 'x',
    };
    await service.start();
    expect(service.week()).toEqual([]);
    expect(service.month()).toHaveLength(1);
  });

  it('Spieler: ohne Dokument ist die Rangliste leer, ein Fehler wird gemeldet', async () => {
    const service = setup('player');
    await service.start();
    expect(service.load()).toBe('ready');
    expect(service.week()).toEqual([]);
    const failing = TestBed.inject(RankingService);
    firebase.ranking.readError = { code: 'permission-denied' };
    await failing.retry();
    expect(failing.load()).toBe('error');
    expect(failing.error()).not.toBe('');
  });

  it('Scouts und Abgemeldete lesen nichts', async () => {
    const service = setup('scout');
    await service.start();
    expect(service.load()).toBe('idle');
    expect(firebase.calls).not.toContain('readRanking');
  });
});
