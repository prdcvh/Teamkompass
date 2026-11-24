import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { isConsentRevoked } from '../player/player';
import { SquadService } from '../player/squad.service';
import { fieldTestFromDoc, isFieldTestDoc } from './field-test';
import type { ReferencePlayer } from './field-test-reference';

/**
 * Feldtest-Ergebnisse aller Spieler des eigenen Teams als Referenz für die Vergleichswerte (SCRUM-264). Nur für
 * Trainer: Spieler und Eltern dürfen (und können laut Regeln) keine fremden Einzelmessungen laden, deshalb gibt es für
 * sie gar keinen Vergleich. Liest einmalig (nicht in Echtzeit); Spieler mit widerrufener Datennutzung werden nicht
 * geladen und zählen nie mit. Nichts davon wird gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class FieldTestReferenceService {
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly recordsApi = inject(PlayerRecordsApi);

  readonly visible = computed(() => this.session.role() === 'trainer');
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly players = signal<readonly ReferencePlayer[]>([]);
  /** Spieler, deren Daten nicht geladen werden konnten (fehlen in der Referenz). */
  readonly failed = signal(0);

  private generation = 0;

  constructor() {
    // Ohne Anmeldung dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() === null) this.reset();
    });
  }

  /** Lädt die Feldtests aller Spieler; der letzte Aufruf gewinnt. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    if (!this.visible()) {
      this.reset();
      return;
    }
    this.state.set('loading');
    const squad = this.squad.players().filter((player) => !isConsentRevoked(player));
    const entries = await Promise.all(
      squad.map(async (player): Promise<ReferencePlayer | null> => {
        try {
          const docs = await this.recordsApi.readPlayerRecords(player.id, 'measurements');
          const results = docs.filter((entry) => isFieldTestDoc(entry.data)).map((entry) => fieldTestFromDoc(entry.id, entry.data));
          return { playerId: player.id, birthdate: player.birthdate, results };
        } catch (error) {
          console.error(error);
          return null;
        }
      }),
    );
    if (generation !== this.generation) return;
    const loaded = entries.filter((entry): entry is ReferencePlayer => entry !== null);
    this.players.set(loaded);
    this.failed.set(entries.length - loaded.length);
    this.state.set(entries.length > 0 && loaded.length === 0 ? 'error' : 'ready');
  }

  reset(): void {
    this.generation += 1;
    this.players.set([]);
    this.failed.set(0);
    this.state.set('idle');
  }
}
