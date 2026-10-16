import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { PlanningApi } from '../firebase/planning.api';
import { SyncService } from '../shell/sync.service';
import { type SeriesDraft, type SeriesErrors, type TrainingSeries, docFromSeries, seriesFromDraft, seriesFromPlanningDoc, validateSeriesDraft } from './planning';

export type PlanningLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Planung des Teams (`meta/planning`): Trainingsserien lesen, anlegen, ändern und löschen. Nur der Trainer darf lesen
 * und schreiben (die Firestore-Regeln erzwingen es zusätzlich). Wie bei den Teameinstellungen wird lokal sofort
 * übernommen; schlägt das Speichern fehl, steht eine verständliche Meldung im Synchronisierungsstatus und der
 * nächste Snapshot stellt den Stand der Cloud wieder her. Beim Abmelden werden Abo und Daten verworfen.
 */
@Injectable({ providedIn: 'root' })
export class PlanningService {
  private readonly api = inject(PlanningApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<PlanningLoad>('idle');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly series = computed<readonly TrainingSeries[]>(() => seriesFromPlanningDoc(this.stored()));

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
      .watchPlanning(
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

  /** Nach einem Ladefehler erneut versuchen. */
  retry(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.load.set('idle');
  }

  /**
   * Prüft und speichert eine Serie (neu oder geändert). Gibt die Fehler der Prüfung zurück; leer = gespeichert.
   * Nur im Zustand „geladen“, sonst würde eine Serie ein noch nicht gelesenes Dokument überschreiben.
   */
  saveSeries(draft: SeriesDraft): SeriesErrors {
    if (!this.canWrite() || this.load() !== 'ready') return { startDate: 'Die Planung ist noch nicht geladen. Bitte kurz warten und erneut speichern.' };
    const errors = validateSeriesDraft(draft);
    if (Object.keys(errors).length > 0) return errors;
    const series = seriesFromDraft(draft, draft.id ?? `s${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
    this.write(this.api.saveSeries(series.id, docFromSeries(series)), 'Die Serie konnte nicht gespeichert werden.');
    return {};
  }

  /** Löscht die Serie. Rückgabe: false, wenn nicht erlaubt. (Bereits angelegte Events entstehen erst mit SCRUM-146.) */
  deleteSeries(id: string): boolean {
    if (!this.canWrite() || this.load() !== 'ready') return false;
    this.write(this.api.deleteSeries(id), 'Die Serie konnte nicht gelöscht werden.');
    return true;
  }

  private write(pending: Promise<void>, failure: string): void {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void pending
      .then(() => this.sync.clearError())
      .catch((error) => {
        console.error(error);
        this.sync.fail(`${failure} ${authErrorMessage(errorCode(error))}`);
      });
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
