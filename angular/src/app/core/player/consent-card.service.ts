import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlayersApi } from '../firebase/players.api';
import type { RawDoc } from '../firebase/types';
import { type Player, cardFromPlayer } from './player';
import { SquadService } from './squad.service';

/**
 * Welche Karten (playerCards) geschrieben bzw. gelöscht werden müssen: je Spieler mit widerrufener Einwilligung eine
 * bereinigte Karte, für alle anderen keine. Unveränderte Karten werden nicht neu geschrieben.
 */
export function cardChanges(players: readonly Player[], published: readonly RawDoc[]): Map<string, Record<string, unknown> | null> {
  const changes = new Map<string, Record<string, unknown> | null>();
  const existing = new Map(published.map((entry) => [entry.id, entry.data]));
  for (const player of players) {
    if (player.consentStatus !== 'revoked') continue;
    const wanted = cardFromPlayer(player);
    if (JSON.stringify(existing.get(player.id) ?? null) !== JSON.stringify(sortKeys(wanted))) changes.set(player.id, wanted);
  }
  const revoked = new Set(players.filter((player) => player.consentStatus === 'revoked').map((player) => player.id));
  for (const id of existing.keys()) if (!revoked.has(id)) changes.set(id, null);
  return changes;
}

function sortKeys(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
}

function normalize(docs: readonly RawDoc[]): RawDoc[] {
  return docs.map((entry) => ({ id: entry.id, data: sortKeys({ ...entry.data }) }));
}

/**
 * Trainer-Client pflegt die bereinigten Spielerkarten (SCRUM-245): Spieler und Eltern lesen bei widerrufener
 * Einwilligung ihr Spielerdokument nicht mehr (Regeln), sondern nur noch die Karte mit Name, Nummer, Positionen und
 * Geburtsdatum. Außerdem trägt er bei älteren Spielerdokumenten ohne Feld `consentStatus` „offen“ nach – sonst fehlen
 * sie in der Medizin-Liste, die nur nach diesem Feld filtern darf. Abgeglichen wird, sobald der Kader geladen ist;
 * es wird nichts gelöscht außer Karten, die nicht mehr gebraucht werden.
 */
@Injectable({ providedIn: 'root' })
export class ConsentCardService {
  private readonly api = inject(PlayersApi);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);

  private readonly trainer = computed(() => this.session.role() === 'trainer');
  private readonly published = signal<readonly RawDoc[] | null>(null);
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private running = false;
  private again = false;
  private backfilled = new Set<string>();

  constructor() {
    effect(() => {
      const trainer = this.trainer();
      untracked(() => (trainer ? this.begin() : this.end()));
    });
    effect(() => {
      const published = this.published();
      const players = this.squad.players();
      const missing = this.squad.missingConsent();
      if (!this.trainer() || published === null || this.squad.load() !== 'ready') return;
      untracked(() => void this.reconcile(players, published, missing));
    });
  }

  private begin(): void {
    if (this.unsubscribe) return;
    const generation = ++this.generation;
    this.api
      .watchPlayerCards(
        (docs) => {
          if (generation === this.generation) this.published.set(normalize(docs));
        },
        (error) => console.error('Spielerkarten konnten nicht gelesen werden', error),
      )
      .then((unsubscribe) => {
        if (generation !== this.generation) unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => console.error(error));
  }

  private end(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.published.set(null);
    this.backfilled.clear();
  }

  private async reconcile(players: readonly Player[], published: readonly RawDoc[], missing: readonly string[]): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      const changes = cardChanges(players, published);
      if (changes.size > 0) await this.api.applyPlayerCards(changes);
      for (const id of missing) {
        if (this.backfilled.has(id)) continue;
        this.backfilled.add(id);
        await this.api.savePlayer(id, { consentStatus: 'pending' });
      }
    } catch (error) {
      // Kein Hinweis an den Trainer: der nächste Abgleich versucht es erneut.
      console.error('Spielerkarten konnten nicht abgeglichen werden', error);
    } finally {
      this.running = false;
      const published = this.published();
      if (this.again && published && this.trainer()) {
        this.again = false;
        void this.reconcile(this.squad.players(), published, this.squad.missingConsent());
      }
      this.again = false;
    }
  }
}
