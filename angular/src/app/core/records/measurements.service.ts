import { Injectable, computed, inject } from '@angular/core';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { SessionService } from '../auth/session.service';
import { type Measurement, REVIEW_BY_MAX, REVIEW_REASON_MAX, docFromMeasurement, measurementQuality, reviewDoc, withoutReview, sortedMeasurements } from './measurement';
import { type MeasurementContext, type MeasurementDraft, type MeasurementErrors, evaluateMeasurement, measurementFromDraft, recomputeTrendFlags, type TrendFlagChange } from './measurement-draft';
import { RecordsStateService } from './records-state.service';

const RECALCULATION_ERROR = 'Die Markierungen der übrigen Messungen konnten nicht neu gespeichert werden.';

/** Messwerte (Größe, Gewicht, Sitzhöhe) des geladenen Spielers lesen und schreiben (nur Trainer). */
@Injectable({ providedIn: 'root' })
export class MeasurementsService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly state = inject(RecordsStateService);
  private readonly squad = inject(SquadService);
  private readonly session = inject(SessionService);

  /** Messungen, älteste zuerst. */
  readonly measurements = computed(() => sortedMeasurements(this.state.measurementList()));

  /** Geburtsdatum des geladenen Spielers ('' = unbekannt). */
  readonly birthdate = computed(() => {
    const id = this.state.playerId();
    return (id && this.squad.players().find((player) => player.id === id)?.birthdate) || '';
  });

  /** Prüfumgebung für das Formular: heute, Geburtsdatum, übrige Messungen (ohne die bearbeitete). */
  context(editingId: string | null, today = todayIso()): MeasurementContext {
    return { today, birthdate: this.birthdate(), others: this.measurements().filter((entry) => entry.id !== editingId) };
  }

  saveMeasurement(draft: MeasurementDraft, now: Date = new Date()): MeasurementErrors {
    const playerId = this.state.writablePlayer();
    if (!playerId) return { date: 'Nur Trainer dürfen Messwerte ändern.' };
    const evaluation = evaluateMeasurement(draft, this.context(draft.id, todayIso(now)));
    if (Object.keys(evaluation.errors).length > 0) return evaluation.errors;
    const id = draft.id ?? `me${crypto.randomUUID()}`;
    const previous = draft.id ? (this.state.measurementList().find((entry) => entry.id === draft.id) ?? null) : null;
    const measurement = measurementFromDraft(draft, id, evaluation, previous, now.toISOString());
    const list = [...this.state.measurementList().filter((item) => item.id !== id), measurement];
    // Nachgetragene oder korrigierte ältere Messung: Markierungen „kleiner/größer als vorige Messung“ der übrigen neu (SCRUM-306).
    // Die gespeicherte Messung selbst wurde gerade mit derselben Regel geprüft; sie bleibt, wie sie ist.
    const changes = recomputeTrendFlags(list).filter((change) => change.measurement.id !== id);
    this.state.measurementList.set(this.withChanges(list, changes));
    this.state.write('Messung konnte nicht gespeichert werden.', () => this.playerRecordsApi.savePlayerRecord(playerId, 'measurements', id, docFromMeasurement(measurement)));
    if (changes.length) this.state.write(RECALCULATION_ERROR, () => this.saveFlagChanges(playerId, changes));
    return {};
  }

  private withChanges(list: readonly Measurement[], changes: readonly TrendFlagChange[]): Measurement[] {
    const byId = new Map(changes.map((change) => [change.measurement.id, change.measurement]));
    return list.map((entry) => byId.get(entry.id) ?? entry);
  }

  private saveFlagChanges(playerId: string, changes: readonly TrendFlagChange[]): Promise<void> {
    return this.playerRecordsApi.saveMeasurementFlags(
      playerId,
      changes.map(({ measurement, reviewDropped }) => ({
        id: measurement.id,
        quality: measurement.quality === 'flagged' ? 'flagged' : 'verified',
        flags: measurement.flags ?? [],
        dropReview: reviewDropped,
      })),
    );
  }

  /** Trainer und Medizin dürfen eine markierte Messung bestätigen oder die Bestätigung zurücknehmen (SCRUM-387). */
  readonly canReview = computed(() => {
    const role = this.session.role();
    return (role === 'trainer' || role === 'physio') && this.state.playerId() !== null && !this.state.loading() && !this.state.error();
  });

  /** Anzeigename des Kontos für „Geprüft von …“ – nie die E-Mail-Adresse. */
  private reviewer(): string {
    const name = this.session.displayName().trim();
    return (name || (this.session.role() === 'physio' ? 'Medizin' : 'Trainer')).slice(0, REVIEW_BY_MAX);
  }

  /**
   * „Messung stimmt“: speichert Datum, Konto und optional eine kurze Begründung. Der Messwert und die Markierung
   * bleiben gespeichert; Auswertungen zählen die Messung ab jetzt normal. Nur für markierte Messungen.
   */
  async confirmMeasurement(id: string, reason = '', now: Date = new Date()): Promise<boolean> {
    const playerId = this.state.playerId();
    const uid = this.session.uid();
    const target = this.state.measurementList().find((entry) => entry.id === id);
    if (!this.canReview() || !playerId || !uid || !target || target.quality !== 'flagged' || target.review) return false;
    const review = { at: now.toISOString(), by: this.reviewer(), byUid: uid, ...(reason.trim() ? { reason: reason.trim().slice(0, REVIEW_REASON_MAX) } : {}) };
    return this.writeReview(playerId, target, review, 'Die Bestätigung konnte nicht gespeichert werden.');
  }

  /** Nimmt die Bestätigung zurück: die Messung ist wieder markiert. */
  async withdrawReview(id: string): Promise<boolean> {
    const playerId = this.state.playerId();
    const target = this.state.measurementList().find((entry) => entry.id === id);
    if (!this.canReview() || !playerId || !target?.review) return false;
    return this.writeReview(playerId, target, null, 'Die Bestätigung konnte nicht zurückgenommen werden.');
  }

  private async writeReview(playerId: string, target: Measurement, review: Measurement['review'] | null, errorText: string): Promise<boolean> {
    this.state.markSyncing();
    try {
      await this.playerRecordsApi.saveMeasurementReview(playerId, target.id, review ? reviewDoc(review) : null);
      this.state.measurementList.update((list) =>
        list.map((entry) => {
          if (entry.id !== target.id) return entry;
          const rest = withoutReview(entry);
          return review ? { ...rest, review } : rest;
        }),
      );
      this.state.clearSyncError();
      return true;
    } catch (error) {
      this.state.failWrite(error, errorText);
      return false;
    }
  }

  /** Ist die Messung (noch) zur Prüfung markiert? Bestätigte zählen nicht mehr. */
  isFlagged(measurement: Measurement): boolean {
    return measurementQuality(measurement) === 'flagged';
  }

  /**
   * Löscht eine Messung. Danach werden die Markierungen „kleiner/größer als vorige Messung“ der übrigen Messungen neu
   * berechnet (SCRUM-306) – außer `recalculate: false`, z. B. wenn ohnehin alle Messungen gelöscht werden.
   */
  async deleteMeasurement(id: string, options: { readonly recalculate?: boolean } = {}): Promise<boolean> {
    const playerId = this.state.writablePlayer();
    const removed = await this.state.remove('measurements', id, 'Messung konnte nicht gelöscht werden.', (list) => this.state.measurementList.set(list as Measurement[]), this.state.measurementList());
    if (!removed || !playerId || options.recalculate === false) return removed;
    const changes = recomputeTrendFlags(this.state.measurementList());
    if (changes.length === 0) return true;
    this.state.measurementList.update((list) => this.withChanges(list, changes));
    this.state.write(RECALCULATION_ERROR, () => this.saveFlagChanges(playerId, changes));
    return true;
  }
}
