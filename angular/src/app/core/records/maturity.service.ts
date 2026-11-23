import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { MaturityApi } from '../firebase/maturity.api';
import { SyncService } from '../shell/sync.service';
import { todayIso } from '../shared/dates';
import { EMPTY_MATURITY_INPUTS, type MaturityInputs, docFromMaturityInputs, maturityInputsFromDoc, withParentsConsentRecord } from './maturity';

/**
 * Angaben für den Reife-Kompass (SCRUM-190) EINES Spielers: Geschlecht für die Berechnung, Einverständnis der Eltern
 * und Größe der Eltern. Nur Trainer und Medizin laden sie (die Regeln sperren alle anderen Rollen); schreiben darf nur
 * der Trainer. Der Reifestand selbst wird nie gespeichert, sondern aus Messwerten und diesen Angaben berechnet – so
 * gelangt er auch nicht in Scout-Sicht, Spielerkarte oder Export.
 */
@Injectable({ providedIn: 'root' })
export class MaturityService {
  private readonly api = inject(MaturityApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly playerId = signal<string | null>(null);
  readonly inputs = signal<MaturityInputs>(EMPTY_MATURITY_INPUTS);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');

  /** Rollen, die den Reifestand sehen: Trainer und Medizin. */
  readonly visible = computed(() => this.session.role() === 'trainer' || this.session.role() === 'physio');
  readonly canWrite = computed(() => this.session.role() === 'trainer');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    // Ohne Anmeldung (oder mit einer anderen Rolle) bleibt nichts im Speicher.
    effect(() => {
      if (!this.visible()) this.stop();
    });
  }

  start(playerId: string): void {
    if (!this.visible()) {
      this.stop();
      return;
    }
    if (this.playerId() === playerId && this.state() !== 'error') return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.state.set('loading');
    this.api
      .watchMaturity(
        playerId,
        (data) => {
          if (generation !== this.generation) return;
          this.inputs.set(maturityInputsFromDoc(data));
          this.state.set('ready');
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation) unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.playerId.set(null);
    this.inputs.set(EMPTY_MATURITY_INPUTS);
    this.state.set('idle');
    this.error.set('');
  }

  retry(): void {
    const playerId = this.playerId();
    this.stop();
    if (playerId) this.start(playerId);
  }

  /**
   * Speichert die Angaben (nur Trainer). Ohne Einverständnis werden die Größen der Eltern gelöscht. Wird das Häkchen
   * neu gesetzt, tragen sich heutiger Tag und das eigene Konto als Nachweis ein (SCRUM-252).
   */
  async save(inputs: MaturityInputs, updatedAt: string): Promise<boolean> {
    const playerId = this.playerId();
    const uid = this.session.uid();
    if (!playerId || !uid || !this.canWrite() || this.state() !== 'ready') return false;
    const record = withParentsConsentRecord(inputs, this.inputs(), { uid, email: this.session.email() ?? '', today: todayIso() });
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.api.saveMaturity(playerId, docFromMaturityInputs(playerId, record, updatedAt));
      this.sync.clearError();
      return true;
    } catch (error) {
      console.error(error);
      this.sync.fail(`Angaben zum Reife-Kompass konnten nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    }
  }

  /**
   * Löscht alle Angaben zum Reife-Kompass dieses Spielers (Geschlecht, Häkchen, Größe der Eltern) – nur Trainer, nur
   * nach Rückfrage (Aufgabe „Gesundheitsdaten prüfen und löschen“, SCRUM-252). Ohne die Angaben gibt es keinen
   * Reifestand mehr, auch nicht im Bio-Banding; gespeicherte Reifewerte gibt es nicht.
   */
  async remove(playerId: string): Promise<boolean> {
    if (!this.canWrite()) return false;
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    try {
      await this.api.deleteMaturity(playerId);
      if (this.playerId() === playerId) this.inputs.set(EMPTY_MATURITY_INPUTS);
      this.sync.clearError();
      return true;
    } catch (error) {
      console.error(error);
      this.sync.fail(`Angaben zum Reife-Kompass konnten nicht gelöscht werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    // Nichts Altes im Speicher behalten (z. B. Medizin nach einem Widerruf: die Regeln sperren das Abo dann).
    this.inputs.set(EMPTY_MATURITY_INPUTS);
    this.state.set('error');
    this.error.set(`Der Reife-Kompass konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
