import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { MaturityApi } from '../firebase/maturity.api';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { isConsentRevoked } from '../player/player';
import { SquadService } from '../player/squad.service';
import { todayIso } from '../shared/dates';
import { maturityInputsFromDoc } from '../records/maturity';
import { growthMeasurementsFromDocs } from '../records/measurement';
import type { DevelopmentPlayerData } from './development-view';

/**
 * Datengrundlage der Entwicklungsansicht (SCRUM-258): liest einmalig (auf Knopfdruck, nicht in Echtzeit) je Spieler die
 * Angaben des Reife-Kompasses und alle Messwerte. Nur Trainer (die Teamanalyse ist Trainerbereich; Medizin und alle
 * anderen Rollen laden nichts). Spieler mit widerrufener Einwilligung werden gar nicht erst geladen. Nichts davon wird
 * gespeichert oder ausgegeben; beim Abmelden/Rollenwechsel ist alles sofort weg.
 */
@Injectable({ providedIn: 'root' })
export class DevelopmentViewService {
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly maturityApi = inject(MaturityApi);
  private readonly recordsApi = inject(PlayerRecordsApi);

  readonly visible = computed(() => this.session.role() === 'trainer');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly data = signal<ReadonlyMap<string, DevelopmentPlayerData>>(new Map());

  private generation = 0;

  constructor() {
    // Ohne Trainerrolle (z. B. nach dem Abmelden) bleibt nichts im Speicher.
    effect(() => {
      if (!this.visible()) this.reset();
    });
  }

  async load(): Promise<void> {
    const generation = ++this.generation;
    if (!this.visible()) {
      this.reset();
      return;
    }
    this.state.set('loading');
    const today = todayIso();
    const entries = await Promise.all(
      this.squad
        .players()
        .filter((player) => !isConsentRevoked(player))
        .map(async (player): Promise<[string, DevelopmentPlayerData]> => {
          try {
            const [doc, records] = await Promise.all([this.maturityApi.readMaturity(player.id), this.recordsApi.readPlayerRecords(player.id, 'measurements')]);
            return [player.id, { inputs: maturityInputsFromDoc(doc), measurements: growthMeasurementsFromDocs(records, today) }];
          } catch (error) {
            console.error(error);
            return [player.id, null];
          }
        }),
    );
    if (generation !== this.generation || !this.visible()) return;
    this.data.set(new Map(entries));
    this.state.set(entries.length > 0 && entries.every(([, value]) => value === null) ? 'error' : 'ready');
  }

  reset(): void {
    this.generation += 1;
    this.data.set(new Map());
    this.state.set('idle');
  }
}
