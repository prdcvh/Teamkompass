import { Injectable, computed, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';
import type { TeamEvent } from '../events/event';
import { EventsService } from '../events/events.service';
import { RatingsApi } from '../firebase/ratings.api';
import { RsvpApi } from '../firebase/rsvp.api';
import { ProfileService } from '../profile/profile.service';
import { type Rating, docFromRating } from '../ratings/rating';
import { responseFromDoc } from '../rsvp/rsvp';
import { ratingWithoutReason } from './health-reasons';

/** Bewertung mit einem automatisch eingetragenen Grund in der Rückmeldung. */
export interface RatingReason {
  readonly event: TeamEvent;
  readonly note: string;
  /** Dieselbe Bewertung ohne Grund. */
  readonly cleaned: Rating;
}

/** Absage mit Grund. */
export interface ResponseReason {
  readonly event: TeamEvent;
  readonly reason: string;
}

/**
 * Gründe in Bewertungen und Absagen eines Spielers finden und – nur nach Rückfrage – entfernen (SCRUM-248, Teil der
 * Aufgabe „Gesundheitsdaten prüfen und löschen“ bei widerrufener Einwilligung). Nur Trainer. Die Bewertungen kommen aus
 * dem geladenen Profil; die Absagen werden je Termin einmal gelesen (der Trainer abonniert sonst nur die letzten Tage).
 * Entfernt wird nur der Grund: „Fehlt“ bzw. die Absage selbst bleiben stehen.
 */
@Injectable({ providedIn: 'root' })
export class HealthReasonsService {
  private readonly profile = inject(ProfileService);
  private readonly events = inject(EventsService);
  private readonly ratingsApi = inject(RatingsApi);
  private readonly rsvpApi = inject(RsvpApi);
  private readonly session = inject(SessionService);

  /** Spieler, für den die Absagen gelesen wurden bzw. werden. */
  private readonly playerId = signal<string | null>(null);
  readonly responseState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly responses = signal<readonly ResponseReason[]>([]);
  private generation = 0;

  /** Bewertungen des im Profil geladenen Spielers mit Grund in der Rückmeldung (neueste zuerst). */
  readonly ratings = computed<readonly RatingReason[]>(() => {
    if (this.profile.playerId() !== this.playerId()) return [];
    const list: RatingReason[] = [];
    for (const { event, rating } of this.profile.items()) {
      const cleaned = rating ? ratingWithoutReason(rating) : null;
      if (rating && cleaned) list.push({ event, note: rating.note, cleaned });
    }
    return list;
  });

  readonly ready = computed(() => !this.profile.loading() && this.responseState() !== 'loading' && this.responseState() !== 'idle');

  /** Liest die Absagen mit Grund des Spielers über alle Termine (einmal je Spieler; `force` liest neu). */
  async load(playerId: string, force = false): Promise<void> {
    if (this.session.role() !== 'trainer') return;
    if (!force && this.playerId() === playerId && this.responseState() !== 'error') return;
    const generation = ++this.generation;
    this.playerId.set(playerId);
    this.responses.set([]);
    this.responseState.set('loading');
    try {
      const events = await this.events.whenLoaded();
      const found = await Promise.all(
        events.map(async (event) => {
          const response = responseFromDoc(await this.rsvpApi.readResponse(event.id, playerId));
          return response?.status === 'no' && response.reason.trim() ? { event, reason: response.reason } : null;
        }),
      );
      if (generation !== this.generation) return;
      this.responses.set(found.filter((entry): entry is ResponseReason => entry !== null).sort((a, b) => b.event.date.localeCompare(a.event.date)));
      this.responseState.set('ready');
    } catch (error) {
      if (generation !== this.generation) return;
      console.error(error);
      this.responseState.set('error');
    }
  }

  /**
   * Entfernt alle gefundenen Gründe des Spielers: Rückmeldung in der Bewertung → „Fehlt“ bzw. „Abgesagt“, Absagegrund →
   * leer. Rückgabe: alles geklappt? Was schon entfernt ist, bleibt entfernt; ein erneuter Versuch macht den Rest.
   */
  async removeAll(playerId: string): Promise<boolean> {
    if (this.session.role() !== 'trainer' || this.playerId() !== playerId) return false;
    let ok = true;
    for (const { event, cleaned } of this.ratings()) {
      try {
        await this.ratingsApi.saveRating(event.id, playerId, docFromRating(cleaned));
      } catch (error) {
        console.error(error);
        ok = false;
      }
    }
    for (const { event } of this.responses()) {
      try {
        await this.rsvpApi.clearReason(event.id, playerId);
        this.responses.update((list) => list.filter((entry) => entry.event.id !== event.id));
      } catch (error) {
        console.error(error);
        ok = false;
      }
    }
    return ok;
  }
}
