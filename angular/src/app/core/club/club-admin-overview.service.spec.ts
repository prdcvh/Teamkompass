import { TestBed } from '@angular/core/testing';
import { SessionService } from '../auth/session.service';
import { INVITE_CODE_PATTERN } from '../registration/registration';
import { FakeFirebase, provideFakeFirebase } from '../testing/fake-firebase';
import { CLUB_OVERVIEW_VERSION } from './club-overview';
import { ClubAdminOverviewService } from './club-admin-overview.service';

describe('ClubAdminOverviewService (Vereinsübersicht, SCRUM-183)', () => {
  let firebase: FakeFirebase;
  let service: ClubAdminOverviewService;

  beforeEach(() => {
    firebase = new FakeFirebase();
    firebase.registration.adminClubs = [{ clubId: 'A', name: 'Verein A', logoUrl: null }];
    firebase.club.teams.set('A', [
      { teamId: 'T2', name: 'Verein A U15', label: 'U15' },
      { teamId: 'T1', name: 'Verein A U9', label: 'U9' },
    ]);
    firebase.club.members.set('T1', [
      { id: 'c1', data: { role: 'trainer', email: 'coach@verein.de' } },
      { id: 'pl', data: { role: 'player', playerId: 'p1' } },
    ]);
    firebase.club.overviews.set('T1', {
      version: CLUB_OVERVIEW_VERSION,
      playerCount: 1,
      consentPending: 1,
      consentRevoked: 0,
      players: [{ id: 'p1', name: 'Ali', number: 9, positions: ['ST'] }],
    });
    firebase.club.events.set('T1', [
      { id: 'e1', data: { title: 'Training', date: '2026-11-03', type: 'Training' } },
      { id: 'e2', data: { title: 'Spiel gegen B', date: '2026-11-08', type: 'Spiel' } },
    ]);
    firebase.club.stats.set('T1', [
      { id: 'p1', data: { playerId: 'p1', version: 1, events: { e1: { attendance: 'present', effort: 2, technique: 2, tactics: 2, comprehension: 2, minutes: 60, goals: 1, assists: 0 } } } },
    ]);
    TestBed.configureTestingModule({ providers: [...provideFakeFirebase(firebase)] });
    TestBed.inject(SessionService).uid.set('adminA');
    service = TestBed.inject(ClubAdminOverviewService);
  });

  it('zeigt alle Teams des Vereins (nach Altersklasse) mit Trainern, Spielerzahl, Einwilligungen und Terminen', async () => {
    await service.load('2026-11-04');
    expect(service.state()).toBe('ready');
    const [club] = service.clubs();
    expect(club.teams.map((team) => team.label)).toEqual(['U9', 'U15']);
    const u9 = club.teams[0];
    expect(u9.trainers).toEqual([{ uid: 'c1', email: 'coach@verein.de' }]);
    expect(u9.overview?.playerCount).toBe(1);
    expect(u9.overview?.consentPending).toBe(1);
    expect(u9.lastEvent?.title).toBe('Training');
    expect(u9.nextEvent?.title).toBe('Spiel gegen B');
    // Team ohne Kurzfassung (Trainer war noch nicht in der App): ohne Zahlen, aber nicht als Fehler.
    expect(club.teams[1].overview).toBeNull();
    expect(club.teams[1].failed).toBe(false);
  });

  it('ohne Vereinsadmin-Rolle: keine Vereine', async () => {
    firebase.registration.adminClubs = [];
    await service.load();
    expect(service.clubs()).toEqual([]);
  });

  it('Team ansehen: Kader aus der Kurzfassung mit Kennzahlen, Termine neueste zuerst', async () => {
    await service.openTeam('T1', '2026-11-04');
    expect(service.detailState()).toBe('ready');
    const detail = service.detail()!;
    expect(detail.players).toEqual([{ id: 'p1', name: 'Ali', number: 9, positions: ['ST'], summary: { appearances: 1, goals: 1, assists: 0, average: 2 } }]);
    expect(detail.events.map((event) => event.id)).toEqual(['e2', 'e1']);
  });

  it('fremdes Team: nicht gefunden', async () => {
    await service.openTeam('FREMD');
    expect(service.detailState()).toBe('missing');
    expect(service.detail()).toBeNull();
  });

  it('Trainer einladen: Trainercode für das bestehende Team (14 Tage, Regelformat) und zurückziehen', async () => {
    await service.load();
    const team = service.clubs()[0].teams[0];
    expect(await service.inviteTrainer('A', team, ' Neu@Verein.de ', 'https://app.example', new Date('2026-11-04T10:00:00Z'))).toBe(true);
    const created = service.created()!;
    expect(created.code).toMatch(INVITE_CODE_PATTERN);
    expect(created.link).toBe(`https://app.example/registrieren?code=${created.code}`);
    expect(created.expiresAt.toISOString()).toBe('2026-11-18T10:00:00.000Z');
    expect(firebase.club.invites[0]).toMatchObject({ kind: 'trainer', clubId: 'A', teamId: 'T1', teamName: 'Verein A U9', email: 'neu@verein.de' });
    expect(service.clubs()[0].teams[0].invites).toHaveLength(1);
    await service.revokeInvite(created.code);
    expect(service.clubs()[0].teams[0].invites).toEqual([]);
  });

  it('lehnt eine ungültige E-Mail ab', async () => {
    await service.load();
    expect(await service.inviteTrainer('A', service.clubs()[0].teams[0], 'keine-mail', 'https://app.example')).toBe(false);
    expect(service.error()).toContain('E-Mail');
    expect(firebase.club.invites).toEqual([]);
  });

  it('Trainer entfernen; ein Fehler wird angezeigt', async () => {
    await service.load();
    expect(await service.removeTrainer('T1', 'c1')).toBe(true);
    expect(firebase.club.calls).toContain('remove:T1:c1');
    expect(service.clubs()[0].teams[0].trainers).toEqual([]);
    firebase.club.removeError = Object.assign(new Error('nein'), { code: 'permission-denied' });
    expect(await service.removeTrainer('T1', 'pl')).toBe(false);
    expect(service.error()).toContain('Trainer konnte nicht entfernt werden');
  });

  it('Vereinsvergleich (SCRUM-197): Standard aus; einschalten; beim Ausschalten werden die geteilten Werte gelöscht', async () => {
    await service.load('2026-11-04');
    expect(service.clubs()[0].comparisonEnabled).toBe(false);
    expect(await service.setComparison('A', true)).toBe(true);
    expect(service.clubs()[0].comparisonEnabled).toBe(true);
    expect(firebase.comparison.enabled.has('A')).toBe(true);
    firebase.comparison.docs.set('A', new Map([['T1', { version: 1 }]]));
    expect(await service.setComparison('A', false)).toBe(true);
    expect(service.clubs()[0].comparisonEnabled).toBe(false);
    expect(firebase.comparison.calls).toEqual(['enabled:A', 'set:A:true', 'set:A:false', 'deleteAll:A']);
    expect(firebase.comparison.docs.has('A')).toBe(false);
  });
});
