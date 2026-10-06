import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from './auth-errors';
import { FirebaseService, type PlayerRecordKind, type RawDoc, type SnapshotMeta } from './firebase.service';
import { todayIso } from './player';
import { ProfileService } from './profile.service';
import { docFromRating } from './rating';
import {
  type Absence,
  type AbsenceDraft,
  type AbsenceErrors,
  type DevelopmentPlan,
  type Measurement,
  type MeasurementDraft,
  type MeasurementErrors,
  type PlanDraft,
  type PlanErrors,
  absenceFromDoc,
  absenceFromDraft,
  autoAbsenceRating,
  docFromAbsence,
  docFromMeasurement,
  docFromPlan,
  measurementFromDoc,
  measurementFromDraft,
  planFromDoc,
  planFromDraft,
  sortedMeasurements,
  unavailabilityReason,
  validateAbsence,
  validateMeasurement,
  validatePlan,
} from './records';
import { SessionService } from './session.service';
import { SquadService } from './squad.service';
import { SyncService } from './sync.service';

/**
 * Förderpläne, Abwesenheiten und Messwerte EINES Spielers (Zusatzdaten im Profil): folgt der Datenbank in Echtzeit
 * und schreibt Änderungen. Schreiben darf nur der Trainer; die Selbstreflexion schreibt der Spieler selbst. Eine
 * geänderte oder gelöschte Abwesenheit gleicht die automatisch gesetzten „Fehlt“-Einträge der Events ab (SCRUM-18).
 */
@Injectable({ providedIn: 'root' })
export class RecordsService {
  private readonly firebase = inject(FirebaseService);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly squad = inject(SquadService);
  private readonly profile = inject(ProfileService);

  readonly playerId = signal<string | null>(null);
  readonly plans = signal<readonly DevelopmentPlan[]>([]);
  readonly absences = signal<readonly Absence[]>([]);
  readonly measurementList = signal<readonly Measurement[]>([]);
  readonly error = signal('');
  private readonly answered = signal<ReadonlySet<PlayerRecordKind>>(new Set());

  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly loading = computed(() => this.playerId() !== null && !this.error() && this.answered().size < 3);
  /** Messungen, älteste zuerst. */
  readonly measurements = computed(() => sortedMeasurements(this.measurementList()));
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
    this.open(generation, playerId, 'developmentPlans', (docs) => this.plans.set(docs.map((entry) => planFromDoc(entry.id, entry.data, today))));
    this.open(generation, playerId, 'absences', (docs) => this.absences.set(docs.map((entry) => absenceFromDoc(entry.id, entry.data))));
    this.open(generation, playerId, 'measurements', (docs) => this.measurementList.set(docs.map((entry) => measurementFromDoc(entry.id, entry.data, today))));
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

  // --- Förderpläne ------------------------------------------------------------------------------------------

  savePlan(draft: PlanDraft): PlanErrors {
    const playerId = this.writablePlayer();
    if (!playerId) return { focus: 'Nur Trainer dürfen Förderpläne ändern.' };
    const errors = validatePlan(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `dp${crypto.randomUUID()}`;
    const plan = planFromDraft(draft, id, this.plans().find((item) => item.id === id), todayIso());
    this.plans.update((list) => [...list.filter((item) => item.id !== id), plan]);
    this.write('Förderplan konnte nicht gespeichert werden.', () => this.firebase.savePlayerRecord(playerId, 'developmentPlans', id, docFromPlan(plan)));
    return {};
  }

  async deletePlan(id: string): Promise<boolean> {
    return this.remove('developmentPlans', id, 'Förderplan konnte nicht gelöscht werden.', (list) => this.plans.set(list as DevelopmentPlan[]), this.plans());
  }

  /** Die Selbstreflexion schreibt nur der Spieler selbst, nur zu seinem eigenen Förderplan. */
  async saveSelfReflection(planId: string, text: string): Promise<boolean> {
    const playerId = this.playerId();
    if (this.session.role() !== 'player' || !playerId || this.session.playerId() !== playerId) return false;
    if (!this.plans().some((plan) => plan.id === planId)) return false;
    const reflection = text.trim().slice(0, 400);
    const at = new Date().toISOString();
    this.plans.update((list) => list.map((plan) => (plan.id === planId ? { ...plan, selfReflection: reflection, selfReflectionAt: at } : plan)));
    this.markSyncing();
    try {
      await this.firebase.saveSelfReflection(playerId, planId, reflection, at);
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, 'Reflexion konnte nicht gespeichert werden.');
      return false;
    }
  }

