import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LayoutService } from '../../core/layout.service';
import {
  CONSENT_LABELS,
  PLAYER_STATUSES,
  type Player,
  SORT_OPTIONS,
  type SortKey,
  STANDARD_POSITIONS,
  ageFromBirthdate,
  filterPlayers,
  formatDate,
  groupByLine,
  positionText,
  sortPlayers,
  statusCounts,
} from '../../core/player';
import { SquadService } from '../../core/squad.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { Status } from '../../ui/status/status';
import { PlayerDialog } from './player-dialog';

/** Kader (Figma: 03 Kader Desktop = Tabelle, 03 Kader Handy = Karten nach Mannschaftsteil). */
@Component({
  selector: 'app-squad',
  imports: [RouterLink, Button, Card, Dialog, Icon, Status, PlayerDialog],
  templateUrl: './squad.html',
  styleUrl: './squad.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Squad implements OnInit {
  protected readonly squad = inject(SquadService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;

  protected readonly positionOptions = STANDARD_POSITIONS;
  protected readonly statusOptions = PLAYER_STATUSES;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly query = signal('');
  protected readonly position = signal('all');
  protected readonly status = signal('all');
  protected readonly sort = signal<SortKey>('number');

  /** Dialog-Zustand: `editing` = null und `dialogOpen` = true bedeutet „neuer Spieler“. */
  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<Player | null>(null);
  protected readonly deleting = signal<Player | null>(null);
  protected readonly deleteFailed = signal(false);

  protected readonly visible = computed(() =>
    sortPlayers(filterPlayers(this.squad.players(), { query: this.query(), position: this.position(), status: this.status() }), this.sort()),
  );
  protected readonly groups = computed(() => groupByLine(this.visible()));
  protected readonly counts = computed(() => statusCounts(this.squad.players()));
  /** Positionen aus den Spielerdaten (auch eigene), damit sich jede vorhandene Position filtern lässt. */
  protected readonly positionFilterOptions = computed(() => {
    const own = this.squad.players().flatMap((player) => player.positions);
    const selected = this.position() === 'all' ? [] : [this.position()]; // bleibt wählbar, auch wenn der letzte Spieler gelöscht wurde
    return [...new Set([...STANDARD_POSITIONS, ...own, ...selected])];
  });
  protected readonly deleteBusy = signal(false);
  protected readonly filtering = computed(() => this.query().trim() !== '' || this.position() !== 'all' || this.status() !== 'all');

  ngOnInit(): void {
    this.squad.start();
  }

  protected age(player: Player): string {
    const age = ageFromBirthdate(player.birthdate);
    return age === null ? '–' : String(age);
  }

  protected positionText = positionText;

  protected consentLabel(player: Player): string {
    return CONSENT_LABELS[player.consentStatus];
  }

  /** „bis 01.12.2026“ bei verletzten Spielern mit Datum. */
  protected injuryNote(player: Player): string {
    return player.status === 'Verletzt' && player.injuryUntil ? `bis ${formatDate(player.injuryUntil)}` : '';
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected openNew(): void {
    this.editing.set(null);
    this.dialogOpen.set(true);
  }

  protected openEdit(player: Player): void {
    if (!this.squad.canWrite()) return;
    this.editing.set(player);
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected askDelete(player: Player): void {
    this.dialogOpen.set(false);
    this.deleteFailed.set(false);
    this.deleting.set(player);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const player = this.deleting();
    if (!player) return;
    if (this.deleteBusy()) return; // Doppelklick: nur ein Löschlauf
    this.deleteBusy.set(true);
    this.deleteFailed.set(false);
    try {
      const ok = await this.squad.remove(player.id);
      if (ok) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }

  protected resetFilters(): void {
    this.query.set('');
    this.position.set('all');
    this.status.set('all');
  }

  protected retry(): void {
    this.squad.stop();
    this.squad.start();
  }
}
