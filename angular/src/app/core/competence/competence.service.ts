import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { CompetenceApi } from '../firebase/competence.api';
import { todayIso } from '../shared/dates';
import {
  type CompetenceConfig,
  type CompetenceObservation,
  type ConfigDraft,
  MAX_OBSERVATION_BY,
  type ObservationDraft,
  type ObservationErrors,
  competenceIndex,
  competenceProfile,
  configDocId,
  configFromDoc,
  currentConfig,
  docFromConfig,
  docFromObservation,
  nextConfig,
  observationFromDoc,
  observationsFromDraft,
  sortedConfigs,
  validateConfigDraft,
  validateObservationDraft,
} from './competence';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Entwicklungsraster (SCRUM-266) im Profil EINES Spielers und die Team-Konfiguration. Nur der Trainer lädt und schreibt
 * (die Regeln sperren alle anderen Rollen). Es gibt bewusst keine Sicht über mehrere Spieler (keine Rangliste).
 */
@Injectable({ providedIn: 'root' })
export class CompetenceService {
  private readonly api = inject(CompetenceApi);
  private readonly session = inject(SessionService);

  readonly visible = computed(() => this.session.role() === 'trainer');
  readonly author = computed(() => (this.session.displayName().trim() || this.session.email() || 'Trainer').slice(0, MAX_OBSERVATION_BY));

  // --- Team-Konfiguration -----------------------------------------------------------------------------------
  readonly configs = signal<readonly CompetenceConfig[]>([]);
  readonly configState = signal<LoadState>('idle');
  readonly configError = signal('');
  readonly config = computed(() => currentConfig(this.configs()));
  readonly history = computed(() => sortedConfigs(this.configs()));
  private configUnsubscribe: (() => void) | null = null;
  private configGeneration = 0;

  // --- Beobachtungen eines Spielers ---------------------------------------------------------------------------
  readonly playerId = signal<string | null>(null);
  readonly observations = signal<readonly CompetenceObservation[]>([]);
  readonly state = signal<LoadState>('idle');
  readonly error = signal('');
  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  readonly today = signal(todayIso());
  readonly profile = computed(() => competenceProfile(this.observations(), this.config(), this.today()));
  readonly index = computed(() => competenceIndex(this.profile(), this.config()));
  /** Beobachtungen neueste zuerst (für die Liste mit „Löschen“). */
  readonly recent = computed(() => [...this.observations()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));

  constructor() {
    effect(() => {
      if (!this.visible()) {
        this.stop();
        this.stopConfigs();
      }
    });
  }

  startConfigs(): void {
    if (!this.visible()) return;
    if (this.configState() === 'loading' || this.configState() === 'ready') return;
    this.stopConfigs();
    const generation = ++this.configGeneration;
    this.configState.set('loading');
    this.api
      .watchConfigs(
        (docs) => {
          if (generation !== this.configGeneration) return;
          this.configs.set(docs.map((entry) => configFromDoc(entry.data)).filter((entry): entry is CompetenceConfig => entry !== null));
          this.configState.set('ready');
        },
        (error) => {
          if (generation === this.configGeneration) this.failConfigs(error);
        },
      )
      .then((unsubscribe) => {
        if (generation === this.configGeneration) this.configUnsubscribe = unsubscribe;
        else unsubscribe();
      })
      .catch((error) => {
        if (generation === this.configGeneration) this.failConfigs(error);
      });
  }

  stopConfigs(): void {
    this.configGeneration += 1;
    this.configUnsubscribe?.();
    this.configUnsubscribe = null;
    this.configs.set([]);
    this.configState.set('idle');
    this.configError.set('');
  }

  start(playerId: string): void {
    if (!this.visible()) {
      this.stop();
      return;
    }
    this.startConfigs();
    this.today.set(todayIso());
    if (this.playerId() === playerId && this.state() !== 'error') return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.state.set('loading');
    this.api
      .watchObservations(
        playerId,
        (docs) => {
          if (generation !== this.generation) return;
          this.observations.set(docs.map((entry) => observationFromDoc(entry.id, entry.data)).filter((entry): entry is CompetenceObservation => entry !== null));
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

  /** Beobachtungen speichern (eine je eingestuftem Kriterium). Fehler je Feld, leer = gespeichert. */
  async addObservations(draft: ObservationDraft): Promise<ObservationErrors> {
    const playerId = this.playerId();
    const uid = this.session.uid();
    if (!this.visible() || !playerId || !uid || this.state() !== 'ready') return { values: 'Nur Trainer dürfen Beobachtungen eintragen.' };
    const errors = validateObservationDraft(draft, todayIso());
    if (Object.keys(errors).length > 0) return errors;
    const entries = observationsFromDraft(draft, { playerId, by: this.author(), byUid: uid, createdAt: new Date().toISOString(), newId: () => `co${crypto.randomUUID()}` });
    try {
      await this.api.addObservations(
        playerId,
        entries.map((entry) => ({ id: entry.id, data: docFromObservation(entry) })),
      );
      return {};
    } catch (error) {
      console.error(error);
      return { values: `Die Beobachtung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}` };
    }
  }

  async deleteObservation(id: string): Promise<boolean> {
    const playerId = this.playerId();
    if (!this.visible() || !playerId) return false;
    try {
      await this.api.deleteObservation(playerId, id);
      this.observations.update((list) => list.filter((entry) => entry.id !== id));
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  /** Neue Konfigurationsversion speichern. Fehlertexte, leer = gespeichert. */
  async saveConfig(draft: ConfigDraft): Promise<string[]> {
    const uid = this.session.uid();
    if (!this.visible() || !uid || this.configState() !== 'ready') return ['Nur Trainer dürfen das Raster einstellen.'];
    const errors = validateConfigDraft(draft);
    if (errors.length > 0) return errors;
    const config = nextConfig(this.configs(), draft, { by: this.author(), byUid: uid, createdAt: new Date().toISOString() });
    try {
      await this.api.addConfig(configDocId(config.version), docFromConfig(config));
      return [];
    } catch (error) {
      console.error(error);
      return [`Die Einstellung konnte nicht gespeichert werden (vielleicht hat gerade jemand anderes gespeichert – bitte neu laden). ${authErrorMessage(errorCode(error), this.session.role())}`];
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state.set('error');
    this.error.set(`Die Beobachtungen konnten nicht geladen oder gelöscht werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }

  private failConfigs(error: unknown): void {
    console.error(error);
    this.configState.set('error');
    this.configError.set(`Die Einstellungen des Entwicklungsrasters konnten nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
