import { TestBed } from '@angular/core/testing';
import { emptyAssignments, moveToZone } from './lineup';
import { LineupService } from './lineup.service';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { SyncService } from '../shell/sync.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';

describe('LineupService', () => {
  let firebase: FakeFirebase;

  async function setup(role: 'trainer' | 'physio' | null = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali', positions: ['TW'], number: 1, birthdate: '2012-01-01', status: 'Fit' });
    firebase.players.players.set('p2', { name: 'Ben', positions: ['ST'], number: 9, birthdate: '2012-01-01', status: 'Fit' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
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
    firebase.lineup.lineup = { assignments: { TW: ['p1'], ST: ['p2', 'weg'] } };
    firebase.lineup.emitLineup();
    expect(lineup.assignments().TW).toEqual(['p1']);
    expect(lineup.assignments().ST).toEqual(['p2']);
    expect(TestBed.inject(SyncService).state()).toBe('saved');
  });

  it('startet nur ein Abo und nur für Trainer', async () => {
    const lineup = await setup();
    lineup.start();
    expect(firebase.lineup.lineupWatchers).toBe(1);
    TestBed.resetTestingModule();
    const other = await setup('physio');
    expect(other.load()).toBe('idle');
    expect(firebase.calls).not.toContain('watchLineup');
  });

  it('speichert das ganze Dokument mit allen Zonen', async () => {
    const lineup = await setup();
    const next = moveToZone(emptyAssignments(), 'p1', 'TW');
    expect(next).not.toBe('voll');
    expect(lineup.save(next as never)).toBe(true);
    await vi.waitFor(() => expect(firebase.calls).toContain('saveLineup'));
    expect(Object.keys((firebase.lineup.lineup as { assignments: object }).assignments)).toHaveLength(14);
    expect(lineup.assignments().TW).toEqual(['p1']);
  });

  it('schreibt für andere Rollen nichts', async () => {
    const lineup = await setup('physio');
    expect(lineup.save(emptyAssignments())).toBe(false);
    expect(firebase.calls).not.toContain('saveLineup');
  });

  it('meldet Lade- und Speicherfehler verständlich', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lineup = await setup();
    firebase.lineup.saveLineupError = { code: 'permission-denied' };
    lineup.save(emptyAssignments());
    await vi.waitFor(() => expect(TestBed.inject(SyncService).isFailed()).toBe(true));
    lineup.stop();
    firebase.lineup.watchLineupError = { code: 'unavailable' };
    lineup.start();
    await vi.waitFor(() => expect(lineup.load()).toBe('error'));
    expect(lineup.error()).toContain('Aufstellung konnte nicht geladen werden');
  });

  it('verwirft Daten und Abo beim Abmelden', async () => {
    const lineup = await setup();
    firebase.lineup.lineup = { assignments: { TW: ['p1'] } };
    firebase.lineup.emitLineup();
    TestBed.inject(SessionService).role.set(null);
    TestBed.tick();
    expect(lineup.assignments().TW).toEqual([]);
    expect(lineup.load()).toBe('idle');
    expect(firebase.lineup.lineupWatchers).toBe(0);
  });

  it('speichert die Aufstellung eines Spiels nur unter byEvent, die allgemeine Startelf und andere Spiele bleiben', async () => {
    const lineup = await setup();
    const general = { TW: ['p1'] };
    const other = { assignments: { ST: ['p2'] }, savedAt: '2026-09-01T10:00:00.000Z' };
    firebase.lineup.lineup = { assignments: general, byEvent: { e0: other } };
    firebase.lineup.emitLineup();
    const next = moveToZone(emptyAssignments(), 'p2', 'ST') as never;
    expect(lineup.saveForEvent('e1', next, new Date('2026-10-15T08:00:00Z'))).toBe(true);
    expect(lineup.eventLineups()['e1'].assignments.ST).toEqual(['p2']); // sofort sichtbar
    await vi.waitFor(() => expect(firebase.calls).toContain('saveEventLineup'));
    expect(firebase.calls).not.toContain('saveLineup');
    const doc = firebase.lineup.lineup as { assignments: unknown; byEvent: Record<string, { savedAt: string; assignments: Record<string, string[]> }> };
    expect(doc.assignments).toEqual(general);
    expect(doc.byEvent['e0']).toEqual(other);
    expect(doc.byEvent['e1'].savedAt).toBe('2026-10-15T08:00:00.000Z');
    expect(Object.keys(doc.byEvent['e1'].assignments)).toHaveLength(14);
    expect(lineup.assignments().TW).toEqual(['p1']);
  });

  it('die allgemeine Startelf zu speichern lässt byEvent lokal wie in der Datenbank bestehen', async () => {
    const lineup = await setup();
    firebase.lineup.lineup = { byEvent: { e0: { assignments: { TW: ['p1'] }, savedAt: '' } } };
    firebase.lineup.emitLineup();
    lineup.save(moveToZone(emptyAssignments(), 'p2', 'ST') as never);
    expect(lineup.eventLineups()['e0'].assignments.TW).toEqual(['p1']);
  });

  it('schreibt Spiel-Aufstellungen nur für Trainer und nur mit Spiel', async () => {
    const other = await setup('physio');
    expect(other.saveForEvent('e1', emptyAssignments())).toBe(false);
    TestBed.resetTestingModule();
    const lineup = await setup();
    expect(lineup.saveForEvent('', emptyAssignments())).toBe(false);
    expect(firebase.calls).not.toContain('saveEventLineup');
  });

  it('blendet Spieler außerhalb des Kaders in Spiel-Aufstellungen aus', async () => {
    const lineup = await setup();
    firebase.lineup.lineup = { byEvent: { e1: { assignments: { TW: ['p1', 'weg'] }, savedAt: '' } } };
    firebase.lineup.emitLineup();
    expect(lineup.eventLineups()['e1'].assignments.TW).toEqual(['p1']);
  });
});
