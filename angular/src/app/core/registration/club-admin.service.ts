import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { RegistrationApi } from '../firebase/registration.api';
import { CurrentTeam } from '../team/current-team.service';
import { isLogoDataUrl } from './club-logo';
import { type ClubInvite, JOIN_CODE_DAYS, generateJoinCode, generateTeamId, registrationLink } from './registration';

export interface AdminClub {
  readonly clubId: string;
  readonly name: string;
  /** Vereinslogo als data:-URL (SCRUM-182), null = keins. */
  readonly logoUrl: string | null;
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
  private readonly team = inject(CurrentTeam);

  readonly clubs = signal<readonly AdminClub[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  /** Hinweis nach dem Speichern von Name/Logo. */
  readonly saved = signal('');
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

  /**
   * Name und Logo des Vereins speichern (SCRUM-182). Das Logo ist schon verkleinert (siehe club-logo.ts); die Regeln
   * prüfen Format und Größe noch einmal. Gehört das geöffnete Team zu diesem Verein, sieht man das neue Logo sofort.
   */
  async saveClub(clubId: string, rawName: string, logoUrl: string | null): Promise<boolean> {
    if (this.busy()) return false;
    const name = rawName.trim();
    this.saved.set('');
    if (!name || name.length > 100) {
      this.error.set('Bitte einen Vereinsnamen mit höchstens 100 Zeichen eingeben.');
      return false;
    }
    if (logoUrl !== null && !isLogoDataUrl(logoUrl)) {
      this.error.set('Das Logo ist zu groß oder hat ein unbekanntes Format.');
      return false;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.updateClub(clubId, { name, logoUrl });
      this.clubs.update((clubs) => clubs.map((club) => (club.clubId === clubId ? { ...club, name, logoUrl } : club)));
      this.team.applyClub(clubId, name, logoUrl);
      this.saved.set('Gespeichert.');
      return true;
    } catch (error) {
      this.error.set(`Vereinsangaben konnten nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
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
