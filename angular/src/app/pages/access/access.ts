import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type AccessEntry, roleLabel, sortEntries, validityText, isExpired } from '../../core/access/access';
import { AccessService } from '../../core/access/access.service';
import { LayoutService } from '../../core/shell/layout.service';
import { SessionService } from '../../core/auth/session.service';
import { SquadService } from '../../core/player/squad.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';
import { InviteDialog } from './invite-dialog';

export type AccessTab = 'players' | 'scouts' | 'medical';

const TAB_ORDER: readonly AccessTab[] = ['players', 'scouts', 'medical'];

/** Zu welchem Reiter ein Zugang gehört (SCRUM-170: Scouts und Medizin getrennt). */
export function tabOf(entry: Pick<AccessEntry, 'role'>): AccessTab {
  if (entry.role === 'scout') return 'scouts';
  if (entry.role === 'medical') return 'medical';
  return 'players';
}

/**
 * Zugangsverwaltung (nur Trainer), getrennt in drei Reiter: „Spieler“ (Spieler und Eltern: Einladungscodes erzeugen,
 * befristen, sperren), „Scouts“ (Kompetenzprofil, Notenverlauf, Statistik – keine Gesundheitsdaten) und „Medizin“
 * (Status, Abwesenheiten, Verletzungen, Messwerte). Scout- und Medizin-Zugänge melden sich mit E-Mail und Passwort an
 * und werden über eigene Seiten angelegt (SCRUM-170).
 */
@Component({
  selector: 'app-access',
  imports: [RouterLink, Button, Card, Dialog, Icon, InviteDialog],
  templateUrl: './access.html',
  styleUrl: './access.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Access implements OnInit {
  protected readonly access = inject(AccessService);
  protected readonly squad = inject(SquadService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly tab = signal<AccessTab>('players');

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

  protected readonly tabRows = computed(() => this.rows().filter((row) => tabOf(row.entry) === this.tab()));
  protected readonly counts = computed(() => ({
    players: this.rows().filter((row) => tabOf(row.entry) === 'players').length,
    scouts: this.rows().filter((row) => tabOf(row.entry) === 'scouts').length,
    medical: this.rows().filter((row) => tabOf(row.entry) === 'medical').length,
  }));
  /** Seite zum Anlegen eines Zugangs im aktuellen Reiter (Scout bzw. Medizin). */
  protected readonly createLink = computed(() => (this.tab() === 'medical' ? '/medizin-zugang' : '/scout-zugang'));
  protected readonly createLabel = computed(() => (this.tab() === 'medical' ? 'Medizin-Zugang anlegen' : 'Scout-Zugang anlegen'));

  protected select(tab: AccessTab): void {
    this.tab.set(tab);
  }

  /** Pfeiltasten wechseln zum nächsten bzw. vorigen Reiter (rundum). */
  protected step(direction: 1 | -1): void {
    const index = TAB_ORDER.indexOf(this.tab());
    this.selectByKey(TAB_ORDER[(index + direction + TAB_ORDER.length) % TAB_ORDER.length]);
  }

  protected selectByKey(tab: AccessTab): void {
    this.select(tab);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`#access-tab-${tab}`)?.focus());
  }

  ngOnInit(): void {
    if (!this.isTrainer()) return;
    this.squad.start();
    void this.access.reload();
  }

  private nameOf(entry: AccessEntry): string {
    if (entry.role === 'medical') return entry.email || 'Medizin-Zugang';
    if (entry.role === 'scout') return entry.email || 'Scout-Zugang';
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
