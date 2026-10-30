import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { ScoutApi } from '../firebase/scout.api';
import { SyncService } from '../shell/sync.service';
import { type ScoutView, scoutViewFromDocs } from './scout-profile';

export type ScoutLoad = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY: ScoutView = { players: [], items: new Map() };

/**
 * Daten der Scout-Ansicht (SCRUM-170): ausschließlich die bereinigte Scout-Sicht (scoutProfiles). Scouts lesen weder
 * Spieler- noch Event- oder Bewertungsdokumente. Beim Abmelden (oder Rollenwechsel) wird alles sofort verworfen.
 */
@Injectable({ providedIn: 'root' })
export class ScoutViewService {
  private readonly scoutApi = inject(ScoutApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  readonly view = signal<ScoutView>(EMPTY);
  readonly load = signal<ScoutLoad>('idle');
  readonly error = signal('');
  readonly players = computed(() => [...this.view().players].sort((a, b) => a.number - b.number || a.name.localeCompare(b.name, 'de')));

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
    this.scoutApi
      .watchScoutProfiles(
        (docs, meta) => {
          if (generation !== this.generation) return;
          this.view.set(scoutViewFromDocs(docs));
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
    this.view.set(EMPTY);
    this.load.set('idle');
    this.error.set('');
  }

  retry(): void {
    this.stop();
    this.start();
  }

  private fail(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.view.set(EMPTY);
    this.error.set(`Die Scout-Ansicht konnte nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
    this.load.set('error');
    this.sync.fail('Laden fehlgeschlagen', 'load');
  }
}
