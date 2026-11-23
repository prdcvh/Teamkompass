import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SessionService } from '../../core/auth/session.service';
import { revokedPlayers } from '../../core/export/export';
import { FileOutput } from '../../core/export/file-output';
import { PlayerRecordsApi } from '../../core/firebase/player-records.api';
import { LearningService } from '../../core/learning/learning.service';
import { type Player, consentRevokedMessage } from '../../core/player/player';
import { SEASON_REPORT_CSS, seasonReportsHtml } from '../../core/profile/season-report-html';
import { MAX_SEASON_COMMENT, SEASON_REPORT_PERIODS, type SeasonReportPeriod, buildSeasonReport, seasonReportRange } from '../../core/profile/season-report';
import { RatingScaleService } from '../../core/ratings/rating-scale.service';
import { absenceFromDoc } from '../../core/records/absence';
import { planFromDoc } from '../../core/records/plan';
import { todayIso } from '../../core/shared/dates';
import { WorkspaceService } from '../../core/device/workspace.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { TeamService } from '../../core/team/team.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Saisonbericht als PDF (SCRUM-196), baut auf dem Druckweg des Belastungsprotokolls (SCRUM-139) auf: für einen Spieler
 * oder für alle Spieler des Teams (ein Dokument, jeder Spieler auf neuer Seite). Nur Trainer (die Seite „Daten exportieren“
 * ist nur für sie sichtbar, hier zusätzlich geprüft). Gesundheitsdaten nur mit Häkchen (Standard: aus); private
 * Trainer-Notizen und Rückmeldungstexte je Event gehen nie in den Bericht – der Kommentar wird eigens für den Bericht getippt.
 */
@Component({
  selector: 'tk-season-report-panel',
  imports: [Button, Dialog],
  styles: `
    :host { display: grid; gap: var(--tk-space-3); }
    h2, p { margin: 0; }
    h2 { font-size: var(--tk-text-lg); }
    .muted { color: var(--tk-muted); font-size: var(--tk-text-sm); }
    .error, .warn { color: var(--tk-red-dark); font-size: var(--tk-text-sm); margin: 0; }
    form { display: grid; gap: var(--tk-space-3); }
    label { display: grid; gap: var(--tk-space-1); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tk-space-2); }
    .check { display: flex; align-items: center; gap: var(--tk-space-2); font-weight: 600; }
    .check input { width: 20px; height: 20px; margin: 0; }
    textarea { min-height: 96px; resize: vertical; font: inherit; }
    details { display: grid; gap: var(--tk-space-2); }
    menu { display: flex; justify-content: flex-end; gap: var(--tk-space-2); margin: 0; padding: 0; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed()) {
      <h2>Saisonbericht (PDF)</h2>
      <p class="muted">Anwesenheit, Entwicklung des Kompetenzprofils, erreichte Förderziele, Lernpfad-Stufen und ein Kommentar des Trainers – für einen Spieler oder das ganze Team.</p>
      <div>
        <button tkButton type="button" [disabled]="players().length === 0" (click)="openDialog()">Saisonbericht zusammenstellen …</button>
      </div>
      @if (done()) {
        <p class="muted" role="status">{{ done() }}</p>
      }
      <tk-dialog class="season-dialog" [open]="open()" title="Saisonbericht (PDF)" (closed)="open.set(false)">
        @if (open()) {
          <form (submit)="create($event)" novalidate>
            <label class="tk-label">
              Für wen
              <select class="tk-input" name="scope" (change)="scope.set(value($event) === 'all' ? 'all' : 'one'); revoked.set('')">
                <option value="one" [selected]="scope() === 'one'">Ein Spieler</option>
                <option value="all" [selected]="scope() === 'all'">Alle Spieler des Teams ({{ players().length }})</option>
              </select>
            </label>
            @if (scope() === 'one') {
              <label class="tk-label">
                Spieler
                <select class="tk-input" name="player" (change)="playerId.set(value($event)); revoked.set('')">
                  @for (player of players(); track player.id) {
                    <option [value]="player.id" [selected]="player.id === selectedId()">{{ player.name }}</option>
                  }
                </select>
              </label>
            }
            <label class="tk-label">
              Zeitraum
              <select class="tk-input" name="period" (change)="choosePeriod(value($event))">
                @for (option of periods; track option.value) {
                  <option [value]="option.value" [selected]="option.value === period()">{{ option.label }}</option>
                }
              </select>
            </label>
            @if (period() === 'custom') {
              <div class="grid">
                <label class="tk-label">Von <input class="tk-input" name="from" type="date" [max]="today" [value]="from()" (input)="from.set(value($event))" /></label>
                <label class="tk-label">Bis <input class="tk-input" name="to" type="date" [max]="today" [value]="to()" (input)="to.set(value($event))" /></label>
              </div>
            }
            @if (scope() === 'one') {
              <label class="tk-label">
                Kommentar des Trainers (optional)
                <textarea class="tk-input" name="comment" [maxLength]="maxComment" [value]="commentOf(selectedId())" (input)="setComment(selectedId(), value($event))"></textarea>
              </label>
            } @else {
              <details>
                <summary>Kommentare des Trainers je Spieler (optional)</summary>
                @for (player of players(); track player.id) {
                  <label class="tk-label">
                    {{ player.name }}
                    <textarea class="tk-input" [attr.name]="'comment-' + player.id" [maxLength]="maxComment" [value]="commentOf(player.id)" (input)="setComment(player.id, value($event))"></textarea>
                  </label>
                }
              </details>
            }
            <p class="muted">Der Kommentar wird nur für diesen Bericht geschrieben und nicht gespeichert. Private Trainer-Notizen und die Rückmeldungen zu einzelnen Terminen stehen nie im Bericht.</p>
            <label class="check">
              <input type="checkbox" name="health" [checked]="includeHealth()" (change)="includeHealth.set(checked($event))" />
              Verletzungen und Abwesenheitsgründe einschließen
            </label>
            <p class="muted">Ohne Häkchen (Standard) enthält der Bericht keine Gesundheitsdaten. Nur aktivieren, wenn die Empfänger sie ausdrücklich erhalten sollen.</p>
            @if (revoked()) {
              <p class="warn" role="alert">{{ revoked() }} Trotzdem erstellen?</p>
            }
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <menu>
              <button tkButton type="button" variant="neutral" (click)="open.set(false)">Abbrechen</button>
              <button tkButton type="submit" variant="primary" [disabled]="busy()">{{ revoked() ? 'Trotzdem erstellen' : 'Bericht erstellen' }}</button>
            </menu>
          </form>
        }
      </tk-dialog>
    }
  `,
})
export class SeasonReportPanel implements OnInit {
  private readonly session = inject(SessionService);
  private readonly team = inject(TeamService);
  private readonly current = inject(CurrentTeam);
  private readonly learning = inject(LearningService);
  private readonly records = inject(PlayerRecordsApi);
  private readonly ratingScale = inject(RatingScaleService);
  private readonly files = inject(FileOutput);
  private readonly workspace = inject(WorkspaceService);

