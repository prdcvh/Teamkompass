import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth-errors';
import { PlayerRecordsApi, type PlayerRecordKind } from '../firebase/player-records.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import { todayIso } from '../player';
import { SessionService } from '../session.service';
import { SyncService } from '../sync.service';
import { type Absence, absenceFromDoc } from './absence';
import { type Measurement, measurementFromDoc } from './measurement';
import { type DevelopmentPlan, planFromDoc } from './plan';

/**
 * Gemeinsamer Ladezustand der Zusatzdaten EINES Spielers (Förderpläne, Abwesenheiten, Messwerte): folgt der Datenbank
 * in Echtzeit und stellt die Schreib-Hilfen bereit, die {@link PlansService}, {@link AbsencesService} und
 * {@link MeasurementsService} gemeinsam nutzen. Geschrieben wird erst, wenn alle drei Listen geladen sind und kein
 * Fehler vorliegt; schreiben darf nur der Trainer (die Selbstreflexion schreibt der Spieler selbst).
 */
@Injectable({ providedIn: 'root' })
export class RecordsStateService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly playerId = signal<string | null>(null);
  readonly plans = signal<readonly DevelopmentPlan[]>([]);
  readonly absences = signal<readonly Absence[]>([]);
  readonly measurementList = signal<readonly Measurement[]>([]);
  readonly error = signal('');
  private readonly answered = signal<ReadonlySet<PlayerRecordKind>>(new Set());
  /** Welche Zusatzdaten die Rolle lesen darf: Medizin sieht keine Förderpläne (Regeln: players/{id}/developmentPlans). */
  private readonly expected = signal(3);

  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly loading = computed(() => this.playerId() !== null && !this.error() && this.answered().size < this.expected());
  readonly ready = computed(() => this.playerId() !== null && !this.loading() && !this.error());

  private unsubscribers: (() => void)[] = [];
  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet die Abos für den Spieler (ein anderer Spieler beendet die bisherigen). */
  start(playerId: string): void {
    if (this.playerId() === playerId) return;
    this.stop();
    const generation = ++this.generation;
    this.playerId.set(playerId);
    const today = todayIso();
    const role = this.session.role();
    // Spieler und Eltern: nur Dokumente mit der eigenen playerId (so verlangen es die Regeln).
    const ownOnly = role === 'player' || role === 'parent';
    this.expected.set(role === 'medical' ? 2 : 3);
    if (role !== 'medical') {
      this.open(generation, playerId, 'developmentPlans', ownOnly, (docs) => this.plans.set(docs.map((entry) => planFromDoc(entry.id, entry.data, today))));
    }
    this.open(generation, playerId, 'absences', ownOnly, (docs) => this.absences.set(docs.map((entry) => absenceFromDoc(entry.id, entry.data))));
    this.open(generation, playerId, 'measurements', ownOnly, (docs) => this.measurementList.set(docs.map((entry) => measurementFromDoc(entry.id, entry.data, today))));
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.playerId.set(null);
    this.plans.set([]);
    this.absences.set([]);
    this.measurementList.set([]);
    this.answered.set(new Set());
    this.error.set('');
  }

  retry(): void {
    const playerId = this.playerId();
    this.stop();
    if (playerId) this.start(playerId);
  }

  // --- Schreib-Hilfen für die Fach-Services -------------------------------------------------------------------

  /** Der Spieler, in dessen Profil gerade geschrieben werden darf (null = nicht erlaubt oder noch nicht geladen). */
  writablePlayer(): string | null {
    const playerId = this.playerId();
    return this.canWrite() && playerId !== null && !this.loading() && !this.error() ? playerId : null;
  }

  async remove<T extends { id: string }>(
    kind: PlayerRecordKind,
    id: string,
    text: string,
    set: (list: readonly T[]) => void,
    current: readonly T[],
  ): Promise<boolean> {
    const playerId = this.writablePlayer();
    if (!playerId) return false;
    this.markSyncing();
    try {
      await this.playerRecordsApi.deletePlayerRecord(playerId, kind, id);
      set(current.filter((item) => item.id !== id));
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, text);
      return false;
    }
  }

  write(text: string, action: () => Promise<void>): void {
    this.markSyncing();
    void action()
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, text));
  }

  markSyncing(): void {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
  }

  failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }

  clearSyncError(): void {
    this.sync.clearError();
  }

  private open(generation: number, playerId: string, kind: PlayerRecordKind, ownOnly: boolean, apply: (docs: RawDoc[]) => void): void {
    this.playerRecordsApi
      .watchPlayerRecords(
        playerId,
        kind,
        (docs, meta: SnapshotMeta) => {
          if (generation !== this.generation) return;
          apply(docs);
          untracked(() => this.answered.update((set) => new Set(set).add(kind)));
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
        { ownOnly },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.error()) unsubscribe();
        else this.unsubscribers.push(unsubscribe);
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.error.set(`Die Zusatzdaten konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }
}
