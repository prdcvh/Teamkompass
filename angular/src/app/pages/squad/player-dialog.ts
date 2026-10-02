import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { LayoutService } from '../../core/layout.service';
import {
  CONSENT_LABELS,
  type ConsentStatus,
  PLAYER_STATUSES,
  type Player,
  type PlayerDraft,
  type PlayerErrors,
  type PlayerStatus,
  STANDARD_POSITIONS,
  draftFromPlayer,
  emptyDraft,
  todayIso,
} from '../../core/player';
import { SquadService } from '../../core/squad.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Spieler anlegen/bearbeiten (Figma: „Spieler anlegen“ Desktop 14 / Handy 03b). */
@Component({
  selector: 'tk-player-dialog',
  imports: [Dialog, Button],
  templateUrl: './player-dialog.html',
  styleUrl: './player-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerDialog {
  private readonly squad = inject(SquadService);
  protected readonly mobile = inject(LayoutService).isMobile;

  readonly open = input(false);
  /** Zu bearbeitender Spieler; leer = neuen Spieler anlegen. */
  readonly player = input<Player | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<Player>();

  protected readonly positions = STANDARD_POSITIONS;
  protected readonly statuses = PLAYER_STATUSES;
  protected readonly consents = Object.entries(CONSENT_LABELS) as [ConsentStatus, string][];
  protected readonly today = todayIso();

  protected readonly draft = signal<PlayerDraft>(emptyDraft([]));
  protected readonly errors = signal<PlayerErrors>({});
  protected readonly editing = computed(() => this.player() !== null);
  protected readonly title = computed(() => (this.editing() ? 'Spieler bearbeiten' : 'Spieler anlegen'));

  constructor() {
    // Beim Öffnen frisch befüllen: bearbeiten = Werte des Spielers, anlegen = nächste freie Nummer.
    effect(() => {
      if (!this.open()) return;
      const player = this.player();
      untracked(() => {
        this.draft.set(player ? draftFromPlayer(player) : emptyDraft(this.squad.players()));
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<PlayerDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected togglePosition(position: string): void {
    this.draft.update((draft) => ({
      ...draft,
      positions: draft.positions.includes(position) ? draft.positions.filter((item) => item !== position) : [...draft.positions, position],
    }));
  }

  protected setStatus(status: string): void {
    this.patch({ status: status as PlayerStatus });
  }

  /** Pfeiltasten wechseln den Status in der Auswahlleiste (Radiogruppe: nur der gewählte Eintrag ist per Tab erreichbar). */
  protected moveStatus(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = PLAYER_STATUSES.indexOf(this.draft().status);
    const next = PLAYER_STATUSES[(index + step + PLAYER_STATUSES.length) % PLAYER_STATUSES.length];
    this.setStatus(next);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[PLAYER_STATUSES.indexOf(next)]?.focus());
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.squad.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const player = this.player();
    if (player) this.deleteRequested.emit(player);
  }
}
