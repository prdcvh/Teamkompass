import { Injectable, computed, inject } from '@angular/core';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { type Measurement, type MeasurementDraft, type MeasurementErrors, docFromMeasurement, measurementFromDraft, sortedMeasurements, validateMeasurement } from './measurement';
import { RecordsStateService } from './records-state.service';

/** Messwerte (Größe, Gewicht) des geladenen Spielers lesen und schreiben (nur Trainer). */
@Injectable({ providedIn: 'root' })
export class MeasurementsService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly state = inject(RecordsStateService);

  /** Messungen, älteste zuerst. */
  readonly measurements = computed(() => sortedMeasurements(this.state.measurementList()));

  saveMeasurement(draft: MeasurementDraft): MeasurementErrors {
    const playerId = this.state.writablePlayer();
    if (!playerId) return { date: 'Nur Trainer dürfen Messwerte ändern.' };
    const errors = validateMeasurement(draft);
    if (Object.keys(errors).length > 0) return errors;
    const id = draft.id ?? `me${crypto.randomUUID()}`;
    const measurement = measurementFromDraft(draft, id);
    this.state.measurementList.update((list) => [...list.filter((item) => item.id !== id), measurement]);
    this.state.write('Messung konnte nicht gespeichert werden.', () => this.playerRecordsApi.savePlayerRecord(playerId, 'measurements', id, docFromMeasurement(measurement)));
    return {};
  }

  async deleteMeasurement(id: string): Promise<boolean> {
    return this.state.remove('measurements', id, 'Messung konnte nicht gelöscht werden.', (list) => this.state.measurementList.set(list as Measurement[]), this.state.measurementList());
  }
}
