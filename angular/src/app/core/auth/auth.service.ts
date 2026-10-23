import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { AccessApi } from '../firebase/access.api';
import { AuthApi } from '../firebase/auth.api';
import type { FirebaseUser, InviteRecord, MemberRecord } from '../firebase/types';
import { clearLocalTeamData } from '../device/local-data';
import { CurrentTeam, pickTeam, rememberTeam, rememberedTeam } from '../team/current-team.service';
import type { Role } from './role';
import { SessionService } from './session.service';
import { TeamAccess } from './team-access';

/**
 * loading: Firebase wird gestartet – bis hierhin ist nichts von den Teamdaten sichtbar
 * signedOut: niemand angemeldet (oder Anmeldung verweigert)
 * ready: angemeldet, Rolle bekannt
 * unavailable: Firebase nicht erreichbar – die App bleibt gesperrt statt Daten zu zeigen
 * chooseTeam: angemeldet, mehrere Teams und keins auf diesem Gerät gemerkt – erst die Teamauswahl (SCRUM-181)
 */
export type AuthStatus = 'loading' | 'signedOut' | 'ready' | 'unavailable' | 'chooseTeam';

/** Wartezeit vor dem zweiten Versuch, ein frisch angemeldetes Konto anzulegen (siehe claim). */
export const CLAIM_RETRY_DELAY_MS = 1500;

