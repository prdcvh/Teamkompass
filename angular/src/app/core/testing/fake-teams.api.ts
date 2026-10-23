import type { TeamsApi } from '../firebase/teams.api';
import type { TeamMembership, TeamMeta } from '../team/current-team.service';

/**
 * Ersatz für {@link TeamsApi}: Teamsuche und Team-Angaben im Speicher. Schreibt bewusst NICHT in die gemeinsame
 * Aufrufliste, damit bestehende Tests mit exakten Aufruffolgen unverändert bleiben (eigene Liste `calls`).
 */
export class FakeTeamsApi implements Pick<TeamsApi, keyof TeamsApi> {
  readonly calls: string[] = [];
  /** uid → Mitgliedschaften. Leer = wie vor dem Skriptlauf (keine uid-Felder): Rückfall auf das Team des Builds. */
  memberships = new Map<string, TeamMembership[]>();
  metas = new Map<string, TeamMeta>();
  membershipsError: unknown = null;

  async readMyMemberships(uid: string): Promise<TeamMembership[]> {
    this.calls.push(`memberships:${uid}`);
    if (this.membershipsError) throw this.membershipsError;
    return this.memberships.get(uid) ?? [];
  }

  async readTeamMeta(teamId: string): Promise<TeamMeta | null> {
    this.calls.push(`meta:${teamId}`);
    return this.metas.get(teamId) ?? null;
  }
}
