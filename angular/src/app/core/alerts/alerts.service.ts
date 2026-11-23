import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { PlayerRecordsApi } from '../firebase/player-records.api';
import { SelfReportsApi } from '../firebase/self-reports.api';
import { type GrowthReview, growthReviewFromDoc } from '../records/growth-review';
import { SquadService } from '../player/squad.service';
import { type WellnessEntry, wellnessFromDoc } from '../self-report/self-report';
import { WELLNESS_BASELINE_DAYS, WELLNESS_CURRENT_DAYS } from '../self-report/self-report-hints';
import { addDays, todayIso } from '../shared/dates';
import { TeamSettingsService } from '../team-settings/team-settings.service';
import { TeamService } from '../team/team.service';
import { ALERT_LOG_DAYS, type AlertAudience, type AlertPlayerData, type AlertResult, DEFAULT_ALERT_SWITCHES, evaluateAlerts } from './alert-rules';

/** So weit zurück wird das Befinden geladen: Protokollfenster + jüngste Antwort + Normalwert davor. */
export const ALERT_WELLNESS_DAYS = ALERT_LOG_DAYS + WELLNESS_CURRENT_DAYS + WELLNESS_BASELINE_DAYS;

const EMPTY: AlertResult = { hints: [], log: [] };

/**
 * Hinweise der Wenn-dann-Regeln (SCRUM-195) für Trainer und Medizin. Nur diese beiden Rollen starten etwas; für
 * Spieler, Eltern und Scouts bleibt alles leer und es wird nichts abonniert.
 *
 * - Trainer: Teamauswertung (Bewertungen, Abwesenheiten, Messwerte, Belastung) aus dem {@link TeamService}, die
 *   Schalter aus den Teameinstellungen, dazu das Befinden aller Spieler (eigenes Abo je Spieler, nur die letzten
 *   {@link ALERT_WELLNESS_DAYS} Tage).
 * - Medizin: Kaderliste (ohne Spieler mit widerrufener Einwilligung, wie die Regeln es verlangen) und das Befinden.
 *   Bewertungen und Teameinstellungen darf Medizin nicht lesen: Sie bekommt nur die beiden Befindens-Regeln, immer
 *   eingeschaltet.
 * Ist das Befinden eines Spielers nicht lesbar, schweigen die Befindens-Regeln für ihn.
 * - Trainer zusätzlich: die Trainerprüfungen „Wachstum und Belastung“ (SCRUM-257) je Spieler, damit ein geprüfter
 *   Hinweis nicht wieder erscheint. Nicht lesbar = keine Prüfung bekannt (der Hinweis bleibt sichtbar).
 */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly session = inject(SessionService);
  private readonly team = inject(TeamService);
  private readonly squad = inject(SquadService);
  private readonly settings = inject(TeamSettingsService);
  private readonly api = inject(SelfReportsApi);
  private readonly recordsApi = inject(PlayerRecordsApi);

  readonly active = signal(false);
  readonly audience = computed<AlertAudience | null>(() => {
    const role = this.session.role();
    return role === 'trainer' || role === 'physio' ? role : null;
  });
  /** Befinden je Spieler (fehlt, solange nicht geladen oder nicht lesbar). */
  private readonly wellness = signal<ReadonlyMap<string, readonly WellnessEntry[]>>(new Map());
  private readonly failed = signal<ReadonlySet<string>>(new Set());
  /** Trainerprüfungen je Spieler (nur Trainer); ein Eintrag (auch leer) heißt: Antwort da oder nicht lesbar. */
  private readonly reviews = signal<ReadonlyMap<string, readonly GrowthReview[]>>(new Map());

  readonly ready = computed(() => {
    if (!this.active()) return false;
    const audience = this.audience();
    // Trainer: erst rechnen, wenn die Schalter da sind (sonst blitzen ausgeschaltete Regeln kurz auf); bei Ladefehler gilt der Standard.
    const base = audience === 'trainer' ? this.team.ready() && ['ready', 'error'].includes(this.settings.load()) : this.squad.load() === 'ready';
    // Jeder Spieler braucht eine erste Antwort (Befinden geladen oder nicht lesbar), sonst fehlen Hinweise kurz.
    const wellness = this.wellness();
    const failed = this.failed();
    const reviews = this.reviews();
    return (
      base &&
      this.squad.players().every((player) => (wellness.has(player.id) || failed.has(player.id)) && (audience !== 'trainer' || reviews.has(player.id)))
    );
  });
  /** Befinden mindestens eines Spielers nicht lesbar (Hinweis in der Anzeige). */
  readonly incomplete = computed(() => this.failed().size > 0);

  readonly result = computed<AlertResult>(() => {
    const audience = this.audience();
    if (!audience || !this.ready()) return EMPTY;
    const wellness = this.wellness();
    const today = todayIso();
    if (audience === 'trainer') {
      const reviews = this.reviews();
      const players: AlertPlayerData[] = this.team
        .data()
        .map((entry) => ({ ...entry, wellness: wellness.get(entry.player.id) ?? null, growthReviews: reviews.get(entry.player.id) ?? null }));
      return evaluateAlerts(players, this.team.events(), this.settings.alertSwitches(), 'trainer', today);
    }
    const players: AlertPlayerData[] = this.squad.players().map((player) => ({ player, items: null, absences: [], measurements: [], wellness: wellness.get(player.id) ?? null }));
    return evaluateAlerts(players, [], DEFAULT_ALERT_SWITCHES, 'physio', today);
  });

  private readonly unsubscribers = new Map<string, () => void>();
  /** Abos, deren Start (Promise) noch läuft. */
  private readonly opening = new Set<string>();
  private readonly reviewUnsubscribers = new Map<string, () => void>();
  private readonly reviewOpening = new Set<string>();
  private generation = 0;
  private lastAudience: AlertAudience | null = null;

  constructor() {
    effect(() => {
      const ids = this.active() && this.audience() ? this.squad.players().map((player) => player.id) : [];
      untracked(() => this.reconcile(ids));
    });
    effect(() => {
      const ids = this.active() && this.audience() === 'trainer' ? this.squad.players().map((player) => player.id) : [];
      untracked(() => this.reconcileReviews(ids));
    });
    // Abmelden oder Rollenwechsel (anderes Team): nichts darf im Speicher bleiben.
    effect(() => {
      const audience = this.audience();
      untracked(() => {
        if (audience !== this.lastAudience && (audience === null || this.lastAudience !== null)) this.stop();
        this.lastAudience = audience;
      });
    });
  }

  start(): void {
    const audience = this.audience();
    if (this.active() || !audience) return;
    this.generation += 1;
    this.active.set(true);
    if (audience === 'trainer') {
      this.team.start();
      this.settings.start();
    } else {
      this.squad.start();
    }
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();
    this.opening.clear();
    this.reviewUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.reviewUnsubscribers.clear();
    this.reviewOpening.clear();
    this.active.set(false);
    this.wellness.set(new Map());
    this.failed.set(new Set());
    this.reviews.set(new Map());
  }

  /** Trainerprüfungen je Spieler abonnieren (nur Trainer). Fehler: als „keine Prüfung bekannt“ behandeln. */
  private reconcileReviews(ids: readonly string[]): void {
    const keep = new Set(ids);
    for (const [id, unsubscribe] of this.reviewUnsubscribers) {
      if (keep.has(id)) continue;
      unsubscribe();
      this.reviewUnsubscribers.delete(id);
      this.reviews.update((map) => without(map, id));
    }
    const generation = this.generation;
    for (const playerId of ids) {
      if (this.reviewUnsubscribers.has(playerId) || this.reviewOpening.has(playerId)) continue;
      this.reviewOpening.add(playerId);
      const fail = (error: unknown) => {
        if (generation !== this.generation) return;
        console.warn('Prüfungen Wachstum und Belastung nicht lesbar', error);
        this.reviews.update((map) => new Map(map).set(playerId, []));
      };
      this.recordsApi
        .watchPlayerRecords(
          playerId,
          'growthReviews',
          (docs) => {
            if (generation !== this.generation) return;
            const list = docs.map((entry) => growthReviewFromDoc(entry.id, entry.data)).filter((entry): entry is GrowthReview => entry !== null);
            this.reviews.update((map) => new Map(map).set(playerId, list));
          },
          fail,
        )
        .then((unsubscribe) => {
          if (generation === this.generation) this.reviewOpening.delete(playerId);
          if (generation !== this.generation || !keepNow(this.squad.players(), playerId)) unsubscribe();
          else this.reviewUnsubscribers.set(playerId, unsubscribe);
        })
        .catch((error) => {
          if (generation === this.generation) this.reviewOpening.delete(playerId);
          fail(error);
        });
    }
  }

  private reconcile(ids: readonly string[]): void {
    const keep = new Set(ids);
    for (const [id, unsubscribe] of this.unsubscribers) {
      if (keep.has(id)) continue;
      unsubscribe();
      this.unsubscribers.delete(id);
      this.wellness.update((map) => without(map, id));
      this.failed.update((set) => withoutKey(set, id));
    }
    const generation = this.generation;
    for (const id of ids) {
      if (this.unsubscribers.has(id) || this.opening.has(id)) continue;
      this.opening.add(id);
      const since = addDays(todayIso(), -ALERT_WELLNESS_DAYS);
      this.api
        .watchSelfReports(
          id,
          'wellness',
          (docs) => {
            if (generation !== this.generation) return;
            this.wellness.update((map) => new Map(map).set(id, docs.map((entry) => wellnessFromDoc(entry.id, entry.data))));
            this.failed.update((set) => withoutKey(set, id));
          },
          (error) => {
            if (generation !== this.generation) return;
            console.warn('Befinden für die Hinweise nicht lesbar', error);
            this.wellness.update((map) => without(map, id));
            this.failed.update((set) => new Set(set).add(id));
          },
          since,
        )
        .then((unsubscribe) => {
          if (generation === this.generation) this.opening.delete(id);
          if (generation !== this.generation || !keepNow(this.squad.players(), id)) {
            unsubscribe();
            if (generation === this.generation) this.wellness.update((map) => without(map, id));
          } else this.unsubscribers.set(id, unsubscribe);
        })
        .catch((error) => {
          if (generation !== this.generation) return;
          this.opening.delete(id);
          console.warn('Befinden für die Hinweise nicht lesbar', error);
          this.failed.update((set) => new Set(set).add(id));
        });
    }
  }
}

const keepNow = (players: readonly { id: string }[], id: string) => players.some((player) => player.id === id);

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

function withoutKey(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(key);
  return next;
}