/** Wartezeit vor dem zweiten Versuch, den lokalen Firestore-Speicher zu leeren (ein anderer Tab hält ihn evtl. noch kurz offen). */
export const CACHE_CLEAR_RETRY_MS = 1000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly authApi = inject(AuthApi);
  private readonly accessApi = inject(AccessApi);
  private readonly session = inject(SessionService);
  private readonly teamAccess = inject(TeamAccess);
  private readonly team = inject(CurrentTeam);

  readonly status = signal<AuthStatus>('loading');
  readonly error = signal('');
  readonly busy = signal(false);

  private started = false;
  private resolveFirstState!: () => void;
  private readonly firstState = new Promise<void>((resolve) => (this.resolveFirstState = resolve));
  /** Verhindert Doppel-Absenden (z. B. Doppel-Tap am Handy) beim Einlösen eines Codes. */
  private claiming = false;
  private retryDelayMs = CLAIM_RETRY_DELAY_MS;
  /**
   * Identität, deren Zugang gerade geprüft wird bzw. geprüft wurde (null = niemand). `epoch` zählt jeden
   * Wechsel (Anmeldung, Abmeldung, anderes Konto). Antworten einer Prüfung aus einer früheren Epoche werden
   * verworfen, damit eine verspätete Antwort weder eine Abmeldung rückgängig macht noch die Rolle eines
   * neueren Kontos überschreibt (SCRUM-88).
   */
  private epoch = 0;
  private identityUid: string | null = null;
  private inflight: Promise<void> | null = null;
  private purging: Promise<void> | null = null;
  /** Registrierung läuft: angemeldetes Konto ohne Team nicht abmelden (SCRUM-181). */
  private registering = false;
  /** Teamauswahl offen: Konto und seine Teams bis zur Wahl. */
  private pendingUser: FirebaseUser | null = null;
  private pendingTeams = new Map<string, MemberRecord>();

  /** Startet die Anmeldeprüfung (einmal beim App-Start). */
  start(retryDelayMs = CLAIM_RETRY_DELAY_MS): void {
    if (this.started) return;
    this.started = true;
    this.retryDelayMs = retryDelayMs;
    this.authApi
      .watchAuth((user) => void this.onUser(user))
      .catch((error) => {
        console.error(error);
        this.fail(
          'Die Anmeldung ist gerade nicht erreichbar (offline oder Netzwerkfehler). Es werden keine Teamdaten angezeigt. Bitte Verbindung prüfen und die Seite neu laden.',
        );
      });
  }

  /** Löst auf, sobald der erste Anmeldezustand feststeht (für Router-Guards). */
  whenResolved(): Promise<void> {
    return this.firstState;
  }

  async signInTrainer(email: string, password: string): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      const user = await this.authApi.signInWithEmail(email.trim(), password);
      // Erst fertig, wenn der Zugang geprüft ist – sonst steht der Status beim ersten Klick noch auf „signedOut“ (SCRUM-87).
      await this.verify(user);
    } catch (error) {
      this.error.set(authErrorMessage(errorCode(error)));
    } finally {
      this.busy.set(false);
    }
  }

  /** Spieler/Eltern: anonym anmelden, Code prüfen, Zugang anlegen und Code verbrauchen. */
  async signInWithCode(rawCode: string): Promise<void> {
    if (this.claiming) return;
    const code = rawCode.trim();
    if (!code) {
      this.error.set('Bitte den Einladungscode eingeben.');
      return;
    }
    this.claiming = true;
    this.busy.set(true);
    this.error.set('');
    try {
      let uid: string;
      try {
        uid = await this.authApi.signInAnonymously();
      } catch (error) {
        this.error.set(authErrorMessage(errorCode(error)));
        return;
      }

      let invite: InviteRecord | null;
      try {
        invite = await this.accessApi.readInvite(code);
      } catch (error) {
        this.error.set(`Code konnte nicht geprüft werden. ${authErrorMessage(errorCode(error))}`);
        await this.abandon();
        return;
      }
      if (!invite) {
        this.error.set('Dieser Code ist ungültig.');
        await this.abandon();
        return;
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        this.error.set('Dieser Code ist abgelaufen.');
        await this.abandon();
        return;
      }

      if (!(await this.claim(uid, code, invite))) return;
      // Der Anmeldezustand hat sich schon vor dem Anlegen des Zugangs gemeldet (damals noch
      // ohne members-Dokument) – jetzt die Rolle nachladen.
      await this.verify({ uid, isAnonymous: true, email: null });
    } finally {
      this.claiming = false;
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.authApi.signOut();
    } catch (error) {
      console.error(error);
    }
    this.enter(null);
    this.reset();
    // Erst weiterleiten, wenn auch der lokale Firestore-Speicher leer ist (geteilte Geräte, Daten von Minderjährigen).
    await this.purgeLocalCache();
    this.status.set('signedOut');
  }

  private async claim(uid: string, code: string, invite: InviteRecord): Promise<boolean> {
    try {
      await this.accessApi.claimInvite(uid, code, invite);
      return true;
    } catch (first) {
      if (!errorCode(first).includes('permission-denied')) {
        console.error(first);
        this.error.set(`Zugang konnte nicht angelegt werden. ${authErrorMessage(errorCode(first))}`);
        return false;
      }
    }
    // Direkt nach der Anmeldung kommt es manchmal kurz zu permission-denied, weil der frische
    // Token noch nicht überall angekommen ist – ein zweiter Versuch behebt das meist von selbst.
    await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    try {
      await this.accessApi.claimInvite(uid, code, invite);
      return true;
    } catch (second) {
      console.error(second);
      this.error.set(`Zugang konnte nicht angelegt werden. ${authErrorMessage(errorCode(second))}`);
      return false;
    }
  }

  /** Bricht eine angefangene Code-Anmeldung ab, ohne den Anmeldezustand zu verändern. */
  private async abandon(): Promise<void> {
    try {
      await this.authApi.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  private async onUser(user: FirebaseUser | null): Promise<void> {
    this.enter(user);
    if (!user) {
      this.reset();
      // Auch bei Abmeldung in einem anderen Tab, abgelaufener Anmeldung und beim Start ohne Anmeldung.
      void this.purgeLocalCache();
      this.markStatus('signedOut');
      return;
    }
    // Spieler-Anmeldung läuft: das members-Dokument entsteht erst im Anschluss (signInWithCode).
    if (this.claiming && user.isAnonymous) return;
    // Registrierung läuft (SCRUM-181): Konto ohne Team bis zum Einlösen des Codes – nicht abmelden.
    if (this.registering && !user.isAnonymous) return;
    await this.verify(user);
  }

  /** Registrierungsseite: ab jetzt wird ein angemeldetes Konto ohne Team nicht abgemeldet. */
  beginRegistration(): void {
    this.registering = true;
  }

  /** Registrierung abgebrochen oder Seite verlassen. */
  endRegistration(): void {
    this.registering = false;
  }

  /** Nach dem Einlösen des Codes: Zugang neu prüfen und direkt das neue Team öffnen. */
  async completeRegistration(user: FirebaseUser, teamId: string): Promise<void> {
    this.registering = false;
    rememberTeam(teamId);
    this.team.select(teamId);
    // Neue Prüfung erzwingen (gleiche Identität wie bisher, aber jetzt mit Team).
    this.identityUid = null;
    await this.verify(user);
  }

  /** Teamauswahl: das gewählte Team öffnen (nur im Zustand „chooseTeam“, sonst nur merken). */
  chooseTeam(teamId: string): boolean {
    rememberTeam(teamId);
    const user = this.pendingUser;
    const member = this.pendingTeams.get(teamId);
    if (this.status() !== 'chooseTeam' || !user || !member) return false;
    this.team.select(teamId);
    this.applyMember(user, member, this.epoch);
    return true;
  }

  private applyMember(user: FirebaseUser, member: MemberRecord, epoch: number): void {
    this.pendingUser = null;
    this.pendingTeams = new Map();
    this.session.role.set(member.role);
    this.session.playerId.set(member.playerId);
    this.session.displayName.set(displayNameFor(member.role, user.email));
    this.session.uid.set(user.uid);
    this.session.email.set(user.email);
    this.error.set('');
    this.markStatus('ready');
    this.teamAccess.loadMeta(() => epoch === this.epoch);
    void this.teamAccess.loadChoiceMetas(() => epoch === this.epoch);
  }

  /** Meldet die aktuelle Identität; ein Wechsel beginnt eine neue Epoche und macht laufende Prüfungen ungültig. */
  private enter(user: FirebaseUser | null): void {
    const uid = user?.uid ?? null;
    if (uid === this.identityUid) return;
    this.identityUid = uid;
    this.epoch += 1;
    this.inflight = null;
  }

  /** Prüft den Zugang der Identität genau einmal; Listener und Anmelde-Aufruf teilen sich dieselbe Prüfung. */
  private verify(user: FirebaseUser): Promise<void> {
    this.enter(user);
    this.inflight ??= this.loadMember(user, this.epoch);
    return this.inflight;
  }

  private async loadMember(user: FirebaseUser, epoch: number): Promise<void> {
    try {
      // Teams des Kontos (SCRUM-181): Teamsuche, Rückfall auf das Team des Builds.
      const teams = await this.teamAccess.find(user);
      if (epoch !== this.epoch) return; // veraltet: inzwischen abgemeldet oder anderes Konto
      this.team.choices.set([...teams].map(([teamId, record]) => ({ teamId, role: record.role, meta: null })));
      const chosen = pickTeam([...teams.keys()], rememberedTeam());
      if (teams.size > 0 && !chosen) {
        // Mehrere Teams und keins auf diesem Gerät gemerkt: Auswahlseite. Rolle/Teamdaten erst nach der Wahl.
        this.pendingUser = user;
        this.pendingTeams = teams;
        this.session.uid.set(user.uid);
        this.session.email.set(user.email);
        this.error.set('');
        void this.teamAccess.loadChoiceMetas(() => epoch === this.epoch);
        this.markStatus('chooseTeam');
        return;
      }
      const member = chosen ? (teams.get(chosen) ?? null) : null;
      if (chosen) this.team.select(chosen);
      if (!member) {
        // Anonyme Konten ohne Mitgliedschaft sind übrig gebliebene Code-Versuche: still beenden.
        if (!user.isAnonymous) {
          console.warn('Kein Teamzugang hinterlegt.');
          this.error.set('Für dieses Team ist kein Zugang hinterlegt. Bitte wende dich an den Trainer.');
        }
        await this.abandon();
        this.reset();
        this.markStatus('signedOut');
        return;
      }
      this.applyMember(user, member, epoch);
    } catch (error) {
      if (epoch !== this.epoch) return;
      console.error(error);
      this.reset();
      this.error.set(`Zugang konnte nicht geprüft werden. ${authErrorMessage(errorCode(error))}`);
      this.markStatus('signedOut');
    }
  }

  private fail(message: string): void {
    this.reset();
    this.error.set(message);
    this.markStatus('unavailable');
  }

  /** Ohne Anmeldung bleibt weder Teamstand im Speicher noch im Browser liegen. */
  private reset(): void {
    this.session.clear();
    this.pendingUser = null;
    this.pendingTeams = new Map();
    this.team.reset();
    clearLocalTeamData();
  }

  /**
   * Leert den lokalen Firestore-Speicher (SCRUM-199). Mehrere gleichzeitige Aufrufe teilen sich einen Lauf; ein Fehler
   * darf das Abmelden nie aufhalten.
   */
  private purgeLocalCache(): Promise<void> {
    this.purging ??= (async () => {
      try {
        if (!(await this.authApi.clearLocalCache())) {
          await new Promise((resolve) => setTimeout(resolve, CACHE_CLEAR_RETRY_MS));
          await this.authApi.clearLocalCache();
        }
      } catch (error) {
        console.error(error);
      } finally {
        this.purging = null;
      }
    })();
    return this.purging;
  }

  private markStatus(status: AuthStatus): void {
    this.status.set(status);
    this.resolveFirstState();
  }
}

export function displayNameFor(role: Role, email: string | null): string {
  if (role === 'player') return 'Spieler';
  if (role === 'parent') return 'Eltern';
  if (email) return email.split('@')[0];
  if (role === 'scout') return 'Scout';
  return role === 'physio' ? 'Medizin' : 'Trainer';
}
