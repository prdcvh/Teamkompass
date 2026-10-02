import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService } from './firebase.service';
import {
  type Player,
  type PlayerDraft,
  type PlayerErrors,
  playerFromDoc,
  playerFromDraft,
  docFromPlayer,
  validateDraft,
} from './player';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

export type SquadLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Kader des Teams: hält die Spieler im Speicher, folgt der Datenbank in Echtzeit und schreibt
 * Änderungen. Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig).
 * Beim Abmelden werden Abo und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class SquadService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly players = signal<readonly Player[]>([]);
  readonly load = signal<SquadLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');

  private unsubscribe: (() => void) | null = null;
  /** Erhöht bei jedem start/stop, damit ein spät eintreffendes Abo eines alten Laufs verworfen wird. */
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet das Echtzeit-Abo (mehrfacher Aufruf ist harmlos). */
  start(): void {
    if (this.unsubscribe || this.load() === 'loading') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.firebase
      .watchPlayers(
        (docs, meta) => {
          if (generation !== this.generation) return;
          this.players.set(docs.map((entry) => playerFromDoc(entry.id, entry.data)));
          this.load.set('ready');
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation !== this.generation) return;
          this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        // Wurde inzwischen gestoppt oder ist das Abo schon fehlgeschlagen, wird es sofort wieder beendet.
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
    this.players.set([]);
    this.load.set('idle');
    this.error.set('');
    this.sync.reset();
  }

  /**
   * Prüft die Eingaben und löst das Speichern aus. Bei Fehlern in den Eingaben kommen sie
   * zurück und es wird nichts geschrieben. Das Ergebnis der Cloud zeigt der Sync-Status; die
   * Änderung ist durch das Abo sofort sichtbar (auch offline), deshalb wird nicht darauf gewartet.
   */
  save(draft: PlayerDraft): PlayerErrors {
    if (!this.canWrite()) return { name: 'Nur Trainer dürfen Spieler ändern.' };
    const errors = validateDraft(draft, this.players());
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `p${crypto.randomUUID()}`;
    const player = playerFromDraft(draft, id);
    this.sync.state.set('syncing');
    void this.firebase.savePlayer(id, docFromPlayer(player)).catch((error) => this.failWrite(error, 'Spieler konnte nicht gespeichert werden.'));
    return {};
  }

  /** Löscht den Spieler (inkl. Bewertungen). Rückgabe: erfolgreich? */
  async remove(id: string): Promise<boolean> {
    if (!this.canWrite()) return false;
    this.sync.state.set('syncing');
    try {
      await this.firebase.deletePlayer(id);
      return true;
    } catch (error) {
      this.failWrite(error, 'Spieler konnte nicht vollständig gelöscht werden.');
      return false;
    }
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.error.set(`Der Kader konnte nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
