import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import type { Role } from '../auth/role';
import { SessionService } from '../auth/session.service';
import type { TeamEvent } from '../events/event';
import { EventsService } from '../events/events.service';
import { RatingsApi } from '../firebase/ratings.api';
import { RsvpApi } from '../firebase/rsvp.api';
import type { RawDoc } from '../firebase/types';
import type { Player } from '../player/player';
import { SquadService } from '../player/squad.service';
import { docFromRating, ratingFromDoc } from '../ratings/rating';
import { AbsenceSyncService } from '../records/absence-sync.service';
import { todayIso } from '../shared/dates';
import { SyncService } from '../shell/sync.service';
import {
  type EventResponses,
  type RsvpAnswer,
  type RsvpResponse,
  RSVP_TRAINER_LOOKBACK_DAYS,
  buildRsvpResponse,
  responseFromDoc,
  responseKey,
  rsvpAbsenceRating,
  rsvpEventIds,
  upcomingRsvpEvents,
} from './rsvp';

type Mode = { readonly kind: 'trainer' } | { readonly kind: 'own'; readonly playerId: string; readonly role: Role };

/**
 * Zu- und Absagen (SCRUM-205, wie SCRUM-175 in der bisherigen App):
 * - Spieler/Eltern: liest die eigene Rückmeldung zu den nächsten Terminen und speichert Zu-/Absagen.
 * - Trainer: liest alle Rückmeldungen der kommenden Termine (und der letzten {@link RSVP_TRAINER_LOOKBACK_DAYS} Tage)
 *   und überträgt sie in die Bewertung: Absage → „Fehlt“, Zusage nach Absage → „Offen“ (nur unbearbeitete
 *   Bewertungen, Markierung `rsvpAbsence`). Spieler dürfen keine Bewertungen schreiben, deshalb macht das der
 *   Trainer-Client, sobald er offen ist – genau wie die bisherige App. Beide Apps rechnen gleich; schreiben beide
 *   gleichzeitig, kommt dasselbe heraus.
 * Medizin und Scouts lesen keine Rückmeldungen (die Regeln verbieten es; der Grund kann ein Gesundheitsdatum sein).
 */
@Injectable({ providedIn: 'root' })
export class RsvpService {
  private readonly api = inject(RsvpApi);
  private readonly ratingsApi = inject(RatingsApi);
  private readonly session = inject(SessionService);
  private readonly events = inject(EventsService);
  private readonly squad = inject(SquadService);
  private readonly absences = inject(AbsenceSyncService);
  private readonly sync = inject(SyncService);

  /** Rückmeldungen je Event-ID (nur Events, deren erste Antwort schon da ist). */
  readonly responses = signal<ReadonlyMap<string, EventResponses>>(new Map());
  /** Event, für das gerade eine Rückmeldung gespeichert wird. */
  readonly saving = signal<string | null>(null);
  readonly error = signal('');
  /** Termine, auf die Spieler/Eltern antworten können (heute und später, höchstens 10). */
  readonly upcoming = computed<readonly TeamEvent[]>(() => upcomingRsvpEvents(this.events.events(), this.today()));
  readonly canAnswer = computed(() => {
    const role = this.session.role();
    return (role === 'player' || role === 'parent') && !!this.session.playerId();
  });

  private readonly today = signal(todayIso());
  private mode: Mode | null = null;
  private listeners = new Map<string, () => void>();
  private generation = 0;
  /** Zuletzt in die Bewertung übertragene Rückmeldung je „eventId/playerId“ (nur Trainer). */
  private processed = new Map<string, string>();
  private running = false;
  private again = false;

  constructor() {
    effect(() => {
      const role = this.session.role();
      const playerId = this.session.playerId();
      const events = this.events.events();
      untracked(() => this.follow(role, playerId, events));
    });
    // Trainer: jede neue oder geänderte Rückmeldung in die Bewertung übertragen, sobald der Kader geladen ist.
    effect(() => {
      if (this.session.role() !== 'trainer') return;
      this.responses();
      this.squad.players();
      if (this.squad.load() !== 'ready') return;
      untracked(() => void this.reconcile());
    });
  }

  responsesFor(eventId: string): EventResponses | undefined {
    return this.responses().get(eventId);
  }

  /** Eigene Rückmeldung zu einem Termin (Spieler/Eltern). */
  own(eventId: string): RsvpResponse | null {
    const playerId = this.session.playerId();
    return playerId ? (this.responses().get(eventId)?.get(playerId) ?? null) : null;
  }