  // --- Abwesenheiten ----------------------------------------------------------------------------------------

  saveAbsence(draft: AbsenceDraft): AbsenceErrors {
    const playerId = this.writablePlayer();
    if (!playerId) return { reason: 'Nur Trainer dürfen Abwesenheiten ändern.' };
    const errors = validateAbsence(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `ab${crypto.randomUUID()}`;
    const absence = absenceFromDraft(draft, id);
    const next = [...this.absences().filter((item) => item.id !== id), absence];
    this.absences.set(next);
    this.write('Abwesenheit konnte nicht gespeichert werden.', () => this.firebase.savePlayerRecord(playerId, 'absences', id, docFromAbsence(absence)));
    this.reconcileAbsences(playerId, next);
    return {};
  }

  async deleteAbsence(id: string): Promise<boolean> {
    const playerId = this.writablePlayer();
    const ok = await this.remove('absences', id, 'Abwesenheit konnte nicht gelöscht werden.', (list) => this.absences.set(list as Absence[]), this.absences());
    if (ok && playerId) this.reconcileAbsences(playerId, this.absences());
    return ok;
  }

  /**
   * Gleicht die Bewertungen aller Events dieses Spielers mit den Abwesenheiten ab: fehlende Spieler werden vorbelegt,
   * gelöschte oder verkürzte Abwesenheiten setzen automatisch gesetzte „Fehlt“-Einträge zurück. Läuft nur, wenn alle
   * Bewertungen geladen sind, sonst würde eine noch nicht eingetroffene Bewertung überschrieben.
   */
  reconcileAbsences(playerId: string, absences: readonly Absence[]): number {
    const player = this.squad.players().find((entry) => entry.id === playerId);
    if (!player || this.profile.playerId() !== playerId || this.profile.loading() || this.profile.error()) return 0;
    let changed = 0;
    for (const { event, rating } of this.profile.items()) {
      const next = autoAbsenceRating(rating, unavailabilityReason(player, absences, event.date));
      if (!next) continue;
      changed += 1;
      this.write('Abwesenheit konnte nicht in die Event-Bewertung übernommen werden.', () =>
        this.firebase.saveRating(event.id, playerId, docFromRating(next, { clearAuto: true })),
      );
    }
    return changed;
  }

  // --- Messwerte --------------------------------------------------------------------------------------------

  saveMeasurement(draft: MeasurementDraft): MeasurementErrors {
    const playerId = this.writablePlayer();
    if (!playerId) return { date: 'Nur Trainer dürfen Messwerte ändern.' };
    const errors = validateMeasurement(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `me${crypto.randomUUID()}`;
    const measurement = measurementFromDraft(draft, id);
    this.measurementList.update((list) => [...list.filter((item) => item.id !== id), measurement]);
    this.write('Messung konnte nicht gespeichert werden.', () => this.firebase.savePlayerRecord(playerId, 'measurements', id, docFromMeasurement(measurement)));
    return {};
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    return this.remove('measurements', id, 'Messung konnte nicht gelöscht werden.', (list) => this.measurementList.set(list as Measurement[]), this.measurementList());
  }

  // --- intern -----------------------------------------------------------------------------------------------

  private writablePlayer(): string | null {
    const playerId = this.playerId();
    return this.canWrite() && playerId !== null && !this.loading() && !this.error() ? playerId : null;
  }

  private async remove<T extends { id: string }>(
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
      await this.firebase.deletePlayerRecord(playerId, kind, id);
      set(current.filter((item) => item.id !== id));
      this.sync.clearError();
      return true;
    } catch (error) {
      this.failWrite(error, text);
      return false;
    }
  }

  private write(text: string, action: () => Promise<void>): void {
    this.markSyncing();
    void action()
      .then(() => this.sync.clearError())
      .catch((error) => this.failWrite(error, text));
  }

  private open(generation: number, playerId: string, kind: PlayerRecordKind, apply: (docs: RawDoc[]) => void): void {
    this.firebase
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
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.error()) unsubscribe();
        else this.unsubscribers.push(unsubscribe);
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  private markSyncing(): void {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
  }

  private failLoad(error: unknown): void {
    console.error(error);
    this.error.set(`Die Zusatzdaten konnten nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }

  private failWrite(error: unknown, text: string): void {
    console.error(error);
    this.sync.fail(`${text} ${authErrorMessage(errorCode(error))}`);
  }
}
