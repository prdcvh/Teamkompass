import { Injectable, inject } from '@angular/core';
import { AccessApi } from '../firebase/access.api';
import { TeamsApi } from '../firebase/teams.api';
import type { FirebaseUser, MemberRecord } from '../firebase/types';
import { CurrentTeam, activeMemberships } from '../team/current-team.service';
import { normalizeRole } from './role';

/** Befristeter Zugang abgelaufen? (Gleiche Grenze wie die Firestore-Regeln: Ablaufzeit vor jetzt.) */
export function memberExpired(member: Pick<MemberRecord, 'expiresAt'>, now: Date = new Date()): boolean {
  return !!member.expiresAt && member.expiresAt.getTime() < now.getTime();
}

/**
 * „Meine Teams“ für den {@link AuthService} (SCRUM-181): Teamsuche, Rückfall auf das Team des Builds und Anzeigenamen.
 */
@Injectable({ providedIn: 'root' })
export class TeamAccess {
  private readonly teamsApi = inject(TeamsApi);
  private readonly accessApi = inject(AccessApi);
  private readonly team = inject(CurrentTeam);

  /**
   * Teams des Kontos: Teamsuche über alle `members` mit eigener uid (abgelaufene ausgeblendet). Dazu immer das Team des
   * Builds (und ein per Einladungslink gewähltes Team), falls die Suche es nicht liefert – vor dem Lauf von
   * scripts/assign-clubs.mjs haben bestehende Zugänge noch kein uid-Feld, und ohne die neuen Regeln ist die Teamsuche
   * gesperrt. So laufen die bestehenden Builds unverändert weiter.
   */
  async find(user: FirebaseUser): Promise<Map<string, MemberRecord>> {
    const teams = new Map<string, MemberRecord>();
    try {
      for (const entry of activeMemberships(await this.teamsApi.readMyMemberships(user.uid))) {
        const role = normalizeRole(entry.role);
        if (role) teams.set(entry.teamId, { role, playerId: entry.playerId });
      }
    } catch (error) {
      console.warn('Teamsuche nicht möglich, nutze das Team dieser Adresse.', error);
    }
    for (const teamId of new Set([this.team.id(), this.team.fallbackId])) {
      if (teams.has(teamId)) continue;
      try {
        const legacy = await this.accessApi.readMember(user.uid, teamId);
        // Abgelaufene Zugänge zählen nicht (wie in der Teamsuche) – sonst käme ein befristeter Spieler-Zugang nach
        // Ablauf per E-Mail-Anmeldung wieder bis in seine Ansicht (SCRUM-114).
        if (legacy && !memberExpired(legacy)) teams.set(teamId, legacy);
      } catch (error) {
        if (teams.size === 0 && teamId === this.team.fallbackId) throw error;
        console.warn(error);
      }
    }
    return teams;
  }

  /** Name, Altersklasse und Verein des geöffneten Teams aus der Datenbank (Altteams behalten die Angaben des Builds). */
  loadMeta(stillCurrent: () => boolean): void {
    const teamId = this.team.id();
    void this.teamsApi
      .readTeamMeta(teamId)
      .then((meta) => {
        if (meta && stillCurrent() && this.team.id() === teamId) this.team.applyMeta(meta);
      })
      .catch((error) => console.warn(error));
  }

  /** Für Teamauswahl und „Team wechseln“: Namen aller Teams nachladen. */
  async loadChoiceMetas(stillCurrent: () => boolean): Promise<void> {
    const choices = this.team.choices();
    if (choices.length < 2) return;
    const metas = await Promise.all(choices.map((choice) => this.teamsApi.readTeamMeta(choice.teamId).catch(() => null)));
    if (stillCurrent()) this.team.choices.set(choices.map((choice, index) => ({ ...choice, meta: metas[index] })));
  }
}
