import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { LearningApi } from '../firebase/learning.api';
import type { RawDoc } from '../firebase/types';
import { todayIso } from '../shared/dates';
import { SyncService } from '../shell/sync.service';
import {
  type LearningPath,
  type PathDraft,
  type PathErrors,
  type PlayerProgress,
  docFromPath,
  hasErrors,
  pathFromDraft,
  pathView,
  pathsFromDocs,
  progressFromDoc,
  validatePathDraft,
} from './learning-path';

/**
 * - `denied`: die Regeln lehnen ab – z. B. weil die Lernpfad-Regeln (SCRUM-192) noch nicht veröffentlicht sind oder die
 *   Rolle keinen Zugriff hat (Medizin, Scout). Die Ansichten blenden die Lernpfade dann still aus bzw. zeigen einen Hinweis.
 */
export type LearningLoad = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

/**
 * Lernpfade (SCRUM-192): lädt Pfade und Fortschritt und schreibt (nur Trainer) Pfade und Bestätigungen.
 * - Trainer: alle Pfade und den Fortschritt aller Spieler.
 * - Spieler und Eltern: alle Pfade des Teams und ausschließlich den eigenen Fortschritt (die Regeln erlauben nichts anderes).
 * - Medizin und Scout: nichts (kein Zugriff).
 */
@Injectable({ providedIn: 'root' })
export class LearningService {
  private readonly api = inject(LearningApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly pathDocs = signal<readonly RawDoc[]>([]);
  private readonly progressDocs = signal<ReadonlyMap<string, PlayerProgress>>(new Map());
  private readonly pathsLoaded = signal(false);
  private readonly progressLoaded = signal(false);
  private readonly failure = signal<'denied' | 'error' | null>(null);
  private readonly started = signal(false);

  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly paths = computed<readonly LearningPath[]>(() => pathsFromDocs(this.pathDocs()));
  readonly progress = this.progressDocs.asReadonly();
  readonly load = computed<LearningLoad>(() => {
    if (!this.started()) return 'idle';
    const failure = this.failure();
    if (failure) return failure;
    return this.pathsLoaded() && this.progressLoaded() ? 'ready' : 'loading';
  });

  /** Für wen gerade geladen wird: 'all' (Trainer) oder die eigene Spieler-ID. */
  private scope: string | null = null;
  private unsubscribers: (() => void)[] = [];
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  /** Startet das Laden passend zur Rolle; Spieler/Eltern nur mit eigener Spieler-ID. */
  start(): void {
    const role = this.session.role();
    const scope = role === 'trainer' ? 'all' : role === 'player' || role === 'parent' ? this.session.playerId() : null;
    if (!scope) return;
    if (this.scope === scope && this.load() !== 'error') return;
    this.stop();
    this.scope = scope;
    const generation = ++this.generation;
    this.started.set(true);
    this.subscribe(generation, this.api.watchPaths((docs, meta) => {
      if (generation !== this.generation) return;
      this.pathDocs.set(docs);
      this.pathsLoaded.set(true);
      this.sync.applySnapshot(meta);
    }, (error) => this.fail(generation, error)));
    if (scope === 'all') {
      this.subscribe(generation, this.api.watchAllProgress((docs) => {
        if (generation !== this.generation) return;
        this.progressDocs.set(new Map(docs.map((entry) => [entry.id, progressFromDoc(entry.data)])));
        this.progressLoaded.set(true);
      }, (error) => this.fail(generation, error)));
    } else {
      this.subscribe(generation, this.api.watchProgress(scope, (data) => {
        if (generation !== this.generation) return;
        this.progressDocs.set(new Map([[scope, progressFromDoc(data)]]));
        this.progressLoaded.set(true);
      }, (error) => this.fail(generation, error)));
    }
  }

  retry(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.scope = null;
    this.pathDocs.set([]);
    this.progressDocs.set(new Map());
    this.pathsLoaded.set(false);
    this.progressLoaded.set(false);
    this.failure.set(null);
    this.started.set(false);
  }

  progressOf(playerId: string): PlayerProgress {
    return this.progressDocs().get(playerId) ?? {};
  }

  /** Prüft und speichert einen Pfad. Rückgabe: Fehler der Prüfung; leer = gespeichert (bzw. unterwegs). */
  savePath(draft: PathDraft): PathErrors {
    if (!this.canWrite() || this.load() !== 'ready') return { title: 'Die Lernpfade sind noch nicht geladen. Bitte kurz warten und erneut speichern.' };
    const errors = validatePathDraft(draft);
    if (hasErrors(errors)) return errors;
    const path = pathFromDraft(draft, draft.id ?? `p${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
    this.run(this.api.savePath(path.id, docFromPath(path)), 'Der Lernpfad konnte nicht gespeichert werden.');
    return {};
  }

  /** Löscht den Pfad samt aller Bestätigungen darin. */
  deletePath(id: string): boolean {
    if (!this.canWrite() || this.load() !== 'ready' || !this.paths().some((path) => path.id === id)) return false;
    const affected = [...this.progressDocs()].filter(([, progress]) => progress[id] !== undefined).map(([playerId]) => playerId);
    this.run(this.api.deletePath(id, affected), 'Der Lernpfad konnte nicht gelöscht werden.');
    return true;
  }

  /** Bestätigt die nächste offene Stufe des Spielers in diesem Pfad. */
  confirmNext(playerId: string, pathId: string, today: string = todayIso()): boolean {
    const path = this.writablePath(pathId);
    const next = path ? pathView(path, this.progressOf(playerId)).next : null;
    if (!path || !next) return false;
    this.run(this.api.setLevel(playerId, pathId, next.level.id, today), 'Die Stufe konnte nicht bestätigt werden.');
    return true;
  }

  /** Nimmt die zuletzt bestätigte Stufe zurück (z. B. versehentlich bestätigt). */
  undoLast(playerId: string, pathId: string): boolean {
    const path = this.writablePath(pathId);
    const last = path ? pathView(path, this.progressOf(playerId)).lastDone : null;
    if (!path || !last) return false;
    this.run(this.api.setLevel(playerId, pathId, last.level.id, null), 'Die Bestätigung konnte nicht zurückgenommen werden.');
    return true;
  }

  private writablePath(pathId: string): LearningPath | null {
    if (!this.canWrite() || this.load() !== 'ready') return null;
    return this.paths().find((path) => path.id === pathId) ?? null;
  }

  private subscribe(generation: number, subscription: Promise<() => void>): void {
    subscription
      .then((unsubscribe) => {
        if (generation === this.generation && this.failure() === null) this.unsubscribers.push(unsubscribe);
        else unsubscribe();
      })
      .catch((error) => this.fail(generation, error));
  }

  private fail(generation: number, error: unknown): void {
    if (generation !== this.generation) return;
    console.error(error);
    this.failure.set(errorCode(error) === 'permission-denied' ? 'denied' : 'error');
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  private run(write: Promise<void>, failure: string): void {
    if (!this.sync.isFailed()) this.sync.state.set('syncing');
    void write.then(
      () => this.sync.clearError(),
      (error) => {
        console.error(error);
        this.sync.fail(`${failure} ${authErrorMessage(errorCode(error))}`);
      },
    );
  }
}
