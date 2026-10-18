import { Injectable, type Signal, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { docFromEvent, eventFromDoc } from '../events/event';
import { EventsService } from '../events/events.service';
import { EventsApi } from '../firebase/events.api';
import { PlanningApi } from '../firebase/planning.api';
import type { Player } from '../player/player';
import { SquadService } from '../player/squad.service';
import { AbsenceSyncService } from '../records/absence-sync.service';
import { todayIso } from '../shared/dates';
import { SyncService } from '../shell/sync.service';
import { type PlanningBreak } from './breaks';
import { BreaksStore } from './breaks-store';
import { type SeriesDraft, type SeriesErrors, type TrainingSeries, docFromSeries, seriesFromDraft, seriesFromPlanningDoc, validateSeriesDraft } from './planning';
import { SERIES_EVENT_BATCH_SIZE, type SeriesChangePlan, changeCandidates, changeText, eventFromSeries, planSeriesChange, planText, skippedFromPlanningDoc } from './series-events';

export type PlanningLoad = 'idle' | 'loading' | 'ready' | 'error';

/** Stand des Anlegens der Serien-Trainings (für die Meldung auf der Planungsseite). */
export interface SeriesRun {
  readonly state: 'idle' | 'running' | 'done' | 'error';
  readonly text: string;
}
const IDLE_RUN: SeriesRun = { state: 'idle', text: '' };

/** Welche künftigen Termine einer Serie schon Bewertungen/Notizen haben (vor dem Ändern oder Löschen nachgesehen). */
export interface SeriesProtection {
  readonly seriesId: string;
  readonly state: 'loading' | 'ready' | 'error';
  readonly rated: ReadonlySet<string>;
}

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
  private readonly breaksStore = inject(BreaksStore);
  private readonly squad = inject(SquadService);
  private readonly absenceSync = inject(AbsenceSyncService);

  /** Stand des Planungsdokuments (für {@link BreaksService}). */
  readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  /** Stand des Lesens von `meta/planning` (die Serien). */
  private readonly planningLoad = signal<PlanningLoad>('idle');
  /** „Bereit“ erst, wenn Serien und Pausen (`meta/breaks`) gelesen sind: sonst entstünden Serien-Trainings in Pausen. */
  readonly load = computed<PlanningLoad>(() => {
    const own = this.planningLoad();
    const breaks = this.breaksStore.load();
    if (own === 'idle') return 'idle';
    if (own === 'error' || breaks === 'error') return 'error';
    return own === 'ready' && breaks === 'ready' ? 'ready' : 'loading';
  });
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly series = computed<readonly TrainingSeries[]>(() => seriesFromPlanningDoc(this.stored()));
  /** Pausen (SCRUM-148): an ihren Tagen entstehen keine Serien-Trainings. */
  readonly breaks: Signal<readonly PlanningBreak[]> = this.breaksStore.breaks;
  /** Meldung zum letzten Anlegen der Serien-Trainings. */
  readonly run = signal<SeriesRun>(IDLE_RUN);
  /** Stand der Prüfung auf bewertete Termine für die Vorschau im Formular (beim Speichern wird neu geprüft). */
  readonly protection = signal<SeriesProtection | null>(null);

  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private protectionRun = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    if (this.unsubscribe || this.planningLoad() === 'loading' || !this.canWrite()) return;
    const generation = ++this.generation;
    this.planningLoad.set('loading');
    this.breaksStore.start();
    this.api
      .watchPlanning(
        (data, meta) => {
          if (generation !== this.generation) return;
          this.stored.set(data);
          this.planningLoad.set('ready');
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.planningLoad() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  /** Nach einem Ladefehler erneut versuchen. */
  retry(): void {
    this.stop();
    this.breaksStore.retry();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.planningLoad.set('idle');
    this.run.set(IDLE_RUN);
    this.protection.set(null);
    this.protectionRun += 1;
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
    void this.applySeries(series, written);
    return {};
  }

  /**
   * Schaut nach, welche künftigen Termine der Serie schon Bewertungen oder Notizen haben (für die Vorschau beim
   * Ändern und Löschen). Das Ergebnis steht in {@link protection}; beim Speichern wird ohnehin neu geprüft.
   */
  async loadProtection(seriesId: string): Promise<void> {
    const run = ++this.protectionRun;
    this.protection.set({ seriesId, state: 'loading', rated: new Set() });
    const events = await this.events.whenLoaded();
    if (run !== this.protectionRun) return;
    if (this.events.load() !== 'ready') {
      this.protection.set({ seriesId, state: 'error', rated: new Set() });
      return;
    }
    try {
      const rated = await this.eventsApi.findEventsWithRecords(changeCandidates(seriesId, todayIso(), events));
      if (run === this.protectionRun) this.protection.set({ seriesId, state: 'ready', rated });
    } catch (error) {
      console.error(error);
      if (run === this.protectionRun) this.protection.set({ seriesId, state: 'error', rated: new Set() });
    }
  }

  /** Vorschau für das Formular: was beim Speichern passieren würde. Null, solange Eingaben ungültig sind oder die Events fehlen. */
  preview(draft: SeriesDraft): { readonly text: string; readonly count: number } | null {
    if (this.events.load() !== 'ready' || Object.keys(validateSeriesDraft(draft)).length > 0) return null;
    const series = seriesFromDraft(draft, draft.id ?? 'neu');
    const events = this.events.events();
    const skipped = skippedFromPlanningDoc(this.stored());
    const hasEvents = draft.id !== null && changeCandidates(draft.id, todayIso(), events).length > 0;
    if (!hasEvents) {
      const plan = planSeriesChange(series.id, series, todayIso(), events, new Set(), skipped, this.breaks());
      return { text: plan.update.length + plan.remove.length + plan.keptEdited + plan.keptRated + plan.unchanged === 0 ? planText(plan) : changeText(plan), count: plan.create.length };
    }
    const protection = this.protection();
    if (protection === null || protection.seriesId !== draft.id || protection.state === 'loading') return { text: 'Es wird geprüft, welche Termine schon bewertet sind …', count: 0 };
    if (protection.state === 'error') return { text: 'Es konnte nicht geprüft werden, welche Termine schon bewertet sind. Beim Speichern wird es erneut versucht; klappt auch das nicht, bleiben die Termine unverändert.', count: 0 };
    const plan = planSeriesChange(series.id, series, todayIso(), events, protection.rated, skipped, this.breaks());
    return { text: changeText(plan), count: plan.create.length };
  }

  /** Vorschau für die Rückfrage beim Löschen: was mit den künftigen Terminen passiert. Null, solange nicht geprüft. */
  deletePreview(seriesId: string): string | null {
    const protection = this.protection();
    if (this.events.load() !== 'ready' || protection === null || protection.seriesId !== seriesId || protection.state === 'loading') return null;
    if (protection.state === 'error') return 'Es konnte nicht geprüft werden, welche Termine schon bewertet sind. Beim Löschen wird es erneut versucht; klappt auch das nicht, bleibt die Serie bestehen.';
    const plan = planSeriesChange(seriesId, null, todayIso(), this.events.events(), protection.rated, skippedFromPlanningDoc(this.stored()));
    return changeText({ ...plan, past: 0 }).replace('Es werden keine neuen Trainings angelegt.', 'Es gibt keine künftigen Termine, die entfernt werden.');
  }

  /**
   * Bringt die Termine der Serie in Ordnung, in Blöcken: fehlende anlegen, geänderte anpassen, überzählige entfernen.
   * Vergangene, bewertete und von Hand bearbeitete Termine bleiben unberührt. Bricht ein Block ab, bleiben die früheren
   * bestehen; erneutes Speichern leitet alles neu aus dem Stand der Termine ab und erledigt nur den Rest.
   */
  private async applySeries(series: TrainingSeries, written: Promise<boolean>): Promise<void> {
    this.run.set({ state: 'running', text: 'Termine werden aktualisiert …' });
    if (!(await written)) {
      this.run.set({ state: 'error', text: 'Die Serie wurde nicht gespeichert, deshalb wurden keine Termine geändert.' });
      return;
    }
    const plan = await this.preparePlan(series.id, series, 'Die Serie ist gespeichert, aber ', 'Bitte später erneut speichern.');
    if (!plan) return;
    const failure = await this.execute(series, plan, 'Bitte die Serie erneut speichern, dann wird der Rest ergänzt.');
    this.run.set(failure ? { state: 'error', text: failure } : { state: 'done', text: this.summary(plan) });
  }

  /** Liest Events und Bewertungsstand frisch und plant. Bei Fehler: Meldung, Rückgabe null, nichts geändert. */
  private async preparePlan(seriesId: string, series: TrainingSeries | null, prefix: string, suffix: string): Promise<SeriesChangePlan | null> {
    const events = await this.events.whenLoaded();
    if (this.events.load() !== 'ready') {
      this.run.set({ state: 'error', text: `${prefix}die vorhandenen Events konnten nicht geladen werden. Es wurden keine Termine geändert. ${suffix}` });
      return null;
    }
    let rated: ReadonlySet<string>;
    try {
      rated = await this.eventsApi.findEventsWithRecords(changeCandidates(seriesId, todayIso(), events));
    } catch (error) {
      console.error(error);
      this.run.set({ state: 'error', text: `${prefix}es konnte nicht geprüft werden, welche Termine schon bewertet sind. Deshalb wurde nichts geändert. ${authErrorMessage(errorCode(error))} ${suffix}` });
      return null;
    }
    return planSeriesChange(seriesId, series, todayIso(), events, rated, skippedFromPlanningDoc(this.stored()), this.breaks());
  }

  /**
   * Schreibt den Plan in Blöcken (erst Anlegen und Anpassen, zuletzt Entfernen). Rückgabe: null = alles geschafft,
   * sonst die Fehlermeldung (die Blöcke davor bleiben bestehen).
   */
  private async execute(series: TrainingSeries | null, plan: SeriesChangePlan, retryHint: string): Promise<string | null> {
    const creates = series ? plan.create.map((date) => eventFromSeries(series, date)).map((event) => ({ id: event.id, data: docFromEvent(event) })) : [];
    return this.writeChunks(creates, plan.update.map((entry) => ({ id: entry.id, data: entry.changes })), plan.remove, retryHint);
  }

  /** Schreibt Anlegen, Anpassen und Entfernen in Blöcken. Rückgabe: null = geschafft, sonst die Fehlermeldung. */
  async writeChunks(
    creates: readonly { readonly id: string; readonly data: Readonly<Record<string, unknown>> }[],
    updates: readonly { readonly id: string; readonly data: Readonly<Record<string, unknown>> }[],
    removes: readonly string[],
    retryHint: string,
  ): Promise<string | null> {
    const chunks = <T>(items: readonly T[]) => Array.from({ length: Math.ceil(items.length / SERIES_EVENT_BATCH_SIZE) }, (_, index) => items.slice(index * SERIES_EVENT_BATCH_SIZE, (index + 1) * SERIES_EVENT_BATCH_SIZE));
    const save = (items: typeof creates) => chunks(items).map((chunk) => ({ size: chunk.length, run: () => this.eventsApi.saveEventsBatch(chunk) }));
    const steps = [...save(creates), ...save(updates), ...chunks(removes).map((chunk) => ({ size: chunk.length, run: () => this.eventsApi.deleteEventsBatch(chunk) }))];
    const total = steps.reduce((sum, step) => sum + step.size, 0);
    // Den Kader schon vorher holen (für das Vorbelegen danach): sein Start setzt den Sync-Status zurück und darf
    // eine Fehlermeldung des Anlegens nicht überdecken.
    const players = creates.length > 0 ? this.squad.whenLoaded() : Promise.resolve([]);
    let done = 0;
    let failure: string | null = null;
    try {
      for (const step of steps) {
        await step.run();
        done += step.size;
      }
    } catch (error) {
      console.error(error);
      const reason = authErrorMessage(errorCode(error));
      this.sync.fail(`Nicht alle Termine der Serie konnten geändert werden. ${reason}`);
      failure = `Es wurden nur ${done} von ${total} Terminänderungen übernommen. ${retryHint} ${reason}`;
    }
    // Die Blöcke zum Anlegen kommen zuerst: die ersten `done` neuen Trainings stehen sicher in der Datenbank.
    await this.prefillAbsences(creates.slice(0, Math.min(done, creates.length)), await players);
    return failure;
  }

  /**
   * Neu angelegte Serien-Trainings: Spieler mit Abwesenheit oder Verletzung an dem Tag gleich als „Fehlt“ vorbelegen
   * (SCRUM-159/SCRUM-164). Die Abwesenheiten werden je Spieler nur einmal gelesen.
   */
  private async prefillAbsences(created: readonly { readonly id: string; readonly data: Readonly<Record<string, unknown>> }[], players: readonly Player[]): Promise<void> {
    if (created.length === 0) return;
    await this.absenceSync.reconcileEvents(created.map((entry) => eventFromDoc(entry.id, entry.data)), players, { fresh: true });
  }

  /** Ergebnis in Worten, z. B. „2 Trainings wurden angelegt, 3 Termine wurden angepasst.“ */
  private summary(plan: SeriesChangePlan): string {
    const parts: string[] = [];
    const part = (n: number, one: string, many: string) => (n > 0 ? parts.push(n === 1 ? `1 ${one}` : `${n} ${many}`) : 0);
    part(plan.create.length, 'Training wurde angelegt', 'Trainings wurden angelegt');
    part(plan.update.length, 'Termin wurde angepasst', 'Termine wurden angepasst');
    part(plan.remove.length, 'Termin wurde entfernt', 'Termine wurden entfernt');
    const kept = plan.keptRated + plan.keptEdited;
    const keptText = kept > 0 ? ` ${kept === 1 ? '1 Termin blieb' : `${kept} Termine blieben`} unverändert, weil ${kept === 1 ? 'er' : 'sie'} bewertet oder von Hand geändert ${kept === 1 ? 'wurde' : 'wurden'}.` : '';
    return `${parts.length > 0 ? `${parts.join(', ')}.` : 'Es gab keine neuen Trainings anzulegen.'}${keptText}`;
  }

  /**
   * Löscht die Serie: zuerst ihre künftigen, unbewerteten und nicht von Hand geänderten Termine, danach die Serie
   * selbst. Scheitert etwas, bleibt die Serie bestehen und kann erneut gelöscht werden. Rückgabe: false, wenn nicht erlaubt.
   */
  deleteSeries(id: string): boolean {
    if (!this.canWrite() || this.load() !== 'ready') return false;
    void this.removeSeries(id);
    return true;
  }

  private async removeSeries(id: string): Promise<void> {
    this.run.set({ state: 'running', text: 'Serie wird gelöscht …' });
    const plan = await this.preparePlan(id, null, 'Die Serie wurde nicht gelöscht, denn ', 'Bitte später erneut löschen.');
    if (!plan) return;
    const failure = await this.execute(null, plan, 'Die Serie besteht noch; bitte erneut löschen, dann wird der Rest entfernt.');
    if (failure) {
      this.run.set({ state: 'error', text: failure });
      return;
    }
    if (!(await this.write(this.api.deleteSeries(id), 'Die Serie konnte nicht gelöscht werden.'))) {
      this.run.set({ state: 'error', text: 'Die künftigen Termine wurden entfernt, aber die Serie konnte nicht gelöscht werden. Bitte erneut löschen.' });
      return;
    }
    this.run.set({ state: 'done', text: `Die Serie wurde gelöscht. ${this.summary({ ...plan, create: [] }).replace('Es gab keine neuen Trainings anzulegen.', 'Es gab keine künftigen Termine zu entfernen.')}` });
  }

  /** Löst das Schreiben aus; das Ergebnis sagt, ob es geklappt hat (Fehler sind bereits gemeldet). */
  write(pending: Promise<void>, failure: string): Promise<boolean> {
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
    this.planningLoad.set('error');
  }
}
