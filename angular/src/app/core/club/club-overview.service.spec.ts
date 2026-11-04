import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { CurrentTeam } from '../team/current-team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { CLUB_OVERVIEW_VERSION } from './club-overview';
import { ClubOverviewService } from './club-overview.service';

describe('ClubOverviewService (Trainer pflegt die Vereinsübersicht, SCRUM-183)', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' = 'trainer') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2012-05-05', status: 'Verletzt', injuryUntil: '2026-12-01', consentStatus: 'pending' });
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).role.set(role);
    if (role === 'player') TestBed.inject(SessionService).playerId.set('p1');
    TestBed.inject(ClubOverviewService);
    const squad = TestBed.inject(SquadService);
    squad.start();
    return squad;
  }

  it('schreibt die Kurzfassung ohne Gesundheitsangaben, sobald der Kader geladen ist – und nur bei Änderungen neu', async () => {
    const squad = setup();
    await vi.waitFor(() => expect(firebase.club.written).toHaveLength(1));
    const teamId = TestBed.inject(CurrentTeam).id();
    expect(firebase.club.written[0]).toEqual({
      teamId,
      data: { version: CLUB_OVERVIEW_VERSION, playerCount: 1, consentPending: 1, consentRevoked: 0, players: [{ id: 'p1', name: 'Ali Adler', number: 9, positions: ['ST'] }] },
    });
    expect(JSON.stringify(firebase.club.written)).not.toContain('Verletzt');

    // Gleicher Kader (nur Status geändert) → kein neuer Schreibvorgang.
    firebase.players.players.set('p1', { ...firebase.players.players.get('p1'), status: 'Fit' });
    firebase.players.emitPlayers();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebase.club.written).toHaveLength(1);

    firebase.players.players.set('p2', { name: 'Bea Berg', positions: ['TW'], number: 1, birthdate: '2013-01-01', consentStatus: 'granted' });
    firebase.players.emitPlayers();
    await vi.waitFor(() => expect(firebase.club.written).toHaveLength(2));
    expect(firebase.club.written[1].data.playerCount).toBe(2);
    expect(squad.players()).toHaveLength(2);
  });

  it('schreibt nichts, wenn der gespeicherte Stand schon stimmt', async () => {
    firebase = new FakeFirebase();
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const teamId = TestBed.inject(CurrentTeam).id();
    firebase.club.overviews.set(teamId, { version: CLUB_OVERVIEW_VERSION, playerCount: 0, consentPending: 0, consentRevoked: 0, players: [] });
    TestBed.inject(SessionService).role.set('trainer');
    TestBed.inject(ClubOverviewService);
    const squad = TestBed.inject(SquadService);
    squad.start();
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    await vi.waitFor(() => expect(firebase.club.calls).toContain(`overview:${teamId}`));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebase.club.written).toEqual([]);
  });

  it('andere Rollen schreiben nichts', async () => {
    const squad = setup('physio');
    await vi.waitFor(() => expect(squad.load()).toBe('ready'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebase.club.written).toEqual([]);
  });
});
