import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LayoutService } from '../../core/shell/layout.service';
import { EventsService } from '../../core/events/events.service';
import { type Opponent, detailsOf, filterOpponents, formatDate, opponentRecord, recordText } from '../../core/opponents/opponent';
import { OpponentsService } from '../../core/opponents/opponents.service';
import { SessionService } from '../../core/auth/session.service';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { OpponentDialog } from './opponent-dialog';

/** Gegneranalyse: Gegnerprofile erfassen, ansehen, bearbeiten und löschen (nur Trainer). */
@Component({
  selector: 'app-opponents',
  imports: [Button, Card, Dialog, Icon, OpponentDialog],
  templateUrl: './opponents.html',
  styleUrl: './opponents.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Opponents implements OnInit {
  protected readonly opponents = inject(OpponentsService);
  protected readonly sync = inject(SyncService);
  private readonly eventsService = inject(EventsService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly query = signal('');
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Opponent | null>(null);
  protected readonly deleting = signal<Opponent | null>(null);
  protected readonly deleteFailed = signal(false);
  protected readonly deleteBusy = signal(false);

  protected readonly visible = computed(() => filterOpponents(this.opponents.opponents(), this.query()));
  /** Bilanz je Gegnerprofil (SCRUM-34), aus den Spielen mit Ergebnis. */
  protected readonly records = computed(() => {
    const list = this.opponents.opponents();
    const events = this.eventsService.events();
    return new Map(list.map((opponent) => [opponent.id, opponentRecord(opponent, events, list)] as const));
  });
  protected recordText = recordText;

  protected formatDate = formatDate;
  protected detailsOf = detailsOf;

  ngOnInit(): void {
    // Aus der globalen Suche: ?suche=<Gegnername> filtert die Liste vor.
    this.query.set(this.route.snapshot.queryParamMap.get('suche') ?? '');
    this.opponents.start();
    this.eventsService.start();
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(opponent: Opponent): void {
    if (!this.opponents.canWrite()) return;
    this.editing.set(opponent);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected askDelete(opponent: Opponent): void {
    this.dialogOpen.set(false);
    this.deleteFailed.set(false);
    this.deleting.set(opponent);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const opponent = this.deleting();
    if (!opponent || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteFailed.set(false);
    try {
      if (await this.opponents.remove(opponent.id)) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }

  protected retry(): void {
    this.opponents.stop();
    this.opponents.start();
  }
}
