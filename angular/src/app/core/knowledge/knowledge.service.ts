import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { authErrorMessage, errorCode } from '../auth/auth-errors';
import { SessionService } from '../auth/session.service';
import { KnowledgeApi } from '../firebase/knowledge.api';
import { SyncService } from '../shell/sync.service';
import { type KnowledgeDraft, type KnowledgeEntry, type KnowledgeErrors, categoriesOf, docFromEntry, entriesFromDoc, entryFromDraft, validateKnowledgeDraft } from './knowledge';

/**
 * Wissen (SCRUM-106): Einträge lesen, anlegen, ändern und löschen. Lesen und Schreiben darf nur der Trainer (das Dokument
 * `meta/settings` ist in den Regeln nur für Trainer offen). Beim Abmelden werden Abo und Daten verworfen.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeService {
  private readonly api = inject(KnowledgeApi);
  private readonly session = inject(SessionService);
  private readonly sync = inject(SyncService);

  private readonly stored = signal<Readonly<Record<string, unknown>> | null>(null);
  readonly load = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly canWrite = computed(() => this.session.role() === 'trainer');
  readonly entries = computed<readonly KnowledgeEntry[]>(() => entriesFromDoc(this.stored()));
  readonly categories = computed(() => categoriesOf(this.entries()));

  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      if (this.session.role() === null) this.stop();
    });
  }

  start(): void {
    if (this.unsubscribe || this.load() === 'loading' || !this.canWrite()) return;
    const generation = ++this.generation;
    this.load.set('loading');
    this.api
      .watchKnowledge(
        (data, meta) => {
          if (generation !== this.generation) return;
          this.stored.set(data);
          this.load.set('ready');
          this.sync.applySnapshot(meta);
        },
        (error) => {
          if (generation === this.generation) this.failLoad(error);
        },
      )
      .then((unsubscribe) => {
        if (generation !== this.generation || this.load() === 'error') unsubscribe();
        else this.unsubscribe = unsubscribe;
      })
      .catch((error) => {
        if (generation === this.generation) this.failLoad(error);
      });
  }

  /** Nach einem Ladefehler erneut versuchen. */
  retry(): void {
    this.stop();
    this.start();
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stored.set(null);
    this.load.set('idle');
  }

  /** Prüft und speichert einen Eintrag (neu oder geändert). Gibt die Fehler der Prüfung zurück; leer = gespeichert. */
  saveEntry(draft: KnowledgeDraft): KnowledgeErrors {
    if (!this.canWrite() || this.load() !== 'ready') return { title: 'Das Wissen ist noch nicht geladen. Bitte kurz warten und erneut speichern.' };
    const errors = validateKnowledgeDraft(draft);
    if (Object.keys(errors).length > 0) return errors;
    const entry = entryFromDraft(draft, draft.id ?? `k${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`);
    this.run(this.api.saveEntry(entry.id, docFromEntry(entry)), 'Der Eintrag konnte nicht gespeichert werden.');
    return {};
  }

  /** Löscht einen Eintrag. Rückgabe: false, wenn nicht erlaubt oder nicht vorhanden. */
  deleteEntry(id: string): boolean {
    if (!this.canWrite() || this.load() !== 'ready' || !this.entries().some((entry) => entry.id === id)) return false;
    this.run(this.api.deleteEntry(id), 'Der Eintrag konnte nicht gelöscht werden.');
    return true;
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

  private failLoad(error: unknown): void {
    console.error(error);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.load.set('error');
  }
}
