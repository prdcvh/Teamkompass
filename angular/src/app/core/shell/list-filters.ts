import { Injectable, signal } from '@angular/core';
import type { SortKey } from '../player/squad-list';
import type { EventSort, EventTypeFilter } from '../events/event';
import { type KnowledgeFilter, NO_FILTER } from '../knowledge/knowledge';

/**
 * Suche, Filter und Sortierung der Listenseiten (SCRUM-310). Die Seiten-Komponenten werden beim Verlassen der Seite
 * abgebaut; ihr Stand liegt deshalb hier, damit er nach „Zurück“ noch da ist, solange die App offen ist. Nichts davon
 * wird auf dem Gerät gespeichert; beim Abmelden und beim Teamwechsel wird alles zurückgesetzt ({@link reset}), damit
 * kein Filter eines anderen Kontos stehen bleibt.
 */
@Injectable({ providedIn: 'root' })
export class ListFilters {
  readonly squadQuery = signal('');
  readonly squadPosition = signal('all');
  readonly squadStatus = signal('all');
  readonly squadSort = signal<SortKey>('number');

  readonly eventsQuery = signal('');
  readonly eventsType = signal<EventTypeFilter>('all');
  readonly eventsSort = signal<EventSort>('chronological');

  readonly knowledge = signal<KnowledgeFilter>(NO_FILTER);

  readonly opponentsQuery = signal('');

  reset(): void {
    this.squadQuery.set('');
    this.squadPosition.set('all');
    this.squadStatus.set('all');
    this.squadSort.set('number');
    this.eventsQuery.set('');
    this.eventsType.set('all');
    this.eventsSort.set('chronological');
    this.knowledge.set(NO_FILTER);
    this.opponentsQuery.set('');
  }
}
