import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { type AccessEntry, roleLabel, sortEntries, validityText, isExpired } from '../../core/access';
import { AccessService } from '../../core/access.service';
import { LayoutService } from '../../core/layout.service';
import { SessionService } from '../../core/session.service';
import { SquadService } from '../../core/squad.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { InviteDialog } from './invite-dialog';

/** Spieler-Zugänge: Einladungscodes für Spieler/Eltern erzeugen, Liste der Zugänge, Zugang sperren (nur Trainer). */
@Component({
  selector: 'app-access',
  imports: [Button, Card, Dialog, Icon, InviteDialog],
  templateUrl: './access.html',
  styleUrl: './access.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Access implements OnInit {
  protected readonly access = inject(AccessService);
  protected readonly squad = inject(SquadService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly inviteOpen = signal(false);
  protected readonly revoking = signal<AccessEntry | null>(null);
  protected readonly revokeError = signal('');
  protected readonly revokeBusy = signal(false);

  protected readonly rows = computed(() =>
    sortEntries(this.access.entries(), (entry) => this.nameOf(entry)).map((entry) => ({
      entry,
      name: this.nameOf(entry),
      kind: this.kindText(entry),
      validity: validityText(entry),
      expired: isExpired(entry),
    })),
  );

  ngOnInit(): void {
    if (!this.isTrainer()) return;
    this.squad.start();
    void this.access.reload();
  }

  private nameOf(entry: AccessEntry): string {
    if (entry.role === 'medical') return entry.email || 'Scout-Zugang';
    return this.squad.players().find((player) => player.id === entry.playerId)?.name ?? entry.playerId ?? 'Unbekannter Spieler';
  }

  private kindText(entry: AccessEntry): string {
    const base = roleLabel(entry.role);
    return entry.kind === 'invite' ? `${base} · Einladung offen` : base;
  }

  /** Kurzform für offene Codes: der Code gilt wie ein Passwort und wird in der Liste nicht ausgeschrieben. */
  protected shortCode(entry: AccessEntry): string {
    return entry.kind === 'invite' ? `Code …${entry.id.slice(-6)}` : '';
  }

  protected askRevoke(entry: AccessEntry): void {
    this.revokeError.set('');
    this.revoking.set(entry);
  }

  protected cancelRevoke(): void {
    this.revoking.set(null);
  }

  protected async confirmRevoke(): Promise<void> {
    const entry = this.revoking();
    if (!entry || this.revokeBusy()) return;
    this.revokeBusy.set(true);
    this.revokeError.set('');
    try {
      const result = await this.access.revoke(entry);
      if (result.ok) this.revoking.set(null);
      else this.revokeError.set(result.message);
    } finally {
      this.revokeBusy.set(false);
    }
  }

  protected retry(): void {
    void this.access.reload();
  }
}
