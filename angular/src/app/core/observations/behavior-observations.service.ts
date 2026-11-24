import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { todayIso } from '../shared/dates';
import {
  type BehaviorObservation,
  type EvidenceEvent,
  MAX_BY,
  type ObservationDraft,
  type ObservationErrors,
  calibratedHistory,
  docFromObservation,
  observationFromDoc,
  observationFromDraft,
  observationSummaries,
  uncalibrated,
  validateObservationDraft,
} from './behavior-observation';

/**
 * Trainerbeobachtungen mit Verhaltensankern (SCRUM-268) im Profil EINES Spielers. Nur der Trainer lädt und schreibt
 * (die Regeln sperren Spieler, Eltern, Medizin, Scouts und den Vereinsadmin). Einträge werden nie geändert, nur
 * angelegt oder gelöscht. Es gibt bewusst keine Sicht über mehrere Spieler (keine Rangliste).
 */
@Injectable({ providedIn: 'root' })
export class BehaviorObservationsService {
  private readonly api = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);

  readonly visible = computed(() => this.session.role() === 'trainer');
  /** Name, der als bewertender Trainer eingetragen wird. */
  readonly author = computed(() => (this.session.displayName().trim() || this.session.email() || 'Trainer').slice(0, MAX_BY));
  readonly uid = computed(() => this.session.uid());

  readonly playerId = signal<string | null>(null);
  readonly observations = signal<readonly BehaviorObservation[]>([]);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');
  readonly today = signal(todayIso());

  readonly summaries = computed(() => observationSummaries(this.observations(), this.today()));
  readonly history = computed(() => calibratedHistory(this.observations()));
  readonly legacy = computed(() => uncalibrated(this.observations()));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (!this.visible()) this.stop();
    });
  }

  start(playerId: string): void {
    if (!this.visible()) {
      this.stop();
      return;
    }
    this.today.set(todayIso());
    if (this.playerId() === playerId && this.state() !== 'error') return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.state.set('loading');
    this.api
      .watchPlayerRecords(
        playerId,
        'behaviorObservations',
        (docs) => {
          if (generation !== this.generation) return;
          this.observations.set(docs.map((entry) => observationFromDoc(entry.id, entry.data)).filter((entry): entry is BehaviorObservation => entry !== null));
          this.state.set('ready');
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation === this.generation) this.unsubscribe = unsubscribe;
        else unsubscribe();
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
    this.observations.set([]);
    this.state.set('idle');
    this.error.set('');
  }

  /** Beobachtung speichern; Datum, Name und Konto trägt die App ein. Fehler je Feld, leer = gespeichert. */
  async save(draft: ObservationDraft, events: readonly EvidenceEvent[]): Promise<ObservationErrors> {
    const playerId = this.playerId();
    const uid = this.session.uid();
    if (!this.visible() || !playerId || !uid || this.state() !== 'ready') return { value: 'Nur Trainer dürfen Beobachtungen eintragen.' };
    const today = todayIso();
    const errors = validateObservationDraft(draft, today, events);
    if (Object.keys(errors).length > 0) return errors;
    const observation = observationFromDraft(draft, { id: `bo${crypto.randomUUID()}`, date: today, by: this.author(), byUid: uid, createdAt: new Date().toISOString() });
    try {
      await this.api.savePlayerRecord(playerId, 'behaviorObservations', observation.id, docFromObservation(observation));
      this.observations.update((list) => [...list.filter((entry) => entry.id !== observation.id), observation]);
      return {};
    } catch (error) {
      console.error(error);
      return { value: `Die Beobachtung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}` };
    }
  }

  async remove(id: string): Promise<boolean> {
    const playerId = this.playerId();
    if (!this.visible() || !playerId) return false;
    try {
      await this.api.deletePlayerRecord(playerId, 'behaviorObservations', id);
      this.observations.update((list) => list.filter((entry) => entry.id !== id));
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state.set('error');
    this.error.set(`Die Beobachtungen konnten nicht geladen oder gelöscht werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
