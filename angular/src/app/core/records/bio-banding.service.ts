import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { MaturityApi } from '../firebase/maturity.api';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { isConsentRevoked } from '../player/player';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { type BioBandingData, type BioBandingSuggestion, suggestBioBanding } from './bio-banding';
import { maturityInputsFromDoc } from './maturity';
import { measurementFromDoc } from './measurement';

/**
 * Bio-Banding-Vorschlag (SCRUM-191) für die Gruppeneinteilung eines Trainings. Liest einmalig (nicht in Echtzeit) je
 * Spieler die Angaben des Reife-Kompasses und die Messwerte und rechnet den Vorschlag aus. Sichtbar nur für Trainer
 * und Medizin (wie der Reife-Kompass; die Regeln sperren die Angaben für alle anderen). Spieler mit widerrufener
 * Datennutzung werden nicht geladen. Nichts davon wird gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class BioBandingService {
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly maturityApi = inject(MaturityApi);
  private readonly recordsApi = inject(PlayerRecordsApi);

  readonly visible = computed(() => this.session.role() === 'trainer' || this.session.role() === 'physio');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly suggestion = signal<BioBandingSuggestion | null>(null);

  private generation = 0;

  /** Lädt die Daten und berechnet den Vorschlag; der letzte Aufruf gewinnt. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    if (!this.visible()) {
      this.reset();
      return;
    }
    this.state.set('loading');
    const today = todayIso();
    const squad = this.squad.players();
    const entries = await Promise.all(
      squad
        .filter((player) => !isConsentRevoked(player))
        .map(async (player): Promise<[string, BioBandingData | null]> => {
          try {
            const [doc, records] = await Promise.all([this.maturityApi.readMaturity(player.id), this.recordsApi.readPlayerRecords(player.id, 'measurements')]);
            return [player.id, { inputs: maturityInputsFromDoc(doc), measurements: records.map((record) => measurementFromDoc(record.id, record.data, today)) }];
          } catch (error) {
            console.error(error);
            return [player.id, null];
          }
        }),
    );
    if (generation !== this.generation) return;
    this.suggestion.set(suggestBioBanding(squad, new Map(entries), today));
    this.state.set(entries.length > 0 && entries.every(([, data]) => data === null) ? 'error' : 'ready');
  }

  reset(): void {
    this.generation += 1;
    this.suggestion.set(null);
    this.state.set('idle');
  }
}
