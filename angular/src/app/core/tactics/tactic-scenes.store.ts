import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import type { TeamEvent } from '../events/event';
import { type TacticSceneFilter, TacticScenesApi } from '../firebase/tactic-scenes.api';
import {
  type Decision,
  MAX_SCENE_BY,
  type TacticScene,
  type TacticSceneDraft,
  type TacticSceneErrors,
  docFromScene,
  executionFor,
  sceneFromDoc,
  sortScenes,
  validateScene,
} from './tactic-scene';

/**
 * Szenen der Taktikdiagnostik (SCRUM-267) für EINE Ansicht – alle Szenen eines Termins (Event-Seite) oder eines
 * Spielers (Profil). Bewusst nicht `providedIn: 'root'`: jede Komponente stellt ihre eigene Instanz bereit
 * (`providers: [TacticScenesStore]`), damit Event-Seite und Profil sich nicht gegenseitig das Abo umstellen.
 * Nur Trainer laden und schreiben (die Regeln sperren alle anderen Rollen).
 */
@Injectable()
export class TacticScenesStore {
  private readonly api = inject(TacticScenesApi);
  private readonly session = inject(SessionService);

  readonly visible = computed(() => this.session.role() === 'trainer');
  readonly scenes = signal<readonly TacticScene[]>([]);
  readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');
  private readonly filter = signal<TacticSceneFilter | null>(null);
  private readonly reviewer = computed(() => (this.session.displayName().trim() || this.session.email() || 'Trainer').slice(0, MAX_SCENE_BY));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  watch(filter: TacticSceneFilter): void {
    if (!this.visible() || !filter.value) {
      this.stop();
      return;
    }
    const current = this.filter();
    if (current && current.field === filter.field && current.value === filter.value && this.state() !== 'error') return;
    this.stop();
    const generation = ++this.generation;
    this.filter.set(filter);
    this.state.set('loading');
    this.api
      .watchScenes(
        filter,
        (docs) => {
          if (generation !== this.generation) return;
          this.scenes.set(sortScenes(docs.map((entry) => sceneFromDoc(entry.id, entry.data)).filter((entry): entry is TacticScene => entry !== null)));
          this.state.set('ready');
        },
        (error) => {
          if (generation === this.generation) this.fail(error);
        },
      )
      .then((unsubscribe) => {
        if (generation === this.generation) this.unsubscribe = unsubscribe;
        else unsubscribe();
      })
      .catch((error) => {
        if (generation === this.generation) this.fail(error);
      });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.filter.set(null);
    this.scenes.set([]);
    this.state.set('idle');
    this.error.set('');
  }

  retry(): void {
    const filter = this.filter();
    if (!filter) return;
    this.stop();
    this.watch(filter);
  }

  /** Neue Szene zu einem Termin speichern. Fehler je Feld; leer = gespeichert. */
  async add(draft: TacticSceneDraft, event: TeamEvent, playerIds: readonly string[]): Promise<TacticSceneErrors> {
    const uid = this.session.uid();
    if (!this.visible() || !uid) return { context: 'Nur Trainer dürfen Szenen erfassen.' };
    const errors = validateScene(draft, playerIds);
    if (Object.keys(errors).length > 0) return errors;
    const decision = draft.decision as Decision;
    const minute = draft.minute.trim();
    const scene: TacticScene = {
      id: `ts${crypto.randomUUID().replace(/-/g, '')}`,
      playerId: draft.playerId,
      eventId: event.id,
      eventDate: event.date,
      eventType: event.type,
      eventTitle: event.title.slice(0, 60),
      minute: minute ? Number(minute) : null,
      context: draft.context.trim(),
      decision,
      execution: executionFor(decision, draft.execution),
      situations: [...draft.situations],
      videoUrl: draft.videoUrl.trim(),
      by: this.reviewer(),
      byUid: uid,
      createdAt: new Date().toISOString(),
    };
    try {
      await this.api.saveScene(scene.id, docFromScene(scene));
      return {};
    } catch (error) {
      console.error(error);
      return { context: `Die Szene konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error), this.session.role())}` };
    }
  }

  async remove(scene: TacticScene): Promise<boolean> {
    if (!this.visible()) return false;
    try {
      await this.api.deleteScene(scene.id);
      return true;
    } catch (error) {
      console.error(error);
      this.error.set(`Die Szene konnte nicht gelöscht werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
      return false;
    }
  }

  private fail(error: unknown): void {
    console.error(error);
    this.state.set('error');
    this.error.set(`Die Szenen der Taktikdiagnostik konnten nicht geladen werden. ${authErrorMessage(errorCode(error), this.session.role())}`);
  }
}