  /**
   * Speichert die Zu- oder Absage des eigenen Spielers. Nur Spieler und Eltern, nur für einen der angezeigten Termine.
   * Rückgabe: gespeichert?
   */
  async answer(eventId: string, status: RsvpAnswer, reason: string): Promise<boolean> {
    const playerId = this.session.playerId();
    const payload = buildRsvpResponse(playerId, status, reason, this.session.role());
    if (!payload || !playerId || !this.upcoming().some((event) => event.id === eventId) || this.saving()) return false;
    this.saving.set(eventId);
    this.error.set('');
    try {
      await this.api.saveResponse(eventId, playerId, payload);
      this.sync.clearError();
      return true;
    } catch (error) {
      console.error(error);
      this.error.set(`Rückmeldung konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    } finally {
      this.saving.set(null);
    }
  }

  /** Folgt Rolle und Eventliste: startet Abos für neue Termine und beendet sie für entfallene. */
  private follow(role: Role | null, playerId: string | null, events: readonly TeamEvent[]): void {
    this.today.set(todayIso());
    const mode: Mode | null =
      role === 'trainer' ? { kind: 'trainer' } : (role === 'player' || role === 'parent') && playerId ? { kind: 'own', playerId, role } : null;
    if (!sameMode(mode, this.mode)) {
      this.stop();
      this.mode = mode;
      // Nur starten, was noch gar nicht läuft (ein laufendes oder gerade geladenes Abo bleibt unangetastet).
      if (mode && this.events.load() === 'idle') this.events.start();
      if (mode?.kind === 'trainer' && this.squad.load() === 'idle') this.squad.start();
    }
    if (!mode) return;
    const ids =
      mode.kind === 'trainer'
        ? rsvpEventIds(events, this.today(), RSVP_TRAINER_LOOKBACK_DAYS)
        : upcomingRsvpEvents(events, this.today()).map((event) => event.id);
    this.syncListeners(mode, new Set(ids));
  }

  private syncListeners(mode: Mode, ids: ReadonlySet<string>): void {
    for (const [eventId, unsubscribe] of this.listeners) {
      if (ids.has(eventId)) continue;
      unsubscribe();
      this.listeners.delete(eventId);
      this.responses.update((map) => {
        const next = new Map(map);
        next.delete(eventId);
        return next;
      });
    }
    const generation = this.generation;
    for (const eventId of ids) {
      if (this.listeners.has(eventId)) continue;
      // Platzhalter, bis das Abo steht (verhindert doppelte Abos bei schnellen Änderungen der Eventliste).
      let active = true;
      let stopper: (() => void) | null = null;
      this.listeners.set(eventId, () => {
        active = false;
        stopper?.();
      });
      const onError = (error: unknown) => {
        if (generation !== this.generation || !active) return;
        console.error(error);
      };
      const opened =
        mode.kind === 'trainer'
          ? this.api.watchResponses(eventId, (docs) => active && generation === this.generation && this.setEvent(eventId, mapFromDocs(docs)), onError)
          : this.api.watchOwnResponse(
              eventId,
              mode.playerId,
              (data) => {
                if (!active || generation !== this.generation) return;
                const response = responseFromDoc(data);
                this.setEvent(eventId, new Map(response ? [[mode.playerId, response]] : []));
              },
              onError,
            );
      opened
        .then((unsubscribe) => {
          if (!active || generation !== this.generation) unsubscribe();
          else stopper = unsubscribe;
        })
        .catch(onError);
    }
  }

  private setEvent(eventId: string, responses: EventResponses): void {
    this.responses.update((map) => new Map(map).set(eventId, responses));
  }

  private stop(): void {
    this.generation += 1;
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
    this.responses.set(new Map());
    this.processed.clear();
    this.saving.set(null);
    this.error.set('');
    this.mode = null;
    this.again = false;
  }

  /**
   * Überträgt neue oder geänderte Rückmeldungen in die Bewertungen (nur Trainer). Je Spieler wird die Bewertung nur
   * gelesen, wenn sich seine Rückmeldung seit dem letzten Abgleich geändert hat. Läuft nie doppelt (öffentlich für Tests).
   */
  async reconcile(): Promise<number> {
    if (this.session.role() !== 'trainer') return 0;
    if (this.running) {
      this.again = true;
      return 0;
    }
    this.running = true;
    let changed = 0;
    try {
      do {
        this.again = false;
        const generation = this.generation;
        const players = this.squad.players();
        const events = this.events.events();
        for (const [eventId, responses] of this.responses()) {
          const event = events.find((entry) => entry.id === eventId);
          if (!event) continue;
          for (const player of players) {
            if (generation !== this.generation) return changed;
            changed += await this.reconcilePlayer(event, player, responses.get(player.id) ?? null);
          }
        }
      } while (this.again);
    } finally {
      this.running = false;
    }
    return changed;
  }

  private async reconcilePlayer(event: TeamEvent, player: Player, response: RsvpResponse | null): Promise<number> {
    const id = `${event.id}/${player.id}`;
    const key = responseKey(response);
    const before = this.processed.get(id);
    // Unverändert, oder es gab nie eine Rückmeldung: nichts zu lesen.
    if (before === key || (before === undefined && key === 'open')) return 0;
    try {
      const doc = await this.ratingsApi.readRatingDoc(event.id, player.id);
      const next = rsvpAbsenceRating(doc ? ratingFromDoc(doc) : null, response);
      if (next) {
        await this.ratingsApi.saveRating(event.id, player.id, docFromRating(next, { clearAuto: true }));
        // Nach einer Zusage greift die normale Abwesenheits-Automatik wieder (z. B. inzwischen verletzt gemeldet).
        if (next.attendance === 'open') await this.absences.reconcilePlayer(player, [event]);
      }
      this.processed.set(id, key);
      return next ? 1 : 0;
    } catch (error) {
      // Beim nächsten Abgleich erneut versuchen (der Eintrag in `processed` bleibt alt).
      console.error(error);
      this.sync.fail(`Rückmeldung konnte nicht in die Bewertung übernommen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return 0;
    }
  }
}

function sameMode(a: Mode | null, b: Mode | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'trainer' || (b.kind === 'own' && a.playerId === b.playerId && a.role === b.role);
}

function mapFromDocs(docs: readonly RawDoc[]): EventResponses {
  const map = new Map<string, RsvpResponse>();
  for (const entry of docs) {
    const response = responseFromDoc(entry.data);
    if (response) map.set(entry.id, response);
  }
  return map;
}
