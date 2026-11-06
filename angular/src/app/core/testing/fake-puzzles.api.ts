import type { PendingDoc, PuzzlesApi } from '../firebase/puzzles.api';
import type { RawDoc, SnapshotMeta } from '../firebase/types';

type DocsListener = (docs: RawDoc[], meta: SnapshotMeta) => void;
type PendingListener = (docs: PendingDoc[], meta: SnapshotMeta) => void;

const LIVE: SnapshotMeta = { fromCache: false, hasPendingWrites: false };

/**
 * Ersatz für {@link PuzzlesApi} in Tests: Rätsel, Lösungen und Antworten im Speicher, Abos werden sofort bedient.
 * Wie die Regeln: eine Lösung bekommt ein Spieler nur, wenn seine Antwort existiert (`solutionReaders`).
 */
export class FakePuzzlesApi implements Pick<PuzzlesApi, keyof PuzzlesApi> {
  constructor(readonly calls: string[] = []) {}

  readonly puzzles = new Map<string, Record<string, unknown>>();
  readonly solutions = new Map<string, Record<string, unknown>>();
  /** Dokument-ID `{puzzleId}_{playerId}` → Antwort. */
  readonly answers = new Map<string, Record<string, unknown>>();
  watchError: unknown = null;
  saveError: unknown = null;
  /** Spieler, für den Lösungen abgefragt werden (wie die Regel: nur nach eigener Antwort). */
  solutionReader: string | null = null;

  private puzzleListeners = new Set<DocsListener>();
  private solutionListeners = new Set<DocsListener>();
  private allAnswerListeners = new Set<PendingListener>();
  private ownAnswerListeners = new Map<PendingListener, string>();

  async watchPuzzles(onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchPuzzles');
    return this.listen(this.puzzleListeners, onData, onError, () => this.docs(this.puzzles));
  }

  async watchSolutions(onData: DocsListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchPuzzleSolutions');
    return this.listen(this.solutionListeners, onData, onError, () => this.docs(this.solutions));
  }

  async watchAllAnswers(onData: PendingListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push('watchAllPuzzleAnswers');
    return this.listen(this.allAnswerListeners, onData, onError, () => this.answerDocs(null));
  }

  async watchOwnAnswers(playerId: string, onData: PendingListener, onError: (error: unknown) => void): Promise<() => void> {
    this.calls.push(`watchOwnPuzzleAnswers:${playerId}`);
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    this.ownAnswerListeners.set(onData, playerId);
    onData(this.answerDocs(playerId), LIVE);
    return () => this.ownAnswerListeners.delete(onData);
  }

  async getSolution(puzzleId: string): Promise<Readonly<Record<string, unknown>> | null> {
    this.calls.push(`getPuzzleSolution:${puzzleId}`);
    if (this.solutionReader !== null && !this.answers.has(`${puzzleId}_${this.solutionReader}`)) throw { code: 'permission-denied' };
    return this.solutions.get(puzzleId) ?? null;
  }

  async savePuzzle(id: string, puzzle: Readonly<Record<string, unknown>>, solution: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePuzzle:${id}`);
    if (this.saveError) throw this.saveError;
    this.puzzles.set(id, { ...puzzle });
    this.solutions.set(id, { ...solution });
    this.emit();
  }

  async deletePuzzle(id: string, answerIds: readonly string[]): Promise<void> {
    this.calls.push(`deletePuzzle:${id}:${answerIds.join(',')}`);
    if (this.saveError) throw this.saveError;
    answerIds.forEach((answer) => this.answers.delete(answer));
    this.puzzles.delete(id);
    this.solutions.delete(id);
    this.emit();
  }

  async saveAnswer(id: string, data: Readonly<Record<string, unknown>>): Promise<void> {
    this.calls.push(`savePuzzleAnswer:${id}:${String(data['choice'])}`);
    if (this.saveError) throw this.saveError;
    if (this.answers.has(id)) throw { code: 'permission-denied' }; // Regeln: keine zweite Antwort
    this.answers.set(id, { ...data, answeredAt: Date.now() });
    this.emit();
  }

  emit(): void {
    this.puzzleListeners.forEach((listener) => listener(this.docs(this.puzzles), LIVE));
    this.solutionListeners.forEach((listener) => listener(this.docs(this.solutions), LIVE));
    this.allAnswerListeners.forEach((listener) => listener(this.answerDocs(null), LIVE));
    this.ownAnswerListeners.forEach((playerId, listener) => listener(this.answerDocs(playerId), LIVE));
  }

  private listen<T>(set: Set<(docs: T[], meta: SnapshotMeta) => void>, onData: (docs: T[], meta: SnapshotMeta) => void, onError: (error: unknown) => void, docs: () => T[]): () => void {
    if (this.watchError) {
      onError(this.watchError);
      return () => undefined;
    }
    set.add(onData);
    onData(docs(), LIVE);
    return () => set.delete(onData);
  }

  private docs(map: Map<string, Record<string, unknown>>): RawDoc[] {
    return [...map].map(([id, data]) => ({ id, data }));
  }

  private answerDocs(playerId: string | null): PendingDoc[] {
    return [...this.answers].filter(([, data]) => playerId === null || data['playerId'] === playerId).map(([id, data]) => ({ id, data, pending: false }));
  }
}
