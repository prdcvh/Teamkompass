import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SquadService } from '../player/squad.service';
import { ABSENCE_LOOKBACK_DAYS } from '../analysis/risk';
import { addDays, todayIso } from '../shared/dates';
import { type Absence, absenceFromDoc } from './absence';

/**
 * Aktuelle Abwesenheiten aller Spieler des Kaders in Echtzeit, damit Kaderliste, Aufstellung und Start den wirksamen
 * Status zeigen (eine laufende Abwesenheit überlagert den gespeicherten Status, SCRUM-164). Das einzige Abo dieser Daten
 * für die Übersichten (SCRUM-200): geladen werden nur Einträge, die noch laufen, unbefristet sind oder höchstens
 * {@link ABSENCE_LOOKBACK_DAYS} Tage zurück geendet haben (reicht für den heutigen Status und „Rückkehr nach Verletzung“);
 * die volle Historie lädt erst das Spielerprofil. Nur für den Trainer. Die Abos folgen dem Kader (neue
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

  /** Erster Fehler eines Abos (Berechtigung, Netz); die Kaderliste zeigt dann weiter den gespeicherten Status. */
  readonly error = signal<unknown>(null);
  /** Spieler, deren erste Antwort noch aussteht. */
  readonly waiting = computed(() => {
    if (!this.active() || this.error()) return 0;
    const byPlayer = this.byPlayer();
    return this.squad.players().filter((player) => !byPlayer.has(player.id)).length;
  });

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
    this.error.set(null);
    this.byPlayer.set(new Map());
  }

  /** Nach einem Fehler neu abonnieren. */
  retry(): void {
    this.stop();
    this.start();
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
      .watchRecentAbsences(
        id,
        addDays(todayIso(), -ABSENCE_LOOKBACK_DAYS),
        (docs) => {
          if (generation !== this.generation) return;
          this.byPlayer.update((map) => new Map(map).set(id, docs.map((entry) => absenceFromDoc(entry.id, entry.data))));
        },
        (error) => {
          if (generation !== this.generation) return;
          console.error(error);
          this.error.set(error);
        },
      )
      .then((unsubscribe) => {
        this.opening.delete(id);
        if (generation !== this.generation || !this.squad.players().some((player) => player.id === id)) unsubscribe();
        else this.unsubscribers.set(id, unsubscribe);
      })
      .catch((error) => {
        this.opening.delete(id);
        if (generation !== this.generation) return;
        console.error(error);
        this.error.set(error);
      });
  }
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
