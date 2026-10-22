import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { EventsService } from '../events/events.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { PlayerStatsApi } from '../firebase/player-stats.api';
import { RatingsApi } from '../firebase/ratings.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';
import { addDays, todayIso } from '../shared/dates';
import { type Rating, ratingFromDoc } from '../ratings/rating';
import { MEASUREMENT_WINDOW_DAYS } from '../analysis/risk';
import { type Measurement, measurementFromDoc } from '../records/measurement';
import { SquadAbsencesService } from '../records/squad-absences.service';
import { SessionService } from '../auth/session.service';
import { SquadService } from '../player/squad.service';
import { SyncService } from '../shell/sync.service';
import { type PlayerData, type RatingsByEvent, itemsFor } from './team';
import { ratingsFromDocs, ratingsFromPlayerStats } from './player-stats';
import { PlayerStatsMode } from './player-stats-mode';

/**
 * Daten für die Teamauswertung (Start-Dashboard): Bewertungen aller Spieler je Event sowie Abwesenheiten und
 * Messwerte je Spieler. Nur der Trainer darf all das lesen. Die Abos folgen Kader und Eventliste (neue
 * Spieler/Events werden abonniert, entfernte beendet); beim Abmelden werden Abos und Daten sofort verworfen.
 *
 * Abwesenheiten und Messwerte sind hier nur das Fenster, das die Übersichten brauchen (SCRUM-200): aktuelle
 * Abwesenheiten kommen vom {@link SquadAbsencesService} (ein gemeinsames Abo mit der Kaderliste), Messwerte der letzten
 * {@link MEASUREMENT_WINDOW_DAYS} Tage von hier. Die volle Historie liest das Spielerprofil bzw. der Export.
 *
 * Bewertungen (SCRUM-201): Sind die Zusammenfassungen je Spieler eingerichtet ({@link PlayerStatsMode}), reicht ein
 * Abo auf `playerStats` (ein Dokument je Spieler) statt eines Abos je Event mit allen Bewertungen. Daraus entsteht
 * dieselbe {@link RatingsByEvent}-Struktur (ohne Rückmeldungstexte), alle Kennzahlen rechnen unverändert. Sonst – noch
 * nicht eingerichtet, Regeln noch alt, Fehler – wird wie bisher je Event abonniert. Rückmeldungstexte (JSON-Sicherung)
 * liefert {@link fullRatings} bei Bedarf.
 */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly ratingsApi = inject(RatingsApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly squad = inject(SquadService);
  private readonly eventsService = inject(EventsService);
  private readonly squadAbsences = inject(SquadAbsencesService);
  private readonly statsApi = inject(PlayerStatsApi);
  private readonly statsMode = inject(PlayerStatsMode);

  readonly active = signal(false);
  readonly events = computed(() => this.eventsService.events());
  /** Bewertungen aller Spieler je Event (nur lesen; aus den Zusammenfassungen ohne Rückmeldungstext). */
  readonly ratingsByEvent = computed<RatingsByEvent>(() =>
    this.fromStats() ? ratingsFromPlayerStats(this.stats(), this.eventsService.events()) : this.ratings(),
  );
  private readonly ownError = signal('');
  readonly error = computed(() => this.ownError() || (this.active() && this.squadAbsences.error() ? this.message(this.squadAbsences.error()) : ''));
  private readonly ratings = signal<RatingsByEvent>(new Map());
  private readonly stats = signal<readonly RawDoc[]>([]);
  /** Bewertungen kommen aus den Zusammenfassungen (Abo `s:` aktiv). */
  private readonly fromStats = signal(false);
  private readonly measurements = signal<ReadonlyMap<string, readonly Measurement[]>>(new Map());
  /** Abos, auf deren erste Antwort noch gewartet wird. */
  private readonly waiting = signal(0);

  readonly loading = computed(
    () =>
      this.active() &&
      !this.error() &&
      (this.squad.load() !== 'ready' ||
        this.eventsService.load() !== 'ready' ||
        this.statsMode.state() === 'loading' ||
        this.waiting() > 0 ||
        this.squadAbsences.waiting() > 0),
  );
  readonly ready = computed(() => this.active() && !this.loading() && !this.error() && this.squad.load() === 'ready');
  /** Je Spieler: alle Events mit seiner Bewertung, Abwesenheiten, Messwerte. */
  readonly data = computed<PlayerData[]>(() =>
    this.squad.players().map((player) => ({
      player,
      items: itemsFor(player.id, this.eventsService.events(), this.ratingsByEvent()),
      absences: this.squadAbsences.byPlayer().get(player.id) ?? [],
      measurements: this.measurements().get(player.id) ?? [],
    })),
  );

  private unsubscribers = new Map<string, () => void>();
  private opening = new Set<string>();
  private pending = new Set<string>();
  private generation = 0;

  constructor() {
    effect(() => {
      const stats = this.statsMode.state();
      // Solange unklar ist, ob es Zusammenfassungen gibt, wird noch nichts abonniert (sonst unnötige Lesevorgänge).
      const ratingKeys = stats === 'on' ? ['s:'] : stats === 'loading' ? [] : this.eventsService.events().map((event) => `r:${event.id}`);
      const wanted = [
        ...ratingKeys,
        ...this.squad.players().flatMap((player) => [`m:${player.id}`]),
      ];
      if (this.active()) untracked(() => this.reconcile(wanted));
    });
    // Ohne Anmeldung (oder ohne Trainerrolle) dürfen keine Teamdaten im Speicher bleiben.
    effect(() => {
      if (this.session.role() !== 'trainer') this.stop();
    });
  }

  start(): void {
    if (this.active() || this.session.role() !== 'trainer') return;
    this.generation += 1;
    this.active.set(true);
    this.squad.start();
    this.eventsService.start();
    this.squadAbsences.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.opening.clear();
    this.pending.clear();
    this.active.set(false);
    this.ratings.set(new Map());
    this.stats.set([]);
    this.fromStats.set(false);
    this.measurements.set(new Map());
    this.waiting.set(0);
    this.ownError.set('');
  }

  retry(): void {
    this.stop();
    this.squadAbsences.retry();
    this.start();
  }

  private reconcile(wanted: readonly string[]): void {
    const keep = new Set(wanted);
    for (const [key, unsubscribe] of this.unsubscribers) {
      if (keep.has(key)) continue;
      unsubscribe();
      this.unsubscribers.delete(key);
      this.drop(key);
    }
    const generation = this.generation;
    for (const key of wanted) {
      if (this.unsubscribers.has(key) || this.opening.has(key)) continue;
      this.opening.add(key);
      this.pending.add(key);
      this.open(key, generation);
    }
    this.waiting.set(this.pending.size);
  }

  private drop(key: string): void {
    this.pending.delete(key);
    const id = key.slice(2);
    if (key === 's:') {
      this.stats.set([]);
      this.fromStats.set(false);
    } else if (key.startsWith('r:')) this.ratings.update((map) => without(map, id));
    else this.measurements.update((map) => without(map, id));
  }

  private open(key: string, generation: number): void {
    const id = key.slice(2);
    const today = todayIso();
    const since = addDays(today, -MEASUREMENT_WINDOW_DAYS);
    const onData = (docs: RawDoc[], meta: SnapshotMeta) => {
      if (generation !== this.generation) return;
      if (key === 's:') {
        this.stats.set(docs);
        this.fromStats.set(true);
      } else if (key.startsWith('r:')) {
        const byPlayer = new Map<string, Rating>(docs.map((entry) => [entry.id, ratingFromDoc(entry.data)]));
        this.ratings.update((map) => new Map(map).set(id, byPlayer));
      } else {
        this.measurements.update((map) => new Map(map).set(id, docs.map((entry) => measurementFromDoc(entry.id, entry.data, today))));
      }
      this.pending.delete(key);
      this.waiting.set(this.pending.size);
      this.sync.applySnapshot(meta);
    };
    const onError = (error: unknown) => {
      if (generation === this.generation) this.fail(error);
    };
    const subscribe =
      key === 's:'
        ? this.statsApi.watchPlayerStats(onData, onError)
        : key.startsWith('r:')
          ? this.ratingsApi.watchRatings(id, onData, onError)
          : this.playerRecordsApi.watchRecentMeasurements(id, since, onData, onError);
    subscribe
      .then((unsubscribe) => {
        this.opening.delete(key);
        if (generation !== this.generation || this.ownError()) unsubscribe();
        else this.unsubscribers.set(key, unsubscribe);
      })
      .catch((error) => {
        this.opening.delete(key);
        if (generation === this.generation) this.fail(error);
      });
  }

  /**
   * Alle Bewertungen der geladenen Events mit Rückmeldungstext (JSON-Sicherung). Mit Zusammenfassungen einmalig vom
   * Server gelesen, sonst die vorhandenen Abo-Daten.
   */
  async fullRatings(): Promise<RatingsByEvent> {
    if (!this.fromStats()) return this.ratings();
    return ratingsFromDocs(await this.statsApi.readAllRatings(this.eventsService.events().map((event) => event.id)));
  }

  private fail(error: unknown): void {
    console.error(error);
    this.ownError.set(this.message(error));
    this.sync.fail('Laden fehlgeschlagen');
  }

  private message(error: unknown): string {
    return `Die Teamauswertung konnte nicht geladen werden. ${authErrorMessage(errorCode(error))}`;
  }
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}
