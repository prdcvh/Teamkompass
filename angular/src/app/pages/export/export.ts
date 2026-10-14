import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { buildExport, exportFileName, revokedPlayers } from '../../core/export';
import { FileOutput } from '../../core/file-output';
import { PlayerRecordsApi } from '../../core/firebase/player-records.api';
import { OpponentsService } from '../../core/opponents.service';
import { consentRevokedMessage, todayIso } from '../../core/player';
import { profileReportHtml } from '../../core/profile-report';
import { type DevelopmentPlan, planFromDoc } from '../../core/records';
import { SessionService } from '../../core/session.service';
import { SyncService } from '../../core/sync.service';
import { TeamService } from '../../core/team.service';
import { WorkspaceService } from '../../core/workspace.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

type Kind = 'json' | 'pdf';

/** Daten exportieren: Sicherung aller Teamdaten (JSON) und Spielerprofil als PDF (nur Trainer). */
@Component({
  selector: 'app-export',
  imports: [Button, Card, Dialog],
  templateUrl: './export.html',
  styleUrl: './export.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Export implements OnInit {
  private readonly team = inject(TeamService);
  private readonly opponents = inject(OpponentsService);
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly files = inject(FileOutput);
  private readonly workspace = inject(WorkspaceService);
  private readonly session = inject(SessionService);
  protected readonly sync = inject(SyncService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly players = computed(() => this.team.data().map((entry) => entry.player));
  protected readonly ready = computed(() => this.team.ready() && this.opponents.load() === 'ready');
  protected readonly loadFailed = computed(() => !!this.team.error() || this.opponents.load() === 'error');
  protected readonly selectedId = signal('');
  protected readonly selected = computed(() => this.players().find((player) => player.id === this.selectedId()) ?? this.players()[0] ?? null);

  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly done = signal('');
  /** Warnung wegen widerrufener Einwilligung: wartet auf Bestätigung. */
  protected readonly confirming = signal<{ kind: Kind; names: string[] } | null>(null);
  protected readonly confirmText = computed(() => {
    const names = this.confirming()?.names ?? [];
    return names.map((name) => consentRevokedMessage(name)).join(' ');
  });

  ngOnInit(): void {
    if (this.isTrainer()) {
      this.team.start();
      this.opponents.start();
    }
  }

  protected retry(): void {
    this.team.retry();
    this.opponents.start();
  }

  protected pick(event: Event): void {
    this.selectedId.set((event.target as HTMLSelectElement).value);
  }

  /** Prüft zuerst die Einwilligung der betroffenen Spieler; erst nach Bestätigung wird exportiert. */
  protected request(kind: Kind): void {
    if (!this.ready() || this.busy()) return;
    const affected = kind === 'json' ? this.players() : this.selected() ? [this.selected()!] : [];
    const revoked = revokedPlayers(affected);
    if (revoked.length) this.confirming.set({ kind, names: revoked.map((player) => player.name) });
    else void this.run(kind);
  }

  protected confirm(): void {
    const pending = this.confirming();
    this.confirming.set(null);
    if (pending) void this.run(pending.kind);
  }

  private async run(kind: Kind): Promise<void> {
    this.busy.set(true);
    this.failure.set('');
    this.done.set('');
    try {
      if (kind === 'json') await this.exportJson();
      else this.exportPdf();
    } catch {
      this.failure.set('Der Export hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      this.busy.set(false);
    }
  }

  private async exportJson(): Promise<void> {
    const today = todayIso();
    const players = this.players();
    const plans = new Map<string, readonly DevelopmentPlan[]>(
      await Promise.all(
        players.map(async (player) => {
          const docs = await this.playerRecordsApi.readPlayerRecords(player.id, 'developmentPlans');
          return [player.id, docs.map((doc) => planFromDoc(doc.id, doc.data, today))] as const;
        }),
      ),
    );
    const now = new Date();
    const data = buildExport({
      teamId: environment.teamId,
      now,
      players,
      events: this.team.events(),
      ratings: this.team.ratingsByEvent(),
      plans,
      absences: new Map(this.team.data().map((entry) => [entry.player.id, entry.absences])),
      measurements: new Map(this.team.data().map((entry) => [entry.player.id, entry.measurements])),
      opponents: this.opponents.opponents(),
    });
    this.files.saveText(exportFileName(now), JSON.stringify(data, null, 2));
    this.workspace.record('Teamdaten als JSON exportiert');
    this.done.set('Die Sicherung wurde heruntergeladen.');
  }

  private exportPdf(): void {
    const player = this.selected();
    const entry = this.team.data().find((item) => item.player.id === player?.id);
    if (!player || !entry) return;
    this.files.print(
      profileReportHtml({ teamName: environment.teamName, player, items: entry.items, absences: entry.absences, today: todayIso() }),
    );
    this.workspace.record(`Spielerprofil als PDF vorbereitet (${player.name})`);
    this.done.set('Der Druckdialog wurde geöffnet – dort „Als PDF speichern“ wählen.');
  }
}
