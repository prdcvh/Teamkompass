import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { type PendingDoc, PuzzlesApi } from '../firebase/puzzles.api';
import type { RawDoc } from '../firebase/types';
import { SyncService } from '../shell/sync.service';
import {
  type Puzzle,
  type PuzzleAnswer,
  type PuzzleDraft,
  type PuzzleErrors,
  type PuzzleSolution,
  answerFromDoc,
  answerId,
  docFromPuzzle,
  docFromSolution,
  hasPuzzleErrors,
  puzzleFromDraft,
  puzzlesFromDocs,
  ratingHistory,
  solutionFromDoc,
  teamInsights,
  validatePuzzleDraft,
} from './puzzle';

/** `denied`: die Regeln lehnen ab (Rätsel-Regeln noch nicht veröffentlicht oder Rolle ohne Zugriff). */
export type PuzzleLoad = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

/** Eigene Antwort mit Stand: `pending` = noch nicht vom Server bestätigt. */
export interface OwnAnswer extends PuzzleAnswer {
  readonly pending: boolean;
}

/**
 * Situationsrätsel (SCRUM-193): lädt Rätsel, Antworten und Lösungen passend zur Rolle.
 * - Trainer: alle Rätsel, alle Lösungen und alle Antworten des Teams; legt Rätsel an, ändert und löscht sie.
 * - Spieler: alle Rätsel, nur die eigenen Antworten und die Lösungen der beantworteten Rätsel; beantwortet Rätsel.
 * - Eltern: wie Spieler, aber nur lesen (das Kind beantwortet die Rätsel mit seinem eigenen Zugang).
 * - Medizin und Scout: nichts.
 * Die Wertung wird immer aus den Antworten berechnet, nie gespeichert.
 */
