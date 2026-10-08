import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService } from './firebase.service';
import {
  type Opponent,
  type OpponentDraft,
  type OpponentErrors,
  docFromOpponent,
  opponentFromDoc,
  opponentFromDraft,
  validateDraft,
} from './opponent';
import { SessionService } from './session.service';
import { SyncService } from './sync.service';

export type OpponentsLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Gegnerprofile des Teams: hält sie im Speicher, folgt der Datenbank in Echtzeit und schreibt Änderungen.
 * Lesen und Schreiben darf nur der Trainer (die Regeln erzwingen es zusätzlich serverseitig). Beim Abmelden werden
 * Abo und Daten sofort verworfen. Den Sync-Status teilt sich der Dienst mit Kader und Events.
 */
@Injectable({ providedIn: 'root' })
export class OpponentsService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly opponents = signal<readonly Opponent[]>([]);
  readonly load = signal<OpponentsLoad>('idle');
  readonly error = signal('');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly canEdit = computed(() => this.canWrite() && this.load() === 'ready');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet das Echtzeit-Abo (mehrfacher Aufruf ist harmlos); nur für Trainer. */
  start(): void {
    if (this.unsubscribe || this.load() === 'loading' || !this.canWrite()) return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.firebase
      .watchOpponents(
        (docs, meta) => {
          if (generation !== this.generation) return;
          this.opponents.set(docs.map((entry) => opponentFromDoc(entry.id, entry.data)));
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
    this.opponents.set([]);
    this.load.set('idle');
    this.error.set('');
  }

  /** Prüft die Eingaben und löst das Speichern aus; bei Fehlern kommen sie zurück und es wird nichts geschrieben. */
  save(draft: OpponentDraft): OpponentErrors {
    if (!this.canWrite()) return { name: 'Nur Trainer dürfen Gegner ändern.' };
    if (this.load() !== 'ready') return { name: 'Die Gegner sind noch nicht geladen. Bitte kurz warten und erneut versuchen.' };
    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `o${crypto.randomUUID()}`;
    const opponent = opponentFromDraft(draft, id);
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.firebase
      .saveOpponent(id, docFromOpponent(opponent))
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, `„${opponent.name}“ konnte nicht gespeichert werden.`));
    return {};
  }

  /** Löscht das Gegnerprofil. Rückgabe: erfolgreich? */
  async remove(id: string): Promise<boolean> {
    if (!this.canEdit()) return false;
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.firebase.deleteOpponent(id);
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, 'Gegner konnte nicht gelöscht werden.');
      return false;
    }
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null; // erlaubt „Erneut versuchen“
    this.load.set('error');
    this.error.set(`Die Gegner konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
