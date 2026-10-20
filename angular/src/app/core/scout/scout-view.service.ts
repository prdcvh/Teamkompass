import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { EventsService } from '../events/events.service';
import { ScoutProfilesApi } from '../firebase/scout-profiles.api';
import type { Rating } from '../ratings/rating';
import { SyncService } from '../shell/sync.service';
import { type ScoutPlayer, scoutPlayerFromDoc, scoutRatingsFromDoc } from './scout-profile';

export type ScoutLoad = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Scout-Seite (SCRUM-170): liest ausschließlich die bereinigte Ansicht `scoutProfiles` und die Eventliste – nie
 * Spielerdokumente, Bewertungen, Abwesenheiten oder Messwerte (die Regeln verbieten es ohnehin). Beim Abmelden werden
 * Abo und Daten sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class ScoutViewService {
  private readonly api = inject(ScoutProfilesApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);
  private readonly eventsService = inject(EventsService);

  readonly players = signal<readonly ScoutPlayer[]>([]);
  readonly ratings = signal<ReadonlyMap<string, ReadonlyMap<string, Rating>>>(new Map());
  readonly load = signal<ScoutLoad>('idle');
  readonly error = signal('');
  readonly events = computed(() => this.eventsService.events());
  readonly ready = computed(() => this.load() === 'ready' && this.eventsService.load() === 'ready');

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() !== 'scout') this.stop();
    });
  }

  start(): void {
    if (this.session.role() !== 'scout' || this.unsubscribe || this.load() === 'loading') return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.error.set('');
    this.eventsService.start();
    this.api
      .watchScoutProfiles(
        (docs, meta) => {
          if (generation !== this.generation) return;
          this.players.set(docs.map((entry) => scoutPlayerFromDoc(entry.id, entry.data)));
          this.ratings.set(new Map(docs.map((entry) => [entry.id, scoutRatingsFromDoc(entry.data)])));
          this.load.set('ready');
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.players.set([]);
    this.ratings.set(new Map());
    this.load.set('idle');
    this.error.set('');
  }

  retry(): void {
    this.stop();
    this.start();
  }

  private fail(error: unknown): void {
    console.error(error);
    this.load.set('error');
    this.error.set(`Die Scout-Ansicht konnte nicht geladen werden. ${authErrorMessage(errorCode(error))}`);
    this.sync.fail('Laden fehlgeschlagen');
  }
}
