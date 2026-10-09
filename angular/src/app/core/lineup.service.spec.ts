import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase.service';
import { emptyAssignments, moveToZone } from './lineup';
import { LineupService } from './lineup.service';
import { SessionService } from './session.service';
import { SquadService } from './squad.service';
import { SyncService } from './sync.service';
import { FakeFirebase } from './testing';

describe('LineupService', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'medical' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.set('p1', { name: 'Ali', positions: ['TW'], number: 1, birthdate: '2012-01-01', status: 'Fit' });
    firebase.players.set('p2', { name: 'Ben', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit' });
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    TestBed.inject(SessionService).role.set(role);
    const squad = TestBed.inject(SquadService);
    squad.start();
    const lineup = TestBed.inject(LineupService);
    lineup.start();
    if (role === 'trainer') await vi.waitFor(() => expect(lineup.load() === 'ready' && squad.load() === 'ready').toBe(true));
    return lineup;
  }

  it('lädt die gespeicherte Startelf in Echtzeit und blendet Spieler außerhalb des Kaders aus', async () => {
    const lineup = await setup();
    expect(lineup.assignments().TW).toEqual([]);
    firebase.lineup = { assignments: { TW: ['p1'], ST: ['p2', 'weg'] } };
    firebase.emitLineup();
    expect(lineup.assignments().TW).toEqual(['p1']);
    expect(lineup.assignments().ST).toEqual(['p2']);
    expect(TestBed.inject(SyncService).state()).toBe('saved');
  });

  it('startet nur ein Abo und nur für Trainer', async () => {
    const lineup = await setup();
    lineup.start();
    expect(firebase.lineupWatchers).toBe(1);
    TestBed.resetTestingModule();
    const other = await setup('medical');
    expect(other.load()).toBe('idle');
    expect(firebase.calls).not.toContain('watchLineup');
  });

  it('speichert das ganze Dokument mit allen Zonen', async () => {
    const lineup = await setup();
    const next = moveToZone(emptyAssignments(), 'p1', 'TW');
    expect(next).not.toBe('voll');
    expect(lineup.save(next as never)).toBe(true);
    await vi.waitFor(() => expect(firebase.calls).toContain('saveLineup'));
    expect(Object.keys((firebase.lineup as { assignments: object }).assignments)).toHaveLength(14);
    expect(lineup.assignments().TW).toEqual(['p1']);
  });

  it('schreibt für andere Rollen nichts', async () => {
    const lineup = await setup('medical');
    expect(lineup.save(emptyAssignments())).toBe(false);
    expect(firebase.calls).not.toContain('saveLineup');
  });

  it('meldet Lade- und Speicherfehler verständlich', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lineup = await setup();
    firebase.saveLineupError = { code: 'permission-denied' };
    lineup.save(emptyAssignments());
    await vi.waitFor(() => expect(TestBed.inject(SyncService).isFailed()).toBe(true));
    lineup.stop();
    firebase.watchLineupError = { code: 'unavailable' };
    lineup.start();
    await vi.waitFor(() => expect(lineup.load()).toBe('error'));
    expect(lineup.error()).toContain('Aufstellung konnte nicht geladen werden');
  });

  it('verwirft Daten und Abo beim Abmelden', async () => {
    const lineup = await setup();
    firebase.lineup = { assignments: { TW: ['p1'] } };
    firebase.emitLineup();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(lineup.assignments().TW).toEqual([]);
    expect(lineup.load()).toBe('idle');
    expect(firebase.lineupWatchers).toBe(0);
  });
});
