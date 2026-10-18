import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LayoutService, injectNarrowViewport } from '../../core/shell/layout.service';
import { ageFromBirthdate, formatDate } from '../../core/shared/dates';
import { CONSENT_LABELS, type Player, STANDARD_POSITIONS, positionText } from '../../core/player/player';
import { SORT_OPTIONS, SQUAD_STATUSES, type SortKey, type StatusOf, filterPlayers, groupByLine, sortPlayers, statusCounts } from '../../core/player/squad-list';
import { SquadService } from '../../core/player/squad.service';
import { activeAbsenceOn } from '../../core/records/absence';
import { type EffectiveStatus, effectiveStatus } from '../../core/records/availability';
import { SquadAbsencesService } from '../../core/records/squad-absences.service';
import { todayIso } from '../../core/shared/dates';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { Status } from '../../ui/status/status';
import { PlayerDialog } from './player-dialog';

const METRIC_TONES: Readonly<Record<EffectiveStatus, string>> = {
  Fit: 'green',
  Angeschlagen: 'amber',
  Verletzt: 'red',
  Abwesend: 'neutral',
  Gesperrt: 'neutral',
  Pause: 'neutral',
};

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
  private readonly absences = inject(SquadAbsencesService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly narrow = injectNarrowViewport();
  /** Kartenliste statt Tabelle: auf dem Handy und überall, wo die Tabelle nicht neben das Seitenmenü passt (SCRUM-134). */
  protected readonly cards = computed(() => this.mobile() || this.narrow());

  protected readonly positionOptions = STANDARD_POSITIONS;
  protected readonly statusOptions = SQUAD_STATUSES;
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

  private readonly today = todayIso();
  /** Wirksamer Status je Spieler: eine heute laufende Abwesenheit überlagert den gespeicherten Status (SCRUM-164). */
  private readonly statuses = computed(() => {
    const byPlayer = this.absences.byPlayer();
    return new Map(this.squad.players().map((player) => [player.id, effectiveStatus(player, byPlayer.get(player.id) ?? [], this.today)]));
  });
  protected readonly statusOf: StatusOf = (player) => this.statuses().get(player.id) ?? player.status;

  protected readonly visible = computed(() =>
    sortPlayers(filterPlayers(this.squad.players(), { query: this.query(), position: this.position(), status: this.status() }, this.statusOf), this.sort(), this.statusOf),
  );
  protected readonly groups = computed(() => groupByLine(this.visible()));
  protected readonly counts = computed(() => statusCounts(this.squad.players(), this.statusOf));
  /** Zähler: die vier festen immer, „Abwesend“ und „Gesperrt“ nur, wenn es solche Spieler gibt. */
  protected readonly metrics = computed(() => {
    const counts = this.counts();
    const always: readonly EffectiveStatus[] = ['Fit', 'Angeschlagen', 'Verletzt', 'Pause'];
    return SQUAD_STATUSES.filter((status) => always.includes(status) || counts[status] > 0).map((status) => ({ status, count: counts[status], tone: METRIC_TONES[status] }));
  });
  /** Spalten der Zähler: schmal (Handy/Karten) bei mehr als vier Zählern zwei Reihen à drei, sonst eine Reihe. */
  protected readonly metricColumns = computed(() => {
    const count = this.metrics().length;
    return this.cards() && count > 4 ? 3 : count;
  });
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
    this.absences.start();
  }

  protected age(player: Player): string {
    const age = ageFromBirthdate(player.birthdate);
    return age === null ? '–' : String(age);
  }

  protected positionText = positionText;

  protected consentLabel(player: Player): string {
    return CONSENT_LABELS[player.consentStatus];
  }

  /** „bis 01.12.2026“ bei laufender Abwesenheit (oder „Ende offen“) und bei verletzten Spielern mit Datum. */
  protected injuryNote(player: Player): string {
    const absence = activeAbsenceOn(this.absences.byPlayer().get(player.id) ?? [], this.today);
    if (absence) return absence.to ? `bis ${formatDate(absence.to)}` : 'Ende offen';
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
