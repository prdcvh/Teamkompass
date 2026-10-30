import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  KNOWLEDGE_TYPES,
  type KnowledgeDraft,
  type KnowledgeEntry,
  type KnowledgeErrors,
  type KnowledgeType,
  MAX_KNOWLEDGE_CATEGORY,
  MAX_KNOWLEDGE_DESCRIPTION,
  MAX_KNOWLEDGE_TITLE,
  MAX_KNOWLEDGE_URL,
  draftFromEntry,
  emptyKnowledgeDraft,
} from '../../core/knowledge/knowledge';
import { KnowledgeService } from '../../core/knowledge/knowledge.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Eintrag (Link oder Glossar-Begriff) anlegen oder ändern. */
@Component({
  selector: 'tk-knowledge-dialog',
  imports: [Dialog, Button],
  templateUrl: './entry-dialog.html',
  styleUrl: './entry-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KnowledgeDialog {
  private readonly knowledge = inject(KnowledgeService);

  readonly open = input(false);
  /** Zu bearbeitender Eintrag; leer = neuer Eintrag. */
  readonly entry = input<KnowledgeEntry | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<KnowledgeEntry>();

  protected readonly types = KNOWLEDGE_TYPES;
  protected readonly limits = { title: MAX_KNOWLEDGE_TITLE, description: MAX_KNOWLEDGE_DESCRIPTION, category: MAX_KNOWLEDGE_CATEGORY, url: MAX_KNOWLEDGE_URL };
  protected readonly categories = this.knowledge.categories;
  protected readonly draft = signal<KnowledgeDraft>(emptyKnowledgeDraft());
  protected readonly errors = signal<KnowledgeErrors>({});
  protected readonly editing = computed(() => this.entry() !== null);
  protected readonly isGlossary = computed(() => this.draft().type === 'glossary');
  protected readonly heading = computed(() => (this.editing() ? 'Eintrag bearbeiten' : 'Eintrag anlegen'));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const entry = this.entry();
      untracked(() => {
        this.draft.set(entry ? draftFromEntry(entry) : emptyKnowledgeDraft());
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<KnowledgeDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected setType(event: Event): void {
    this.patch({ type: this.value(event) as KnowledgeType });
    this.errors.set({});
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.knowledge.saveEntry(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const entry = this.entry();
    if (entry) this.deleteRequested.emit(entry);
  }
}
