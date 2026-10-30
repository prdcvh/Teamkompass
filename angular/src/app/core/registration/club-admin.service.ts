import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { RegistrationApi } from '../firebase/registration.api';
import { type ClubInvite, JOIN_CODE_DAYS, generateJoinCode, generateTeamId, registrationLink } from './registration';

export interface AdminClub {
  readonly clubId: string;
  readonly name: string;
  readonly invites: readonly ClubInvite[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Vereinsadmin (SCRUM-181): Beitrittscodes für neue Trainer im eigenen Verein. Wer den Code einlöst, legt ein neues
 * Team im Verein an und wird dessen Trainer – aber nicht Vereinsadmin. Der Vereinsadmin sieht dadurch keine Teamdaten.
 */
@Injectable({ providedIn: 'root' })
export class ClubAdminService {
  private readonly api = inject(RegistrationApi);
  private readonly session = inject(SessionService);

  readonly clubs = signal<readonly AdminClub[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  /** Zuletzt erzeugter Code samt Link (nur bis zum Schließen sichtbar). */
  readonly created = signal<{ code: string; link: string; expiresAt: Date } | null>(null);

  async load(): Promise<void> {
    const uid = this.session.uid();
    if (!uid) return;
    try {
      const clubs = await this.api.readMyAdminClubs(uid);
      const withInvites = await Promise.all(
        clubs.map(async (club) => ({ ...club, invites: await this.api.readJoinInvites(club.clubId).catch(() => []) })),
      );
      this.clubs.set(withInvites);
    } catch (error) {
      // Kein Vereinsadmin oder Regeln noch nicht veröffentlicht: Bereich bleibt einfach verborgen.
      console.warn(error);
      this.clubs.set([]);
    }
  }

  async createInvite(clubId: string, rawEmail: string, origin: string, now: Date = new Date()): Promise<boolean> {
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
      await this.api.createJoinInvite({ code, clubId, teamId: generateTeamId(), expiresAt, email: email || null, createdBy: uid });
      this.created.set({ code, link: registrationLink(origin, code), expiresAt });
      await this.load();
      return true;
    } catch (error) {
      this.error.set(`Einladung konnte nicht erstellt werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async revoke(code: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.deleteJoinInvite(code);
      await this.load();
    } catch (error) {
      this.error.set(`Einladung konnte nicht zurückgezogen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    } finally {
      this.busy.set(false);
    }
  }
}
