import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { type Backup, MAX_BACKUP_BYTES, type CurrentIds, backupOperations, overwriteCount, parseBackup, summarizeBackup, summaryLines, validateBackup } from '../../core/export/backup-import';
import { EventsService } from '../../core/events/events.service';
import { buildExport, exportFileName, revokedPlayers } from '../../core/export/export';
import { BackupApi } from '../../core/firebase/backup.api';
import { FileOutput } from '../../core/export/file-output';
import { PlayerRecordsApi } from '../../core/firebase/player-records.api';
import { OpponentsService } from '../../core/opponents/opponents.service';
import { todayIso } from '../../core/shared/dates';
import { type Player, consentRevokedMessage } from '../../core/player/player';
import { profileReportHtml } from '../../core/profile/profile-report';
import { type Absence, absenceFromDoc } from '../../core/records/absence';
import { type Measurement, measurementFromDoc } from '../../core/records/measurement';
import { type DevelopmentPlan, planFromDoc } from '../../core/records/plan';
import { SessionService } from '../../core/auth/session.service';
import { SyncService } from '../../core/shell/sync.service';
import { TeamService } from '../../core/team/team.service';
import { WorkspaceService } from '../../core/device/workspace.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

type Kind = 'json' | 'pdf';

/** Eine geprüfte Sicherungsdatei, die auf die Bestätigung wartet. */
interface PendingImport {
  readonly fileName: string;
  readonly backup: Backup;
  readonly lines: string[];
  readonly overwrites: number;
}

