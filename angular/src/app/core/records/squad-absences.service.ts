import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SquadService } from '../player/squad.service';
import { type Absence, absenceFromDoc } from './absence';

/**
 * Abwesenheiten aller Spieler des Kaders in Echtzeit, damit die Kaderliste den wirksamen Status zeigt (eine laufende
 * Abwesenheit überlagert den gespeicherten Status, SCRUM-164). Nur für den Trainer. Die Abos folgen dem Kader (neue
 * Spieler werden abonniert, entfernte beendet); beim Abmelden oder Stoppen werden Abos und Daten verworfen.
 * Schlägt ein Abo fehl, zeigt die Liste für diesen Spieler weiter den gespeicherten Status.
 */
@Injectable({ providedIn: 'root' })
export class SquadAbsencesService {
  private readonly api = inject(PlayerRecordsApi);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);

  readonly active = signal(false);
  /** Abwesenheiten je Spieler-ID (fehlt ein Spieler, ist noch nichts geladen). */
  readonly byPlayer = signal<ReadonlyMap<string, readonly Absence[]>>(new Map());

  private readonly unsubscribers = new Map<string, () => void>();
  private readonly opening = new Set<string>();
  private generation = 0;

  constructor() {
    effect(() => {
      const ids = this.squad.players().map((player) => player.id);
      if (this.active()) untracked(() => this.follow(ids));
    });
    effect(() => {
      if (this.session.role() !== 'trainer') this.stop();
    });
  }

  start(): void {
    if (this.active() || this.session.role() !== 'trainer') return;
    this.generation += 1;
    this.active.set(true);
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.opening.clear();
    this.active.set(false);
    this.byPlayer.set(new Map());
  }

  private follow(ids: readonly string[]): void {
    const keep = new Set(ids);
    for (const [id, unsubscribe] of this.unsubscribers) {
      if (keep.has(id)) continue;
      unsubscribe();
      this.unsubscribers.delete(id);
      this.byPlayer.update((map) => without(map, id));
    }
    for (const id of ids) {
      if (!this.unsubscribers.has(id) && !this.opening.has(id)) this.open(id, this.generation);
    }
  }

  private open(id: string, generation: number): void {
    this.opening.add(id);
    this.api
      .watchPlayerRecords(
        id,
        'absences',
        (docs) => {
          if (generation !== this.generation) return;
          this.byPlayer.update((map) => new Map(map).set(id, docs.map((entry) => absenceFromDoc(entry.id, entry.data))));
        },
        (error) => console.error(error),
      )
      .then((unsubscribe) => {
        this.opening.delete(id);
        if (generation !== this.generation || !this.squad.players().some((player) => player.id === id)) unsubscribe();
        else this.unsubscribers.set(id, unsubscribe);
      })
      .catch((error) => {
        this.opening.delete(id);
        console.error(error);
      });
  }
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
