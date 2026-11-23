import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { CurrentTeam } from '../team/current-team.service';
import { TeamService } from '../team/team.service';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { CLUB_COMPARISON_VERSION } from './club-comparison';
import { ClubComparisonService } from './club-comparison.service';

describe('ClubComparisonService (Vereinsvergleich, SCRUM-197)', () => {
  let firebase: FakeFirebase;

  function setup(role: 'trainer' | 'physio' | 'player' = 'trainer', clubId: string | null = 'club-a') {
    firebase = new FakeFirebase();
    firebase.players.players.set('p1', { name: 'Ali Adler', positions: ['ST'], number: 9, birthdate: '2013-05-05', status: 'Verletzt', injuryUntil: '2026-12-01' });
    firebase.events.events.set('e1', { type: 'Training', title: 'Training', date: '2026-10-01', exertion: 6 });
    firebase.ratings.ratings.set('e1', new Map([['p1', { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, playerId: 'p1' }]]));
    firebase.comparison.docs.set(
      'club-a',
      new Map([
        [
          'other',
          {
            version: CLUB_COMPARISON_VERSION,
            teamName: 'U14',
            team: { playerCount: 1, attendanceRate: 80, avgExertion: 5, avgGrade: 2.5, trainings: 4, games: 1, focus: {} },
            players: [{ id: 'q1', name: 'Bea', birthYear: 2013, average: 3, rated: 2, attendanceRate: 70 }],
          },
        ],
      ]),
    );
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    const session = TestBed.inject(SessionService);
    session.role.set(role);
    session.uid.set('coach-1');
    const current = TestBed.inject(CurrentTeam);
    current.applyMeta({ name: 'U13 Team', label: 'U13', clubId, clubName: 'Verein A', logoUrl: null });
    const service = TestBed.inject(ClubComparisonService);
    return { service, team: TestBed.inject(TeamService), current };
  }

  const ready = async (team: TeamService) =>
    vi.waitFor(() => {
      TestBed.tick();
      expect(team.ready()).toBe(true);
    });

  it('ausgeschaltet (Standard): nichts schreiben, nichts lesen, Status „aus“', async () => {
    const { service, team } = setup();
    team.start();
    await ready(team);
    await service.load();
    expect(service.state()).toBe('off');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebase.comparison.written).toEqual([]);
    expect(firebase.comparison.calls).not.toContain('list:club-a');
    expect(service.entries()).toEqual([]);
  });

  it('eingeschaltet: Verweis anlegen, eigene Kurzfassung ohne Gesundheitsdaten schreiben, andere Teams lesen', async () => {
    const { service, team, current } = setup();
    firebase.comparison.enabled.add('club-a');
    team.start();
    await ready(team);
    await service.load();
    expect(service.state()).toBe('ready');
    await vi.waitFor(() => expect(firebase.comparison.written).toHaveLength(1));
    const ownId = current.id();
    expect(firebase.comparison.readers.get('club-a/coach-1')).toBe(ownId);
    const written = firebase.comparison.written[0];
    expect(written.clubId).toBe('club-a');
    expect(written.teamId).toBe(ownId);
    expect(written.data.teamName).toBe('U13');
    expect(written.data.players).toEqual([{ id: 'p1', name: 'Ali Adler', birthYear: 2013, average: 2, rated: 1, attendanceRate: 100 }]);
    const text = JSON.stringify(written);
    for (const hidden of ['Verletzt', '2026-12-01', '2013-05-05']) expect(text).not.toContain(hidden);
    expect(service.entries().map((entry) => entry.teamId)).toEqual([ownId, 'other']);
    expect(service.otherTeams().map((entry) => entry.teamName)).toEqual(['U14']);

    // Gleicher Inhalt → kein erneutes Schreiben.
    await service.load();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebase.comparison.written).toHaveLength(1);
  });

  it('Team ohne Verein: Status „kein Verein“, nichts geschrieben', async () => {
    const { service, team } = setup('trainer', null);
    team.start();
    await ready(team);
    await service.load();
    expect(service.state()).toBe('no-club');
    expect(firebase.comparison.calls).toEqual([]);
  });

  it('andere Rollen lesen und schreiben nichts', async () => {
    const { service } = setup('physio');
    firebase.comparison.enabled.add('club-a');
    await service.load();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(service.state()).toBe('idle');
    expect(firebase.comparison.calls).toEqual([]);
  });

  it('Lesefehler → Status „Fehler“', async () => {
    const { service } = setup();
    firebase.comparison.enabled.add('club-a');
    firebase.comparison.readError = new Error('permission-denied');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await service.load();
    expect(service.state()).toBe('error');
  });
});