/** Daten exportieren: Sicherung aller Teamdaten (JSON) und Spielerprofil als PDF (nur Trainer). */
@Component({
  selector: 'app-export',
  imports: [Button, Card, Dialog],
  templateUrl: './export.html',
  styleUrl: './export.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Export implements OnInit, OnDestroy {
  private readonly team = inject(TeamService);
  private readonly eventsService = inject(EventsService);
  private readonly opponents = inject(OpponentsService);
  private readonly playerRecordsApi = inject(PlayerRecordsApi);
  private readonly files = inject(FileOutput);
  private readonly backupApi = inject(BackupApi);
  private readonly workspace = inject(WorkspaceService);
  private readonly session = inject(SessionService);
  protected readonly sync = inject(SyncService);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');

  protected readonly players = computed(() => this.team.data().map((entry) => entry.player));
  protected readonly ready = computed(() => this.team.ready() && this.opponents.load() === 'ready');
  protected readonly loadFailed = computed(() => !!this.team.error() || this.opponents.load() === 'error');
  protected readonly selectedId = signal('');
  protected readonly selected = computed<Player | null>(() => this.players().find((player) => player.id === this.selectedId()) ?? this.players()[0] ?? null);

  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly done = signal('');
  /** Warnung wegen widerrufener Einwilligung: wartet auf Bestätigung. */
  protected readonly confirming = signal<{ kind: Kind; names: string[] } | null>(null);
  protected readonly confirmText = computed(() => {
    const names = this.confirming()?.names ?? [];
    return names.map((name) => consentRevokedMessage(name)).join(' ');
  });

  /** Sicherung einspielen: geprüfte Datei wartet auf Bestätigung; Fehler der Dateiprüfung stehen im Hinweis. */
  protected readonly pendingImport = signal<PendingImport | null>(null);
  protected readonly importError = signal('');
  protected readonly importDone = signal('');
  protected readonly importing = signal(false);

  ngOnInit(): void {
    if (this.isTrainer()) {
      // Sicherung und Export enthalten alle Saisons, nicht nur die laufende (SCRUM-199).
      this.eventsService.showAllSeasons();
      this.team.start();
      this.opponents.start();
    }
  }

  ngOnDestroy(): void {
    if (this.isTrainer()) this.eventsService.showCurrentSeason();
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
      else await this.exportPdf();
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
    const history = await this.readHistory(players);
    const now = new Date();
    const data = buildExport({
      teamId: environment.teamId,
      now,
      players,
      events: this.team.events(),
      ratings: this.team.ratingsByEvent(),
      plans,
      absences: new Map(players.map((player) => [player.id, history.get(player.id)!.absences])),
      measurements: new Map(players.map((player) => [player.id, history.get(player.id)!.measurements])),
      opponents: this.opponents.opponents(),
    });
    this.files.saveText(exportFileName(now), JSON.stringify(data, null, 2));
    this.workspace.record('Teamdaten als JSON exportiert');
    this.done.set('Die Sicherung wurde heruntergeladen.');
  }

  /**
   * Volle Abwesenheits- und Messhistorie je Spieler, einmalig beim Export gelesen: die Übersichten halten nur das
   * Fenster, das sie brauchen (SCRUM-200).
   */
  private async readHistory(players: readonly Player[]): Promise<Map<string, { absences: readonly Absence[]; measurements: readonly Measurement[] }>> {
    const today = todayIso();
    return new Map(
      await Promise.all(
        players.map(async (player) => {
          const [absences, measurements] = await Promise.all([
            this.playerRecordsApi.readPlayerRecords(player.id, 'absences'),
            this.playerRecordsApi.readPlayerRecords(player.id, 'measurements'),
          ]);
          return [
            player.id,
            {
              absences: absences.map((doc) => absenceFromDoc(doc.id, doc.data)),
              measurements: measurements.map((doc) => measurementFromDoc(doc.id, doc.data, today)),
            },
          ] as const;
        }),
      ),
    );
  }

  private async exportPdf(): Promise<void> {
    const player = this.selected();
    const entry = this.team.data().find((item) => item.player.id === player?.id);
    if (!player || !entry) return;
    const history = (await this.readHistory([player])).get(player.id)!;
    this.files.print(
      profileReportHtml({ teamName: environment.teamName, player, items: entry.items, absences: history.absences, measurements: history.measurements, today: todayIso() }),
    );
    this.workspace.record(`Spielerprofil als PDF vorbereitet (${player.name})`);
    this.done.set('Der Druckdialog wurde geöffnet – dort „Als PDF speichern“ wählen.');
  }

  /** Liest und prüft die gewählte Datei und zeigt die Zusammenfassung. Geschrieben wird erst nach der Bestätigung. */
  protected async chooseBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.isTrainer() || !this.ready() || this.importing()) return;
    this.importError.set('');
    this.importDone.set('');
    this.pendingImport.set(null);
    if (file.size > MAX_BACKUP_BYTES) {
      this.importError.set('Die Datei ist zu groß für eine Sicherung. Es wurde nichts geändert.');
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      this.importError.set('Die Datei konnte nicht gelesen werden. Bitte eine mit „Sicherung herunterladen“ erstellte .json-Datei wählen. Es wurde nichts geändert.');
      return;
    }
    const check = validateBackup(raw);
    if (!check.ok) {
      this.importError.set(`${check.error} Es wurde nichts geändert.`);
      return;
    }
    try {
      const backup = parseBackup(raw as Record<string, unknown>, todayIso());
      const summary = summarizeBackup(await this.currentIds(backup), backup);
      this.pendingImport.set({ fileName: file.name, backup, lines: summaryLines(summary), overwrites: overwriteCount(summary) });
    } catch {
      this.importError.set('Die Datei konnte nicht geprüft werden. Bitte erneut versuchen. Es wurde nichts geändert.');
    }
  }

  /** Kennungen, die es schon gibt (Förderpläne werden für die Spieler der Datei aus der Datenbank gelesen). */
  private async currentIds(backup: Backup): Promise<CurrentIds> {
    const today = todayIso();
    const entries = this.team.data();
    const history = await this.readHistory(entries.map((entry) => entry.player));
    const ids = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id));
    const plans = new Map<string, ReadonlySet<string>>(
      await Promise.all(
        Object.keys(backup.developmentPlans).map(async (playerId) => {
          const docs = await this.playerRecordsApi.readPlayerRecords(playerId, 'developmentPlans');
          return [playerId, ids(docs.map((doc) => planFromDoc(doc.id, doc.data, today)))] as const;
        }),
      ),
    );
    return {
      players: ids(entries.map((entry) => entry.player)),
      events: ids(this.team.events()),
      opponents: ids(this.opponents.opponents()),
      developmentPlans: plans,
      absences: new Map(entries.map((entry) => [entry.player.id, ids(history.get(entry.player.id)!.absences)])),
      measurements: new Map(entries.map((entry) => [entry.player.id, ids(history.get(entry.player.id)!.measurements)])),
    };
  }

  protected cancelImport(): void {
    this.pendingImport.set(null);
  }

  protected async confirmImport(): Promise<void> {
    const pending = this.pendingImport();
    this.pendingImport.set(null);
    if (!pending || !this.isTrainer() || this.importing()) return;
    this.importing.set(true);
    this.importError.set('');
    this.importDone.set('');
    try {
      await this.backupApi.writeAll(backupOperations(pending.backup));
      this.workspace.record(`Sicherung eingespielt (${pending.fileName})`);
      this.importDone.set('Die Sicherung wurde eingespielt. Die Daten erscheinen in wenigen Sekunden.');
    } catch {
      this.importError.set('Die Sicherung konnte nicht vollständig eingespielt werden. Bitte prüfen und ggf. erneut versuchen – bereits geschriebene Teile bleiben bestehen.');
    } finally {
      this.importing.set(false);
    }
  }
}
