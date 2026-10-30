import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { TeamSettingsApi } from '../firebase/team-settings.api';
import { SessionService } from '../auth/session.service';
import { SyncService } from '../shell/sync.service';
import { type FederalState, isFederalState } from './federal-states';
import { type DefaultLocation, defaultLocationFromDoc, docFromDefaultLocation, docFromFederalState, federalStateFromDoc } from './team-settings';

/**
 * Teameinstellungen (`meta/settings`): der Standardort (Heimplatz), der neue Events vorbelegt, und das Bundesland
 * für den Schulferien-Hinweis der Planung (SCRUM-186).
 * Lesen und Schreiben darf nur der Trainer. Ist das Laden nicht möglich, entsteht kein Standardort –
 * Events lassen sich trotzdem anlegen. Beim Abmelden werden Abo und Daten verworfen.
 */
@Injectable({ providedIn: 'root' })
export class TeamSettingsService {
  private readonly api = inject(TeamSettingsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly defaultLocation = computed<DefaultLocation | null>(() => defaultLocationFromDoc(this.stored()));
  /** Bundesland für den Schulferien-Hinweis; ohne gespeicherten Wert Hessen. */
  readonly federalState = computed<FederalState>(() => federalStateFromDoc(this.stored()));
  /** Letzter Speicherfehler (für die Anzeige in den Einstellungen); leer, solange alles gespeichert wurde. */
  readonly error = signal('');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    if (this.unsubscribe || this.load() === 'loading' || !this.canWrite()) return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.api
      .watchSettings(
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
    this.error.set('');
    this.load.set('idle');
  }

  /** Speichert (oder löscht mit null) den Standardort. Rückgabe: false, wenn nicht erlaubt. */
  saveDefaultLocation(location: DefaultLocation | null): boolean {
    return this.save(docFromDefaultLocation(location), 'Der Standardort konnte nicht gespeichert werden.');
  }

  /** Speichert das Bundesland des Teams (nur Trainer, SCRUM-186). Rückgabe: false, wenn nicht erlaubt oder ungültig. */
  saveFederalState(state: FederalState): boolean {
    if (!isFederalState(state)) return false;
    return this.save(docFromFederalState(state), 'Das Bundesland konnte nicht gespeichert werden.');
  }

  private save(doc: Record<string, unknown>, failText: string): boolean {
    if (!this.canWrite()) return false;
    this.stored.set({ ...this.stored(), ...doc });
    this.error.set('');
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.api
      .saveSettings(doc)
      .then(() => this.sync.clearError())
      .catch((error) => {
        console.error(error);
        const message = `${failText} ${authErrorMessage(errorCode(error), this.session.role())}`;
        this.error.set(message);
        this.sync.fail(message);
      });
    return true;
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