@Injectable({ providedIn: 'root' })
export class PuzzleService {
  private readonly api = inject(PuzzlesApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly puzzleDocs = signal<readonly RawDoc[]>([]);
  private readonly answerDocs = signal<readonly PendingDoc[]>([]);
  private readonly solutionMap = signal<ReadonlyMap<string, PuzzleSolution>>(new Map());
  private readonly puzzlesLoaded = signal(false);
  private readonly answersLoaded = signal(false);
  private readonly solutionsLoaded = signal(false);
  private readonly failure = signal<'denied' | 'error' | null>(null);
  private readonly started = signal(false);
  /** Rätsel-ID der Antwort, die gerade gespeichert wird. */
  readonly saving = signal<string | null>(null);
  readonly answerError = signal<string | null>(null);

  readonly canEdit = computed(() => this.session.role() === 'trainer');
  readonly canAnswer = computed(() => this.session.role() === 'player' && !!this.session.playerId());
  readonly puzzles = computed<readonly Puzzle[]>(() => puzzlesFromDocs(this.puzzleDocs()));
  readonly puzzleMap = computed<ReadonlyMap<string, Puzzle>>(() => new Map(this.puzzles().map((puzzle) => [puzzle.id, puzzle])));
  readonly solutions = this.solutionMap.asReadonly();
  readonly answers = computed<readonly OwnAnswer[]>(() => {
    const now = Date.now();
    return this.answerDocs()
      .map((entry) => {
        const answer = answerFromDoc(entry.data, now);
        return answer ? { ...answer, pending: entry.pending } : null;
      })
      .filter((answer): answer is OwnAnswer => answer !== null);
  });
  readonly load = computed<PuzzleLoad>(() => {
    if (!this.started()) return 'idle';
    const failure = this.failure();
    if (failure) return failure;
    return this.puzzlesLoaded() && this.answersLoaded() && this.solutionsLoaded() ? 'ready' : 'loading';
  });

  /** Trainer: Auswertung je Rätsel, noch nicht verstandene Situationen zuerst. */
  readonly insights = computed(() => teamInsights(this.puzzles(), this.solutionMap(), this.answers()));

  private scope: string | null = null;
  private unsubscribers: (() => void)[] = [];
  private generation = 0;
  /** Spieler: Lösungen, die schon abgefragt werden oder wurden. */
  private requested = new Set<string>();

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    const role = this.session.role();
    const scope = role === 'trainer' ? 'all' : role === 'player' || role === 'parent' ? this.session.playerId() : null;
    if (!scope) return;
    if (this.scope === scope && this.load() !== 'error') return;
    this.stop();
    this.scope = scope;
    const generation = ++this.generation;
    this.started.set(true);
    this.subscribe(generation, this.api.watchPuzzles((docs, meta) => {
      if (generation !== this.generation) return;
      this.puzzleDocs.set(docs);
      this.puzzlesLoaded.set(true);
      this.sync.applySnapshot(meta);
    }, (error) => this.fail(generation, error)));
    if (scope === 'all') {
      this.subscribe(generation, this.api.watchSolutions((docs) => {
        if (generation !== this.generation) return;
        const map = new Map<string, PuzzleSolution>();
        for (const entry of docs) {
          const solution = solutionFromDoc(entry.data);
          if (solution) map.set(entry.id, solution);
        }
        this.solutionMap.set(map);
        this.solutionsLoaded.set(true);
      }, (error) => this.fail(generation, error)));
      this.subscribe(generation, this.api.watchAllAnswers((docs) => {
        if (generation !== this.generation) return;
        this.answerDocs.set(docs);
        this.answersLoaded.set(true);
      }, (error) => this.fail(generation, error)));
    } else {
      // Lösungen kommen einzeln nach jeder (vom Server bestätigten) eigenen Antwort.
      this.solutionsLoaded.set(true);
      this.subscribe(generation, this.api.watchOwnAnswers(scope, (docs) => {
        if (generation !== this.generation) return;
        this.answerDocs.set(docs.filter((entry) => entry.data['playerId'] === scope));
        this.answersLoaded.set(true);
        this.fetchSolutions(generation);
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
    this.requested = new Set();
    this.puzzleDocs.set([]);
    this.answerDocs.set([]);
    this.solutionMap.set(new Map());
    this.puzzlesLoaded.set(false);
    this.answersLoaded.set(false);
    this.solutionsLoaded.set(false);
    this.failure.set(null);
    this.started.set(false);
    this.saving.set(null);
    this.answerError.set(null);
  }

  answersOf(playerId: string): OwnAnswer[] {
    return this.answers().filter((answer) => answer.playerId === playerId);
  }

  answerFor(playerId: string, puzzleId: string): OwnAnswer | null {
    return this.answers().find((answer) => answer.playerId === playerId && answer.puzzleId === puzzleId) ?? null;
  }

  /** Wertung eines Spielers mit allen Schritten (nur aus geladenen Antworten und Lösungen). */
  historyOf(playerId: string) {
    return ratingHistory(this.answersOf(playerId), this.puzzleMap(), this.solutionMap());
  }

  /** Trainer: Rätsel samt Lösung prüfen und speichern. Rückgabe: Fehler; leer = gespeichert (bzw. unterwegs). */
  savePuzzle(draft: PuzzleDraft): PuzzleErrors {
    if (!this.canEdit() || this.load() !== 'ready') return { title: 'Die Rätsel sind noch nicht geladen. Bitte kurz warten und erneut speichern.' };
    const errors = validatePuzzleDraft(draft);
    if (hasPuzzleErrors(errors)) return errors;
    const id = draft.id ?? `r${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const { puzzle, solution } = puzzleFromDraft(draft, id);
    this.run(this.api.savePuzzle(id, docFromPuzzle(puzzle), docFromSolution(solution)), 'Das Rätsel konnte nicht gespeichert werden.');
    return {};
  }

  /** Trainer: Rätsel mit Lösung und allen Antworten darauf löschen. */
  deletePuzzle(id: string): boolean {
    if (!this.canEdit() || this.load() !== 'ready' || !this.puzzleMap().has(id)) return false;
    const answerIds = this.answers().filter((answer) => answer.puzzleId === id).map((answer) => answerId(id, answer.playerId));
    this.run(this.api.deletePuzzle(id, answerIds), 'Das Rätsel konnte nicht gelöscht werden.');
    return true;
  }

  /** Spieler: Rätsel beantworten (einmal je Rätsel). Danach wird sofort die Lösung mit Erklärung geladen. */
  answer(puzzleId: string, choice: number): boolean {
    const playerId = this.session.playerId();
    const puzzle = this.puzzleMap().get(puzzleId);
    if (!this.canAnswer() || !playerId || this.load() !== 'ready' || !puzzle || this.saving() !== null) return false;
    if (!Number.isInteger(choice) || choice < 0 || choice >= puzzle.answers.length || this.answerFor(playerId, puzzleId)) return false;
    const generation = this.generation;
    this.saving.set(puzzleId);
    this.answerError.set(null);
    void this.api.saveAnswer(answerId(puzzleId, playerId), { puzzleId, playerId, choice, by: 'player' }).then(
      () => {
        if (generation !== this.generation) return;
        this.saving.set(null);
        this.fetchSolution(generation, puzzleId);
      },
      (error) => {
        if (generation !== this.generation) return;
        console.error(error);
        this.saving.set(null);
        this.answerError.set(`Die Antwort konnte nicht gespeichert werden. ${authErrorMessage(errorCode(error))}`);
      },
    );
    return true;
  }

  private fetchSolutions(generation: number): void {
    for (const answer of this.answers()) if (!answer.pending) this.fetchSolution(generation, answer.puzzleId);
  }

  private fetchSolution(generation: number, puzzleId: string): void {
    if (this.requested.has(puzzleId)) return;
    this.requested.add(puzzleId);
    void this.api.getSolution(puzzleId).then(
      (data) => {
        if (generation !== this.generation) return;
        const solution = solutionFromDoc(data);
        if (solution) this.solutionMap.update((map) => new Map(map).set(puzzleId, solution));
      },
      (error) => {
        if (generation !== this.generation) return;
        console.error(error);
        // Beim nächsten Stand der Antworten erneut versuchen.
        this.requested.delete(puzzleId);
      },
    );
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
