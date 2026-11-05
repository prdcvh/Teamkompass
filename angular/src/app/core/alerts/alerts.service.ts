import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { SessionService } from '../auth/session.service';
import { SelfReportsApi } from '../firebase/self-reports.api';
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
 */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly session = inject(SessionService);
  private readonly team = inject(TeamService);
  private readonly squad = inject(SquadService);
  private readonly settings = inject(TeamSettingsService);
  private readonly api = inject(SelfReportsApi);

  readonly active = signal(false);
  readonly audience = computed<AlertAudience | null>(() => {
    const role = this.session.role();
    return role === 'trainer' || role === 'physio' ? role : null;
  });
  /** Befinden je Spieler (fehlt, solange nicht geladen oder nicht lesbar). */
  private readonly wellness = signal<ReadonlyMap<string, readonly WellnessEntry[]>>(new Map());
  private readonly failed = signal<ReadonlySet<string>>(new Set());
  private readonly waiting = signal<ReadonlySet<string>>(new Set());

  readonly ready = computed(() => {
    if (!this.active()) return false;
    const audience = this.audience();
    // Trainer: erst rechnen, wenn die Schalter da sind (sonst blitzen ausgeschaltete Regeln kurz auf); bei Ladefehler gilt der Standard.
    const base = audience === 'trainer' ? this.team.ready() && ['ready', 'error'].includes(this.settings.load()) : this.squad.load() === 'ready';
    return base && this.waiting().size === 0;
  });
  /** Befinden mindestens eines Spielers nicht lesbar (Hinweis in der Anzeige). */
  readonly incomplete = computed(() => this.failed().size > 0);

  readonly result = computed<AlertResult>(() => {
    const audience = this.audience();
    if (!audience || !this.ready()) return EMPTY;
    const wellness = this.wellness();
    const today = todayIso();
    if (audience === 'trainer') {
      const players: AlertPlayerData[] = this.team.data().map((entry) => ({ ...entry, wellness: wellness.get(entry.player.id) ?? null }));
      return evaluateAlerts(players, this.team.events(), this.settings.alertSwitches(), 'trainer', today);
    }
    const players: AlertPlayerData[] = this.squad.players().map((player) => ({ player, items: null, absences: [], measurements: [], wellness: wellness.get(player.id) ?? null }));
    return evaluateAlerts(players, [], DEFAULT_ALERT_SWITCHES, 'physio', today);
  });

  private readonly unsubscribers = new Map<string, () => void>();
  /** Abos, deren Start (Promise) noch läuft. */
  private readonly opening = new Set<string>();
  private generation = 0;
  private lastAudience: AlertAudience | null = null;

  constructor() {
    effect(() => {
      const ids = this.active() && this.audience() ? this.squad.players().map((player) => player.id) : [];
      untracked(() => this.reconcile(ids));
    });
    // Abmelden oder Rollenwechsel (anderes Team): nichts darf im Speicher bleiben.
    effect(() => {
      const audience = this.audience();
      untracked(() => {
        if (audience !== this.lastAudience) this.stop();
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
    this.active.set(false);
    this.wellness.set(new Map());
    this.failed.set(new Set());
    this.waiting.set(new Set());
  }

  private reconcile(ids: readonly string[]): void {
    const keep = new Set(ids);
    for (const [id, unsubscribe] of this.unsubscribers) {
      if (keep.has(id)) continue;
      unsubscribe();
      this.unsubscribers.delete(id);
      this.wellness.update((map) => without(map, id));
      this.failed.update((set) => withoutKey(set, id));
      this.waiting.update((set) => withoutKey(set, id));
    }
    const generation = this.generation;
    for (const id of ids) {
      if (this.unsubscribers.has(id) || this.opening.has(id)) continue;
      this.opening.add(id);
      this.waiting.update((set) => new Set(set).add(id));
      const since = addDays(todayIso(), -ALERT_WELLNESS_DAYS);
      const done = () => this.waiting.update((set) => withoutKey(set, id));
      this.api
        .watchSelfReports(
          id,
          'wellness',
          (docs) => {
            if (generation !== this.generation) return;
            this.wellness.update((map) => new Map(map).set(id, docs.map((entry) => wellnessFromDoc(entry.id, entry.data))));
            this.failed.update((set) => withoutKey(set, id));
            done();
          },
          (error) => {
            if (generation !== this.generation) return;
            console.warn('Befinden für die Hinweise nicht lesbar', error);
            this.wellness.update((map) => without(map, id));
            this.failed.update((set) => new Set(set).add(id));
            done();
          },
          since,
        )
        .then((unsubscribe) => {
          if (generation === this.generation) this.opening.delete(id);
          if (generation !== this.generation || !keepNow(this.squad.players(), id)) {
            unsubscribe();
            if (generation === this.generation) {
              this.wellness.update((map) => without(map, id));
              done();
            }
          } else this.unsubscribers.set(id, unsubscribe);
        })
        .catch((error) => {
          if (generation !== this.generation) return;
          this.opening.delete(id);
          console.warn('Befinden für die Hinweise nicht lesbar', error);
          this.failed.update((set) => new Set(set).add(id));
          done();
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
