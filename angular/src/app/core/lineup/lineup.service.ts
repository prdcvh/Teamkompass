import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { LineupApi } from '../firebase/lineup.api';
import { type Assignments, type EventLineups, docFromEventLineup, docFromLineup, emptyAssignments, normalizeEventLineups, normalizeLineup } from './lineup';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { SyncService } from '../shell/sync.service';

export type LineupLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Startelf des Teams (`meta/lineup`): folgt der Datenbank in Echtzeit und schreibt jede Änderung als ganzes Dokument.
 * Lesen und Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig). Spieler, die nicht mehr
 * im Kader stehen, werden beim Anzeigen ausgeblendet. Beim Abmelden werden Abo und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class LineupService {
  private readonly lineupApi = inject(LineupApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly squad = inject(SquadService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<LineupLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly canEdit = computed(() => this.canWrite() && this.load() === 'ready' && this.squad.load() === 'ready');

  /** Gespeicherte Aufstellung ohne Spieler, die nicht (mehr) im Kader stehen; leer, solange nichts gespeichert ist. */
  readonly assignments = computed<Assignments>(() => {
    const doc = this.stored();
    if (!doc) return emptyAssignments();
    return normalizeLineup(doc, new Set(this.squad.players().map((player) => player.id)));
  });

  /** Je Spiel gespeicherte Aufstellungen (`byEvent`), ohne Spieler, die nicht (mehr) im Kader stehen. */
  readonly eventLineups = computed<EventLineups>(() => {
    const doc = this.stored();
    if (!doc) return {};
    return normalizeEventLineups(doc['byEvent'], new Set(this.squad.players().map((player) => player.id)));
  });

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    if (this.unsubscribe || this.load() === 'loading' || !this.canWrite()) return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.lineupApi
      .watchLineup(
        (data, meta) => {
          if (generation !== this.generation) return;
          this.stored.set(data);
          this.load.set('ready');
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.load.set('idle');
    this.error.set('');
  }

  /** Speichert die Aufstellung. Rückgabe: false, wenn nicht erlaubt oder noch nicht geladen (dann wird nichts geschrieben). */
  save(assignments: Assignments): boolean {
    if (!this.canEdit()) return false;
    const doc = docFromLineup(assignments);
    this.stored.set({ ...this.stored(), ...doc }); // sofort sichtbar, auch offline; das Abo bestätigt es
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.lineupApi
      .saveLineup(doc)
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error));
    return true;
  }

  /**
   * Speichert die Aufstellung für ein Spiel am Eintrag `byEvent.<eventId>` (Format der Live-App); die allgemeine Startelf
   * und die anderen Spiele bleiben unberührt. Rückgabe: false, wenn nicht erlaubt oder noch nicht geladen.
   */
  saveForEvent(eventId: string, assignments: Assignments, now: Date = new Date()): boolean {
    if (!this.canEdit() || !eventId) return false;
    const entry = docFromEventLineup(assignments, now.toISOString());
    const current = this.stored();
    const byEvent = { ...((current?.['byEvent'] as Record<string, unknown> | undefined) ?? {}), [eventId]: entry };
    this.stored.set({ ...current, byEvent }); // sofort sichtbar, auch offline; das Abo bestätigt es
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.lineupApi
      .saveEventLineup(eventId, entry)
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error));
    return true;
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.error.set(`Die Aufstellung konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    this.sync.fail('Laden fehlgeschlagen', 'load');
  }

  private failWrite(error: unknown): void {
    console.error(error);
    this.sync.fail(`Die Aufstellung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
