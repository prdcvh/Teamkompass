import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { RatingsApi } from '../firebase/ratings.api';
import { RankingService } from '../points/ranking.service';
import { SyncService } from '../shell/sync.service';
import { CurrentTeam } from '../team/current-team.service';
import { deviceStorage } from './live';
import { OUTBOX_STORAGE_KEY, type PendingLiveChange, loadOutbox, newChangeId, outboxFor, saveOutbox } from './live-outbox';

/** Fehler, bei denen ein erneuter Versuch nie gelingt: Änderung verwerfen und deutlich melden (statt ewig zu warten). */
const FINAL_ERRORS = ['permission-denied', 'invalid-argument', 'unauthenticated', 'failed-precondition'];

/**
 * Postausgang für Live-Punkte (SCRUM-216, Funkloch auf dem Platz). Legt jede Änderung zuerst im Gerätespeicher ab und
 * schickt sie dann an die Datenbank; erst die Bestätigung des Servers entfernt sie wieder. Beim Start (bzw. sobald ein
 * Trainer angemeldet ist) wird alles noch Offene erneut geschickt – ohne Doppelzählung, weil jede Änderung unter ihrer
 * eigenen Kennung gespeichert wird. Beim Abmelden wird der Postausgang wie der übrige lokale Speicher geleert – die Seite
 * „Abmelden“ warnt vorher, solange hier noch etwas wartet (SCRUM-220).
 */
@Injectable({ providedIn: 'root' })
export class LiveOutboxService {
  private readonly api = inject(RatingsApi);
  private readonly session = inject(SessionService);
  private readonly team = inject(CurrentTeam);
  private readonly sync = inject(SyncService);
  private readonly ranking = inject(RankingService);

  private readonly entries = signal<readonly PendingLiveChange[]>(loadOutbox(deviceStorage()));
  /** In diesem Tab bestätigte oder verworfene Kennungen (damit ein anderer Tab sie nicht wieder einträgt). */
  private readonly done = new Set<string>();
  /** Gerade unterwegs (pro Sitzung höchstens ein offener Sendeversuch je Änderung). */
  private readonly inflight = new Set<string>();

  /** Noch nicht bestätigte Änderungen des angemeldeten Kontos im aktuellen Team. */
  readonly pending = computed(() => outboxFor(this.entries(), this.session.uid(), this.team.id()));

  constructor() {
    effect(() => {
      const trainer = this.session.role() === 'trainer';
      const uid = this.session.uid();
      const teamId = this.team.id();
      if (!trainer || !uid) return;
      untracked(() => this.flush(uid, teamId));
    });
    // Änderungen aus einem anderen Tab übernehmen.
    const onStorage = (event: StorageEvent) => {
      if (event.key === OUTBOX_STORAGE_KEY || event.key === null) this.entries.set(this.merged(this.entries()));
    };
    // Netz wieder da: Offenes sofort erneut schicken (Firestore selbst überträgt seine Warteschlange ohnehin automatisch).
    const onOnline = () => {
      const uid = this.session.uid();
      if (this.session.role() === 'trainer' && uid) this.flush(uid, this.team.id());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
      window.addEventListener('online', onOnline);
      inject(DestroyRef).onDestroy(() => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('online', onOnline);
      });
    }
  }

  /** Wartende Änderungen eines Spielers in einem Event (für den Hinweis an der Zeile). */
  pendingFor(eventId: string, playerId: string): number {
    return this.pending().filter((entry) => entry.eventId === eventId && entry.playerId === playerId).length;
  }

  /** Kann eine Änderung aufgenommen werden? (Nur mit angemeldetem Konto, denn gesendet wird nur unter diesem.) */
  canRecord(): boolean {
    return this.session.uid() !== null;
  }

  /**
   * Nimmt eine neue Live-Änderung auf und schickt sie los. Gibt die Änderung zurück, oder null, wenn niemand angemeldet ist.
   * Das Versprechen `sent` erfüllt sich, sobald der Server bestätigt hat (bei Funkloch also erst später).
   */
  record(eventId: string, playerId: string, delta: number): { change: PendingLiveChange; sent: Promise<boolean> } | null {
    const uid = this.session.uid();
    if (!uid) return null;
    const change: PendingLiveChange = { id: newChangeId(), uid, teamId: this.team.id(), eventId, playerId, delta, at: Date.now() };
    this.update((entries) => [...entries, change]);
    return { change, sent: this.send(change) };
  }

  /**
   * Alle noch nicht bestätigten Änderungen des angemeldeten Kontos, auch aus seinen anderen Teams (SCRUM-220): das
   * Abmelden leert den ganzen Postausgang, also muss die Warnung davor auch alles zählen. Liest den Gerätespeicher frisch
   * (ein anderer Tab kann gerade etwas aufgenommen haben).
   */
  pendingForAccount(): number {
    const uid = this.session.uid();
    if (!uid) return 0;
    return this.merged(this.entries()).filter((entry) => entry.uid === uid).length;
  }

  /** Leert den Postausgang (Abmelden: keine Teamdaten im Browser). */
  clear(): void {
    for (const entry of this.entries()) this.done.add(entry.id);
    this.entries.set([]);
    saveOutbox(deviceStorage(), []);
  }

  private flush(uid: string, teamId: string): void {
    const open = outboxFor(this.merged(this.entries()), uid, teamId);
    for (const change of open) void this.send(change);
  }

  /** Sendet eine Änderung (idempotent). true = vom Server bestätigt, false = endgültig abgelehnt oder schon unterwegs. */
  private async send(change: PendingLiveChange): Promise<boolean> {
    if (this.inflight.has(change.id)) return false;
    this.inflight.add(change.id);
    try {
      await this.api.addPoints(change.eventId, change.playerId, change.id, change.delta);
      this.forget(change.id);
      this.sync.clearError();
      this.ranking.invalidate();
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (FINAL_ERRORS.some((final) => code.includes(final))) {
        console.error(error);
        this.forget(change.id);
        this.sync.fail(`Punkte konnten nicht gespeichert werden. ${authErrorMessage(code)}`);
      } else {
        // Vorübergehend (z. B. Netz, Server nicht erreichbar): bleibt im Postausgang und geht beim nächsten Start erneut raus.
        console.warn(error);
        this.sync.fail(`Punkte noch nicht gespeichert, neuer Versuch beim nächsten Öffnen. ${authErrorMessage(code)}`);
      }
      return false;
    } finally {
      this.inflight.delete(change.id);
    }
  }

  private forget(id: string): void {
    this.done.add(id);
    this.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  /** Eigener Stand + Stand im Gerätespeicher (anderer Tab), ohne in diesem Tab Erledigtes. */
  private merged(own: readonly PendingLiveChange[]): PendingLiveChange[] {
    const byId = new Map<string, PendingLiveChange>();
    for (const entry of [...loadOutbox(deviceStorage()), ...own]) if (!this.done.has(entry.id)) byId.set(entry.id, entry);
    return [...byId.values()].sort((a, b) => a.at - b.at);
  }

  private update(change: (entries: readonly PendingLiveChange[]) => PendingLiveChange[]): void {
    const next = change(this.merged(this.entries()));
    this.entries.set(next);
    saveOutbox(deviceStorage(), next);
  }
}
