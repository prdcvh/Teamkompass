import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  KNOWLEDGE_TYPES,
  type KnowledgeEntry,
  type KnowledgeFilter,
  type KnowledgeType,
  NO_FILTER,
  filterEntries,
  knowledgeTypeLabel,
  urlHost,
} from '../../core/knowledge/knowledge';
import { KnowledgeService } from '../../core/knowledge/knowledge.service';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { KnowledgeDialog } from './entry-dialog';

/** Wissen (nur Trainer): Links zu Videos, Playlists und Dokumenten sowie ein Glossar, mit Suche und Filter. */
@Component({
  selector: 'app-knowledge',
  imports: [Button, Card, Chip, Dialog, Icon, KnowledgeDialog],
  templateUrl: './knowledge.html',
  styleUrl: './knowledge.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Knowledge implements OnInit {
  protected readonly knowledge = inject(KnowledgeService);
  protected readonly sync = inject(SyncService);

  protected readonly types = KNOWLEDGE_TYPES;
  protected readonly typeLabel = knowledgeTypeLabel;
  protected readonly host = urlHost;

  protected readonly filter = signal<KnowledgeFilter>(NO_FILTER);
  protected readonly visible = computed(() => filterEntries(this.knowledge.entries(), this.filter()));
  protected readonly filtered = computed(() => {
    const { type, category, query } = this.filter();
    return type !== 'all' || category !== '' || query.trim() !== '';
  });

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<KnowledgeEntry | null>(null);
  protected readonly deleting = signal<KnowledgeEntry | null>(null);

  ngOnInit(): void {
    this.knowledge.start();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected setQuery(event: Event): void {
    this.filter.update((filter) => ({ ...filter, query: this.value(event) }));
  }

  protected setType(event: Event): void {
    this.filter.update((filter) => ({ ...filter, type: this.value(event) as KnowledgeType | 'all' }));
  }

  protected setCategory(event: Event): void {
    this.filter.update((filter) => ({ ...filter, category: this.value(event) }));
  }

  protected resetFilter(): void {
    this.filter.set(NO_FILTER);
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(entry: KnowledgeEntry): void {
    this.editing.set(entry);
    this.dialogOpen.set(true);
  }

  protected askDelete(entry: KnowledgeEntry): void {
    this.dialogOpen.set(false);
    this.deleting.set(entry);
  }

  protected confirmDelete(): void {
    const entry = this.deleting();
    if (entry) this.knowledge.deleteEntry(entry.id);
    this.deleting.set(null);
  }
}
