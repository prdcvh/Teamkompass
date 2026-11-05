import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { type TeamEvent, eventFromDoc } from '../events/event';
import { ClubApi } from '../firebase/club.api';
import { RegistrationApi } from '../firebase/registration.api';
import { type ClubInvite, JOIN_CODE_DAYS, generateJoinCode, registrationLink } from '../registration/registration';
import { todayIso } from '../shared/dates';
import {
  type ClubOverview,
  type OverviewPlayer,
  type PlayerSummary,
  type TeamTrainer,
  lastAndNext,
  overviewFromDoc,
  playerSummaries,
  trainersFromMembers,
} from './club-overview';

type EventInfo = Pick<TeamEvent, 'id' | 'date' | 'title' | 'type'>;

export interface ClubTeamSummary {
  readonly teamId: string;
  readonly name: string;
  readonly label: string;
  readonly trainers: readonly TeamTrainer[];
  /** null = der Trainer-Client hat die Kurzfassung noch nicht geschrieben (Trainer war seit dem Update nicht in der App). */
  readonly overview: ClubOverview | null;
  readonly lastEvent: EventInfo | null;
  readonly nextEvent: EventInfo | null;
  /** Offene Trainercodes für dieses Team. */
  readonly invites: readonly ClubInvite[];
  /** Team konnte nicht gelesen werden (z. B. Regeln noch nicht veröffentlicht). */
  readonly failed: boolean;
}

export interface ClubSummary {
  readonly clubId: string;
  readonly name: string;
  readonly teams: readonly ClubTeamSummary[];
}

export interface TeamDetail {
  readonly team: ClubTeamSummary;
  readonly players: readonly (OverviewPlayer & { readonly summary: PlayerSummary | null })[];
  /** Termine, neueste zuerst. */
  readonly events: readonly TeamEvent[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Vereinsübersicht des Vereinsadmins (SCRUM-183, PO-Entscheidung B): alle Teams des eigenen Vereins mit Trainern,
 * Spielerzahl, letzter Aktivität und offenen Einwilligungen; in jedes Team hineinschauen (nur lesen, ohne
 * Gesundheitsdaten); Trainer einladen (Trainercode) und entfernen. Was er lesen darf, entscheiden die Regeln.
 */
@Injectable({ providedIn: 'root' })
export class ClubAdminOverviewService {
  private readonly api = inject(ClubApi);
  private readonly registration = inject(RegistrationApi);
  private readonly session = inject(SessionService);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly clubs = signal<readonly ClubSummary[]>([]);
  readonly detail = signal<TeamDetail | null>(null);
  readonly detailState = signal<'idle' | 'loading' | 'ready' | 'missing'>('idle');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly created = signal<{ teamId: string; code: string; link: string; expiresAt: Date } | null>(null);

  async load(today: string = todayIso()): Promise<void> {
    const uid = this.session.uid();
    if (!uid) return;
    this.state.set('loading');
    try {
      const clubs = await this.registration.readMyAdminClubs(uid);
      this.clubs.set(await Promise.all(clubs.map((club) => this.loadClub(club.clubId, club.name, today))));
      this.state.set('ready');
    } catch (error) {
      console.warn(error);
      this.clubs.set([]);
      this.state.set('error');
    }
  }

  private async loadClub(clubId: string, name: string, today: string): Promise<ClubSummary> {
    const [teams, invites] = await Promise.all([this.api.readTeams(clubId), this.api.readTrainerInvites(clubId).catch(() => [])]);
    const summaries = await Promise.all(teams.map((team) => this.loadTeam(team, invites, today)));
    summaries.sort((a, b) => (a.label || a.name).localeCompare(b.label || b.name, 'de', { numeric: true }));
    return { clubId, name, teams: summaries };
  }

  private async loadTeam(team: { teamId: string; name: string; label: string }, invites: readonly ClubInvite[], today: string): Promise<ClubTeamSummary> {
    const base = { ...team, invites: invites.filter((invite) => invite.teamId === team.teamId) };
    try {
      const [members, overview, events] = await Promise.all([
        this.api.readMembers(team.teamId),
        this.api.readOverview(team.teamId),
        this.api.readEvents(team.teamId),
      ]);
      const { last, next } = lastAndNext(events.map((entry) => eventFromDoc(entry.id, entry.data)), today);
      return { ...base, trainers: trainersFromMembers(members), overview: overviewFromDoc(overview), lastEvent: last, nextEvent: next, failed: false };
    } catch (error) {
      console.warn(error);
      return { ...base, trainers: [], overview: null, lastEvent: null, nextEvent: null, failed: true };
    }
  }

  /** Ein Team öffnen (nur lesen): Kader aus der Kurzfassung, Kennzahlen aus playerStats, Termine. */
  async openTeam(teamId: string, today: string = todayIso()): Promise<void> {
    this.detailState.set('loading');
    this.detail.set(null);
    if (this.state() !== 'ready') await this.load(today);
    const team = this.clubs().flatMap((club) => club.teams).find((entry) => entry.teamId === teamId);
    if (!team || team.failed) {
      this.detailState.set('missing');
      return;
    }
    try {
      const [stats, events] = await Promise.all([this.api.readPlayerStats(teamId), this.api.readEvents(teamId)]);
      const summaries = playerSummaries(stats);
      this.detail.set({
        team,
        players: (team.overview?.players ?? []).map((player) => ({ ...player, summary: summaries.get(player.id) ?? null })),
        events: events.map((entry) => eventFromDoc(entry.id, entry.data)).sort((a, b) => b.date.localeCompare(a.date)),
      });
      this.detailState.set('ready');
    } catch (error) {
      console.warn(error);
      this.detailState.set('missing');
    }
  }

  /** Trainercode für ein bestehendes Team (14 Tage, einmal, optional an eine E-Mail gebunden). */
  async inviteTrainer(clubId: string, team: Pick<ClubTeamSummary, 'teamId' | 'name' | 'label'>, rawEmail: string, origin: string, now: Date = new Date()): Promise<boolean> {
    const uid = this.session.uid();
    if (this.busy() || !uid) return false;
    const email = rawEmail.trim().toLowerCase();
    if (email && !EMAIL.test(email)) {
      this.error.set('Bitte eine gültige E-Mail-Adresse eingeben oder das Feld leer lassen.');
      return false;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const code = generateJoinCode();
      const expiresAt = new Date(now.getTime() + JOIN_CODE_DAYS * 24 * 60 * 60 * 1000);
      await this.api.createTrainerInvite({ code, clubId, teamId: team.teamId, teamName: (team.name || team.label).slice(0, 100), expiresAt, email: email || null, createdBy: uid });
      this.created.set({ teamId: team.teamId, code, link: registrationLink(origin, code), expiresAt });
      await this.load();
      return true;
    } catch (error) {
      this.error.set(`Einladung konnte nicht erstellt werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async revokeInvite(code: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.deleteInvite(code);
      await this.load();
    } catch (error) {
      this.error.set(`Einladung konnte nicht zurückgezogen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Trainer-Zugang entfernen. Das Konto selbst bleibt bestehen, es verliert nur den Zugang zu diesem Team. */
  async removeTrainer(teamId: string, trainerUid: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.removeMember(teamId, trainerUid);
      await this.load();
      return true;
    } catch (error) {
      this.error.set(`Trainer konnte nicht entfernt werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
