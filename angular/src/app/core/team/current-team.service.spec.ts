import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { playerInviteLink } from '../access/access';
import { CurrentTeam, LAST_TEAM_KEY, activeMemberships, pickTeam, rememberedTeam } from './current-team.service';

describe('CurrentTeam', () => {
  beforeEach(() => localStorage.removeItem(LAST_TEAM_KEY));

  it('startet mit dem Team des Builds (bestehende Builds laufen unverändert)', () => {
    const team = TestBed.inject(CurrentTeam);
    expect(team.id()).toBe(environment.teamId);
    expect(team.name()).toBe(environment.teamName);
    expect(team.logoSrc()).toBe('club-logo.png');
  });

  it('wechselt Team und Angaben, merkt sich die Wahl und setzt beim Abmelden zurück', () => {
    const team = TestBed.inject(CurrentTeam);
    team.select('Team0000000000000001');
    expect(team.id()).toBe('Team0000000000000001');
    // Nie den Namen des Build-Teams für ein anderes Team zeigen.
    expect(team.name()).toBe('Team');
    expect(rememberedTeam()).toBe('Team0000000000000001');
    team.applyMeta({ name: 'SV Muster U11', label: 'U11', clubId: 'Club0000000000000001', clubName: 'SV Muster', logoUrl: null });
    expect(team.title()).toBe('SV Muster · U11');
    // Neuer Verein bekommt nicht das mitgelieferte Logo eines anderen Vereins.
    expect(team.logoSrc()).toBeNull();
    team.reset();
    expect(team.id()).toBe(environment.teamId);
    expect(team.name()).toBe(environment.teamName);
  });

  it('blendet abgelaufene und doppelte Mitgliedschaften aus', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const list = activeMemberships(
      [
        { teamId: 'A', role: 'trainer', playerId: null, expiresAt: null },
        { teamId: 'B', role: 'player', playerId: 'p1', expiresAt: new Date('2026-10-01T00:00:00Z') },
        { teamId: 'C', role: 'parent', playerId: 'p2', expiresAt: new Date('2026-11-01T00:00:00Z') },
        { teamId: 'A', role: 'trainer', playerId: null, expiresAt: null },
      ],
      now,
    );
    expect(list.map((entry) => entry.teamId)).toEqual(['A', 'C']);
  });

  it('wählt das gemerkte Team, sonst das einzige, sonst keins (Auswahlseite)', () => {
    expect(pickTeam(['A'], null)).toBe('A');
    expect(pickTeam(['A', 'B'], 'B')).toBe('B');
    expect(pickTeam(['A', 'B'], 'X')).toBeNull();
    expect(pickTeam(['A', 'B'], null)).toBeNull();
    expect(pickTeam([], 'A')).toBeNull();
  });

  it('Einladungslink für Spieler/Eltern enthält Team und Code', () => {
    expect(playerInviteLink('https://teamkompass-u14.web.app', 'U17', 'abc123')).toBe('https://teamkompass-u14.web.app/anmelden?team=U17&code=abc123');
  });
});