  protected readonly periods = SEASON_REPORT_PERIODS;
  protected readonly maxComment = MAX_SEASON_COMMENT;
  protected readonly today = todayIso();
  protected readonly open = signal(false);
  protected readonly scope = signal<'one' | 'all'>('one');
  protected readonly playerId = signal('');
  protected readonly period = signal<SeasonReportPeriod>('season');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly includeHealth = signal(false);
  protected readonly comments = signal<Readonly<Record<string, string>>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal('');
  /** Warnung wegen widerrufener Einwilligung; der nächste Klick auf „Trotzdem erstellen“ bestätigt sie. */
  protected readonly revoked = signal('');

  /** Nur der Trainer erstellt den Bericht (Daten aller Spieler, auch Förderziele und Lernfortschritt). */
  protected readonly allowed = computed(() => this.session.role() === 'trainer');
  protected readonly players = computed(() => this.team.data().map((entry) => entry.player));
  protected readonly selectedId = computed(() => this.players().find((player) => player.id === this.playerId())?.id ?? this.players()[0]?.id ?? '');

  ngOnInit(): void {
    // Lernpfade früh laden, damit sie beim Erstellen schon da sind.
    if (this.allowed()) this.learning.start();
  }

  protected openDialog(): void {
    this.scope.set('one');
    this.playerId.set('');
    this.period.set('season');
    this.from.set('');
    this.to.set(this.today);
    this.includeHealth.set(false);
    this.comments.set({});
    this.revoked.set('');
    this.error.set('');
    this.done.set('');
    this.open.set(true);
  }

  protected choosePeriod(value: string): void {
    this.period.set(SEASON_REPORT_PERIODS.find((option) => option.value === value)?.value ?? 'season');
    this.error.set('');
  }

  protected commentOf(id: string): string {
    return this.comments()[id] ?? '';
  }

  protected setComment(id: string, text: string): void {
    this.comments.update((map) => ({ ...map, [id]: text }));
  }

  private chosen(): Player[] {
    const entries = this.players();
    return this.scope() === 'all' ? [...entries] : entries.filter((player) => player.id === this.selectedId());
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.allowed() || this.busy()) return;
    const range = seasonReportRange(this.period(), this.from(), this.to(), this.today);
    if ('error' in range) {
      this.error.set(range.error);
      return;
    }
    const chosen = this.chosen();
    if (chosen.length === 0) return;
    const revoked = revokedPlayers(chosen);
    if (revoked.length && !this.revoked()) {
      this.revoked.set(revoked.map((player) => consentRevokedMessage(player.name)).join(' '));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const reports = await this.build(chosen, range.from, range.to);
      const logo = this.current.logoSrc();
      this.files.print(seasonReportsHtml(reports, logo ? new URL(logo, document.baseURI).href : ''), SEASON_REPORT_CSS);
      this.workspace.record(chosen.length === 1 ? `Saisonbericht als PDF vorbereitet (${chosen[0].name})` : `Saisonbericht als PDF vorbereitet (${chosen.length} Spieler)`);
      this.done.set('Der Druckdialog wurde geöffnet – dort „Als PDF speichern“ wählen.');
      this.open.set(false);
    } catch {
      this.error.set('Der Bericht konnte nicht erstellt werden. Bitte erneut versuchen.');
    } finally {
      this.busy.set(false);
    }
  }

  private async build(chosen: readonly Player[], from: string, to: string) {
    const today = this.today;
    const withHealth = this.includeHealth();
    const data = this.team.data();
    return Promise.all(
      chosen.map(async (player) => {
        const [plans, absences] = await Promise.all([
          this.records.readPlayerRecords(player.id, 'developmentPlans'),
          // Abwesenheiten nur lesen, wenn sie in den Bericht sollen.
          withHealth ? this.records.readPlayerRecords(player.id, 'absences') : Promise.resolve([]),
        ]);
        return buildSeasonReport({
          teamName: this.current.name(),
          teamLabel: this.current.label(),
          player,
          items: data.find((entry) => entry.player.id === player.id)?.items ?? [],
          plans: plans.map((doc) => planFromDoc(doc.id, doc.data, today)),
          absences: absences.map((doc) => absenceFromDoc(doc.id, doc.data)),
          paths: this.learning.paths(),
          progress: this.learning.progressOf(player.id),
          scale: this.ratingScale.scale(),
          comment: this.commentOf(player.id),
          includeHealth: withHealth,
          from,
          to,
          today,
        });
      }),
    );
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
