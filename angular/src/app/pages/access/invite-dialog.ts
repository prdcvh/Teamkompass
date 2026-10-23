import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { INVITE_ROLES, type InviteRole, parseExpiryDays, playerInviteLink } from '../../core/access/access';
import { CurrentTeam } from '../../core/team/current-team.service';
import { AccessService } from '../../core/access/access.service';
import { consentRevokedMessage, isConsentRevoked, type Player } from '../../core/player/player';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Einladungscode für einen Spieler oder ein Elternteil erzeugen; der Code wird danach einmalig angezeigt. */
@Component({
  selector: 'tk-invite-dialog',
  imports: [Dialog, Button],
  templateUrl: './invite-dialog.html',
  styleUrl: './invite-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteDialog {
  private readonly access = inject(AccessService);
  private readonly team = inject(CurrentTeam);

  readonly open = input(false);
  readonly players = input<readonly Player[]>([]);
  readonly closed = output<void>();

  protected readonly roles = INVITE_ROLES;
  protected readonly playerId = signal('');
  protected readonly role = signal<InviteRole>('player');
  protected readonly days = signal('');
  protected readonly errors = signal<{ player?: string; days?: string }>({});
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly created = signal<{ code: string; expiresAt: Date | null; player: string; role: InviteRole } | null>(null);
  protected readonly copied = signal(false);

  protected readonly selected = computed(() => this.players().find((player) => player.id === this.playerId()) ?? null);
  /** Einwilligung widerrufen (SCRUM-51): nur eine Warnung, die Vergabe bleibt möglich. */
  protected readonly consentWarning = computed(() => {
    const player = this.selected();
    return player && isConsentRevoked(player) ? consentRevokedMessage(player.name) : '';
  });

  constructor() {
    // Beim Öffnen immer ein leeres Formular; ein zuvor erzeugter Code bleibt nicht im Speicher.
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    this.playerId.set('');
    this.role.set('player');
    this.days.set('');
    this.errors.set({});
    this.busy.set(false);
    this.failure.set('');
    this.created.set(null);
    this.copied.set(false);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected roleName(role: InviteRole): string {
    return role === 'parent' ? 'Eltern' : 'Spieler';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const player = this.selected();
    const days = parseExpiryDays(this.days());
    const errors: { player?: string; days?: string } = {};
    if (!player) errors.player = 'Bitte einen Spieler auswählen.';
    if (days === undefined) errors.days = 'Bitte eine ganze Zahl von 1 bis 365 eingeben oder das Feld leer lassen.';
    this.errors.set(errors);
    if (!player || days === undefined) return;
    this.busy.set(true);
    this.failure.set('');
    try {
      const result = await this.access.createInvite(player.id, this.role(), days);
      if (result.ok) this.created.set({ code: result.code, expiresAt: result.expiresAt, player: player.name, role: this.role() });
      else this.failure.set(result.message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    const created = this.created();
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      this.copied.set(true);
    } catch {
      this.copied.set(false); // Der Code bleibt markierbar sichtbar.
    }
  }

  /**
   * Einladungslink mit Team (SCRUM-181, „ein Build für alle“): Ohne festes Team im Build muss der Link sagen, in welches
   * Team der Code gehört. Er füllt auf der Anmeldeseite den Code ein und wählt das Team.
   */
  protected async copyLink(): Promise<void> {
    const created = this.created();
    if (!created) return;
    try {
      await navigator.clipboard.writeText(playerInviteLink(location.origin, this.team.id(), created.code));
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected close(): void {
    this.created.set(null); // Code sofort verwerfen
    this.closed.emit();
  }

  protected date(value: Date): string {
    return value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
