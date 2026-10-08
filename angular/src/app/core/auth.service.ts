import { Injectable, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService, type FirebaseUser, type InviteRecord } from './firebase.service';
import { clearLocalTeamData } from './local-data';
import type { Role } from './role';
import { SessionService } from './session.service';

/**
 * loading: Firebase wird gestartet – bis hierhin ist nichts von den Teamdaten sichtbar
 * signedOut: niemand angemeldet (oder Anmeldung verweigert)
 * ready: angemeldet, Rolle bekannt
 * unavailable: Firebase nicht erreichbar – die App bleibt gesperrt statt Daten zu zeigen
 */
export type AuthStatus = 'loading' | 'signedOut' | 'ready' | 'unavailable';

/** Wartezeit vor dem zweiten Versuch, ein frisch angemeldetes Konto anzulegen (siehe claim). */
export const CLAIM_RETRY_DELAY_MS = 1500;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);

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

  /** Startet die Anmeldeprüfung (einmal beim App-Start). */
  start(retryDelayMs = CLAIM_RETRY_DELAY_MS): void {
    if (this.started) return;
    this.started = true;
    this.retryDelayMs = retryDelayMs;
    this.firebase
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
      const user = await this.firebase.signInWithEmail(email.trim(), password);
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
        uid = await this.firebase.signInAnonymously();
      } catch (error) {
        this.error.set(authErrorMessage(errorCode(error)));
        return;
      }

      let invite: InviteRecord | null;
      try {
        invite = await this.firebase.readInvite(code);
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
      await this.firebase.signOut();
    } catch (error) {
      console.error(error);
    }
    this.enter(null);
    this.reset();
    this.status.set('signedOut');
  }

  private async claim(uid: string, code: string, invite: InviteRecord): Promise<boolean> {
    try {
      await this.firebase.claimInvite(uid, code, invite);
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
      await this.firebase.claimInvite(uid, code, invite);
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
      await this.firebase.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  private async onUser(user: FirebaseUser | null): Promise<void> {
    this.enter(user);
    if (!user) {
      this.reset();
      this.markStatus('signedOut');
      return;
    }
    // Spieler-Anmeldung läuft: das members-Dokument entsteht erst im Anschluss (signInWithCode).
    if (this.claiming && user.isAnonymous) return;
    await this.verify(user);
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
      const member = await this.firebase.readMember(user.uid);
      if (epoch !== this.epoch) return; // veraltet: inzwischen abgemeldet oder anderes Konto
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
      this.session.role.set(member.role);
      this.session.playerId.set(member.playerId);
      this.session.displayName.set(displayNameFor(member.role, user.email));
      this.error.set('');
      this.markStatus('ready');
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
    clearLocalTeamData();
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
  return role === 'medical' ? 'Medizin' : 'Trainer';
}
