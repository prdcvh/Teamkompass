import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { MeasurementPlanApi } from '../firebase/measurement-plan.api';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SquadService } from '../player/squad.service';
import { SyncService } from '../shell/sync.service';
import { type Measurement, measurementFromDoc } from './measurement';
import {
  DEFAULT_INTERVAL_MONTHS,
  MAX_INTERVAL_MONTHS,
  MIN_INTERVAL_MONTHS,
  type PlanEntry,
  berlinToday,
  buildPlan,
  docFromPlanEntry,
  planCounts,
  planEntriesFromDoc,
  resumeEntry,
  roundQueue,
} from './measurement-plan';

/**
 * Messplan (SCRUM-255) für den Kader: letzte gültige Messung, nächster Termin und Status je Spieler, dazu die
 * Entscheidungen des Trainers (Rhythmus, Termin, Pause). Nur Trainer (die Regeln sperren `meta/measurementPlan` für alle
 * anderen). Die Messungen werden einmalig je Spieler gelesen (wie das Bio-Banding), und nur für Spieler mit
 * dokumentierter Einwilligung; für alle anderen wird nichts geladen. Beim Abmelden wird alles verworfen.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementPlanService {
  private readonly api = inject(MeasurementPlanApi);
  private readonly recordsApi = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly sync = inject(SyncService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  private readonly byPlayer = signal<ReadonlyMap<string, readonly Measurement[]>>(new Map());
  /** Heutiges Kalenderdatum in Europe/Berlin; wird beim Laden und bei jeder Eingabe neu gesetzt. */
  readonly today = signal(berlinToday());
  readonly load = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly canUse = computed(() => this.session.role() === 'trainer');
  readonly entries = computed(() => planEntriesFromDoc(this.stored()));
  readonly rows = computed(() => buildPlan(this.squad.players(), this.byPlayer(), this.entries(), this.today()));
  readonly counts = computed(() => planCounts(this.rows()));
  /** Wer für eine Messrunde in Frage kommt. */
  readonly queue = computed(() => roundQueue(this.rows()));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private planLoaded = false;
  private measurementsLoaded = false;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet das Abo auf die Entscheidungen und liest die Messungen der Spieler mit dokumentierter Einwilligung. */
  start(): void {
    if (!this.canUse() || this.load() === 'loading' || this.unsubscribe || this.squad.load() !== 'ready') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.planLoaded = false;
    this.measurementsLoaded = false;
    this.today.set(berlinToday());
    this.api
      .watchPlan(
        (data, meta) => {
          if (generation !== this.generation) return;
          this.stored.set(data);
          this.planLoaded = true;
          this.sync.applySnapshot(meta);
          this.checkReady();
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
    void this.loadMeasurements(generation);
  }

  retry(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.byPlayer.set(new Map());
    this.load.set('idle');
  }

  /** Nach dem Speichern einer Messung in der Messrunde: Messungen dieses einen Spielers übernehmen. */
  applyMeasurements(playerId: string, measurements: readonly Measurement[]): void {
    this.byPlayer.update((map) => new Map(map).set(playerId, measurements));
    this.today.set(berlinToday());
  }

  /** Eigener Rhythmus (1 bis 6 Monate); der Vorschlag (3) entfernt die Abweichung. Rückgabe: Fehlertext oder ''. */
  setInterval(playerId: string, months: number): string {
    if (!Number.isInteger(months) || months < MIN_INTERVAL_MONTHS || months > MAX_INTERVAL_MONTHS) return `Der Rhythmus liegt zwischen ${MIN_INTERVAL_MONTHS} und ${MAX_INTERVAL_MONTHS} Monaten.`;
    return this.update(playerId, (entry) => ({ ...entry, intervalMonths: months === DEFAULT_INTERVAL_MONTHS ? undefined : months }));
  }

  /** Nächsten Termin von Hand setzen (vorziehen oder verschieben); '' nimmt ihn zurück. Rückgabe: Fehlertext oder ''. */
  setDueDate(playerId: string, date: string): string {
    const today = berlinToday();
    this.today.set(today);
    if (date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Bitte ein gültiges Datum wählen.';
    if (date !== '' && date < today) return 'Der Termin darf nicht in der Vergangenheit liegen.';
    return this.update(playerId, (entry) => ({ ...entry, dueDate: date || undefined, dueSetOn: date ? today : undefined }));
  }

  /** Messplanung eines Spielers pausieren; beim Fortsetzen ist er heute fällig (nicht überfällig). */
  setPaused(playerId: string, paused: boolean): string {
    const today = berlinToday();
    this.today.set(today);
    return this.update(playerId, (entry) => (paused ? { ...entry, paused: true } : resumeEntry(entry, today)));
  }

  private update(playerId: string, change: (entry: PlanEntry) => PlanEntry): string {
    if (!this.canUse() || this.load() !== 'ready') return 'Der Messplan ist noch nicht geladen. Bitte kurz warten.';
    if (!this.squad.players().some((player) => player.id === playerId)) return 'Dieser Spieler gehört nicht zum Kader.';
    const next = change(this.entries()[playerId] ?? {});
    const data = docFromPlanEntry(next);
    // Sofort anzeigen (wie die übrigen Listen); die Datenbank bestätigt über das Abo.
    const current = { ...((this.stored()?.['measurementPlan'] as Record<string, unknown> | undefined) ?? {}) };
    if (data === null) delete current[playerId];
    else current[playerId] = data;
    this.stored.update((doc) => ({ ...doc, measurementPlan: current }));
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void this.api.savePlayerPlan(playerId, data).then(
      () => this.sync.clearError(),
      (error) => {
        console.error(error);
        this.sync.fail(`Der Messplan konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error))}`);
      },
    );
    return '';
  }

  private async loadMeasurements(generation: number): Promise<void> {
    const players = this.squad.players().filter((player) => player.consentStatus === 'granted');
    const today = berlinToday();
    try {
      const entries = await Promise.all(
        players.map(async (player): Promise<[string, readonly Measurement[]]> => {
          const docs = await this.recordsApi.readPlayerRecords(player.id, 'measurements');
          return [player.id, docs.map((doc) => measurementFromDoc(doc.id, doc.data, today))];
        }),
      );
      if (generation !== this.generation) return;
      this.byPlayer.set(new Map(entries));
      this.measurementsLoaded = true;
      this.checkReady();
    } catch (error) {
      if (generation === this.generation) this.failLoad(error);
    }
  }

  private checkReady(): void {
    if (this.load() === 'loading' && this.planLoaded && this.measurementsLoaded) this.load.set('ready');
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
