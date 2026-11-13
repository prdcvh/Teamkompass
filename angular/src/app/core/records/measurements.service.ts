import { Injectable, computed, inject } from '@angular/core';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { type Measurement, docFromMeasurement, sortedMeasurements } from './measurement';
import { type MeasurementContext, type MeasurementDraft, type MeasurementErrors, evaluateMeasurement, measurementFromDraft } from './measurement-draft';
import { RecordsStateService } from './records-state.service';

/** Messwerte (Größe, Gewicht, Sitzhöhe) des geladenen Spielers lesen und schreiben (nur Trainer). */
@Injectable({ providedIn: 'root' })
export class MeasurementsService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly state = inject(RecordsStateService);
  private readonly squad = inject(SquadService);

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
    this.state.measurementList.update((list) => [...list.filter((item) => item.id !== id), measurement]);
    this.state.write('Messung konnte nicht gespeichert werden.', () => this.playerRecordsApi.savePlayerRecord(playerId, 'measurements', id, docFromMeasurement(measurement)));
    return {};
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    return this.state.remove('measurements', id, 'Messung konnte nicht gelöscht werden.', (list) => this.state.measurementList.set(list as Measurement[]), this.state.measurementList());
  }
}
