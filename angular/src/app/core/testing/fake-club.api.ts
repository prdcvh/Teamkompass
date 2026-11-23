import type { ClubOverviewData } from '../club/club-overview';
import type { ClubApi, ClubTeamInfo } from '../firebase/club.api';
import type { RawDoc } from '../firebase/types';
import type { ClubInvite } from '../registration/registration';

/** Ersatz für {@link ClubApi} (Vereinsübersicht, SCRUM-183). Eigene Aufrufliste wie FakeTeamsApi. */
export class FakeClubApi implements Pick<ClubApi, keyof ClubApi> {
  readonly calls: string[] = [];
  teams = new Map<string, ClubTeamInfo[]>();
  members = new Map<string, RawDoc[]>();
  events = new Map<string, RawDoc[]>();
  stats = new Map<string, RawDoc[]>();
  overviews = new Map<string, Readonly<Record<string, unknown>>>();
  invites: ClubInvite[] = [];
  /** Jeder geschriebenen Kurzfassung je Team (Reihenfolge). */
  written: { teamId: string; data: ClubOverviewData }[] = [];
  removeError: unknown = null;

  async readTeams(clubId: string): Promise<ClubTeamInfo[]> {
    this.calls.push(`teams:${clubId}`);
    return [...(this.teams.get(clubId) ?? [])];
  }

  async readMembers(teamId: string): Promise<RawDoc[]> {
    return [...(this.members.get(teamId) ?? [])];
  }

  async readEvents(teamId: string): Promise<RawDoc[]> {
    return [...(this.events.get(teamId) ?? [])];
  }

  async readPlayerStats(teamId: string): Promise<RawDoc[]> {
    return [...(this.stats.get(teamId) ?? [])];
  }

  async readOverview(teamId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`overview:${teamId}`);
    return this.overviews.get(teamId) ?? null;
  }

  async writeOverview(teamId: string, data: ClubOverviewData): Promise<void> {
    this.calls.push(`writeOverview:${teamId}`);
    this.written.push({ teamId, data });
    this.overviews.set(teamId, { ...data, updatedAt: { toDate: () => new Date('2026-11-04T10:00:00Z') } });
  }

  async removeMember(teamId: string, uid: string): Promise<void> {
    this.calls.push(`remove:${teamId}:${uid}`);
    if (this.removeError) throw this.removeError;
    this.members.set(teamId, (this.members.get(teamId) ?? []).filter((member) => member.id !== uid));
  }

  async readTrainerInvites(clubId: string): Promise<ClubInvite[]> {
    return this.invites.filter((invite) => invite.clubId === clubId);
  }

  async createTrainerInvite(invite: { code: string; clubId: string; teamId: string; teamName: string; expiresAt: Date; email: string | null; createdBy: string }): Promise<void> {
    this.calls.push(`createTrainer:${invite.teamId}`);
    this.invites.push({ code: invite.code, kind: 'trainer', clubId: invite.clubId, teamId: invite.teamId, teamName: invite.teamName, expiresAt: invite.expiresAt, email: invite.email });
  }

  async deleteInvite(code: string): Promise<void> {
    this.calls.push(`deleteInvite:${code}`);
    this.invites = this.invites.filter((invite) => invite.code !== code);
  }
}
