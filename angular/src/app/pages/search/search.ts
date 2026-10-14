import { ChangeDetectionStrategy, Component, ElementRef, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsService } from '../../core/events/events.service';
import { OpponentsService } from '../../core/opponents/opponents.service';
import { type SearchHit, searchTeam } from '../../core/shell/search';
import { SessionService } from '../../core/auth/session.service';
import { SquadService } from '../../core/player/squad.service';
import { Card } from '../../ui/card/card';

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  view: 'Bereiche',
  player: 'Spieler',
  event: 'Events',
  opponent: 'Gegner',
};

/** Globale Suche über bereits geladene Daten: Bereiche, Spieler, Events und Gegner (nur Trainer). */
@Component({
  selector: 'app-search',
  imports: [Card, RouterLink],
  templateUrl: './search.html',
  styleUrl: './search.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Search implements OnInit {
  private readonly squad = inject(SquadService);
  private readonly events = inject(EventsService);
  private readonly opponents = inject(OpponentsService);
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly query = signal('');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');
  protected readonly loading = computed(
    () => this.squad.load() !== 'ready' || this.events.load() !== 'ready' || this.opponents.load() !== 'ready',
  );

  protected readonly hits = computed(() =>
    searchTeam({ players: this.squad.players(), events: this.events.events(), opponents: this.opponents.opponents() }, this.query()),
  );

  /** Treffer nach Art gruppiert, in der Reihenfolge Bereiche → Spieler → Events → Gegner. */
  protected readonly groups = computed(() =>
    (Object.keys(KIND_LABEL) as SearchHit['kind'][])
      .map((kind) => ({ kind, title: KIND_LABEL[kind], hits: this.hits().filter((hit) => hit.kind === kind) }))
      .filter((group) => group.hits.length > 0),
  );

  constructor() {
    // Die Seite wird zum Suchen geöffnet (auch per Strg/⌘ + K): der Cursor steht direkt im Feld.
    afterNextRender(() => this.field()?.nativeElement.focus());
  }

  ngOnInit(): void {
    this.squad.start();
    this.events.start();
    this.opponents.start();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
