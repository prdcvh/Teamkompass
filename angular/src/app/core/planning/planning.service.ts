import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { docFromEvent } from '../events/event';
import { EventsService } from '../events/events.service';
import { EventsApi } from '../firebase/events.api';
import { PlanningApi } from '../firebase/planning.api';
import { todayIso } from '../shared/dates';
import { SyncService } from '../shell/sync.service';
import { type SeriesDraft, type SeriesErrors, type TrainingSeries, docFromSeries, seriesFromDraft, seriesFromPlanningDoc, validateSeriesDraft } from './planning';
import { SERIES_EVENT_BATCH_SIZE, eventFromSeries, planSeries, planText, skippedFromPlanningDoc } from './series-events';

export type PlanningLoad = 'idle' | 'loading' | 'ready' | 'error';

/** Stand des Anlegens der Serien-Trainings (für die Meldung auf der Planungsseite). */
export interface SeriesRun {
  readonly state: 'idle' | 'running' | 'done' | 'error';
  readonly text: string;
}
const IDLE_RUN: SeriesRun = { state: 'idle', text: '' };

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
  private readonly events = inject(EventsService);
  private readonly eventsApi = inject(EventsApi);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<PlanningLoad>('idle');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly series = computed<readonly TrainingSeries[]>(() => seriesFromPlanningDoc(this.stored()));
  /** Meldung zum letzten Anlegen der Serien-Trainings. */
  readonly run = signal<SeriesRun>(IDLE_RUN);

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
    this.run.set(IDLE_RUN);
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
    const written = this.write(this.api.saveSeries(series.id, docFromSeries(series)), 'Die Serie konnte nicht gespeichert werden.');
    void this.createEvents(series, written);
    return {};
  }

  /** Vorschau für das Formular: was beim Speichern passieren würde. Null, solange Eingaben ungültig sind oder die Events fehlen. */
  preview(draft: SeriesDraft): { readonly text: string; readonly count: number } | null {
    if (this.events.load() !== 'ready' || Object.keys(validateSeriesDraft(draft)).length > 0) return null;
    const plan = planSeries(seriesFromDraft(draft, draft.id ?? 'neu'), todayIso(), new Set(this.events.events().map((event) => event.id)), skippedFromPlanningDoc(this.stored()));
    return { text: planText(plan), count: plan.create.length };
  }

  /**
   * Legt die fehlenden Trainings der Serie an, in Blöcken. Was es schon gibt oder von Hand gelöscht wurde, wird nicht
   * angefasst; bricht ein Block ab, bleiben die früheren bestehen und erneutes Speichern ergänzt nur den Rest.
   */
  private async createEvents(series: TrainingSeries, written: Promise<boolean>): Promise<void> {
    this.run.set({ state: 'running', text: 'Trainings werden angelegt …' });
    if (!(await written)) {
      this.run.set({ state: 'error', text: 'Die Serie wurde nicht gespeichert, deshalb wurden keine Trainings angelegt.' });
      return;
    }
    const existing = await this.events.whenLoaded();
    if (this.events.load() !== 'ready') {
      this.run.set({ state: 'error', text: 'Die Serie ist gespeichert, aber die vorhandenen Events konnten nicht geladen werden. Es wurden keine Trainings angelegt. Bitte später erneut speichern.' });
      return;
    }
    const plan = planSeries(series, todayIso(), new Set(existing.map((event) => event.id)), skippedFromPlanningDoc(this.stored()));
    const entries = plan.create.map((date) => {
      const event = eventFromSeries(series, date);
      return { id: event.id, data: docFromEvent(event) };
    });
    let created = 0;
    try {
      for (let offset = 0; offset < entries.length; offset += SERIES_EVENT_BATCH_SIZE) {
        await this.eventsApi.saveEventsBatch(entries.slice(offset, offset + SERIES_EVENT_BATCH_SIZE));
        created = Math.min(offset + SERIES_EVENT_BATCH_SIZE, entries.length);
      }
    } catch (error) {
      console.error(error);
      const reason = authErrorMessage(errorCode(error));
      this.run.set({
        state: 'error',
        text: `Es wurden nur ${created} von ${entries.length} Trainings angelegt. Bitte die Serie erneut speichern, dann werden nur die fehlenden ergänzt. ${reason}`,
      });
      this.sync.fail(`Nicht alle Trainings der Serie konnten angelegt werden. ${reason}`);
      return;
    }
    this.run.set({
      state: 'done',
      text: entries.length === 0 ? 'Es gab keine neuen Trainings anzulegen.' : entries.length === 1 ? '1 Training wurde angelegt.' : `${entries.length} Trainings wurden angelegt.`,
    });
  }

  /** Löscht die Serie. Rückgabe: false, wenn nicht erlaubt. (Bereits angelegte Trainings bleiben bestehen.) */
  deleteSeries(id: string): boolean {
    if (!this.canWrite() || this.load() !== 'ready') return false;
    this.write(this.api.deleteSeries(id), 'Die Serie konnte nicht gelöscht werden.');
    return true;
  }

  /** Löst das Schreiben aus; das Ergebnis sagt, ob es geklappt hat (Fehler sind bereits gemeldet). */
  private write(pending: Promise<void>, failure: string): Promise<boolean> {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    return pending
      .then(() => {
        this.sync.clearError();
        return true;
      })
      .catch((error) => {
        console.error(error);
        this.sync.fail(`${failure} ${authErrorMessage(errorCode(error))}`);
        return false;
      });
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
