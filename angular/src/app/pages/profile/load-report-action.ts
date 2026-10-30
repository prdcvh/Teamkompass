import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrentTeam } from '../../core/team/current-team.service';
import { type LoadReportPeriod, LOAD_REPORT_PERIODS, buildLoadReport, canCreateLoadReport, loadReportRange } from '../../core/analysis/load-report';
import { LOAD_REPORT_CSS, loadReportHtml } from '../../core/analysis/load-report-html';
import { SessionService } from '../../core/auth/session.service';
import { FileOutput } from '../../core/export/file-output';
import { type Player, consentRevokedMessage, isConsentRevoked } from '../../core/player/player';
import type { EventRating } from '../../core/profile/profile';
import type { Absence } from '../../core/records/absence';
import type { Measurement } from '../../core/records/measurement';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Schaltfläche „Belastungsprotokoll (PDF)“ samt Dialog (Zeitraum, Häkchen für Gesundheitsdaten), SCRUM-139. Erscheint nur,
 * wenn die Rolle das Protokoll für diesen Spieler erstellen darf (Trainer: jeder Spieler, Spieler: nur das eigene).
 */
@Component({
  selector: 'tk-load-report-action',
  imports: [Button, Dialog],
  styleUrls: ['./record-dialogs.css', './load-report-action.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed()) {
      <button tkButton type="button" size="sm" class="open" (click)="openDialog()">Belastungsprotokoll (PDF)</button>
      <tk-dialog [open]="open()" title="Belastungsprotokoll (PDF)" (closed)="open.set(false)">
        @if (open()) {
        <form (submit)="create($event)" novalidate>
          <p class="hint">Für <strong>{{ player().name }}</strong>. Es öffnet sich der Druckdialog; dort „Als PDF speichern“ wählen.</p>
          <label class="tk-label">
            Zeitraum
            <select class="tk-input" name="period" [value]="period()" (change)="choosePeriod(value($event))">
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
          <label class="check">
            <input type="checkbox" name="health" [checked]="includeHealth()" (change)="includeHealth.set(checked($event))" />
            Verletzungs- und Befindensdaten einschließen
          </label>
          <p class="hint">Ohne Häkchen enthält das Protokoll nur die Belastung (z. B. für einen Stützpunkt): keine Verletzungen, keine Abwesenheitsgründe, keine Verfügbarkeit.</p>
          @if (consentWarning(); as warning) {
            <p class="error" role="alert">{{ warning }}</p>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <menu>
            <button tkButton type="button" variant="neutral" (click)="open.set(false)">Abbrechen</button>
            <button tkButton type="submit" variant="primary">Protokoll erstellen</button>
          </menu>
        </form>
        }
      </tk-dialog>
    }
  `,
})
export class LoadReportAction {
  private readonly session = inject(SessionService);
  private readonly current = inject(CurrentTeam);
  private readonly files = inject(FileOutput);

  readonly player = input.required<Player>();
  readonly items = input.required<readonly EventRating[]>();
  readonly absences = input.required<readonly Absence[]>();
  readonly measurements = input.required<readonly Measurement[]>();

  protected readonly periods = LOAD_REPORT_PERIODS;
  protected readonly today = todayIso();
  protected readonly open = signal(false);
  protected readonly period = signal<LoadReportPeriod>('4');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly includeHealth = signal(true);
  protected readonly error = signal('');

  protected readonly allowed = computed(() => canCreateLoadReport(this.session.role(), this.session.playerId(), this.player().id));
  protected readonly consentWarning = computed(() => (isConsentRevoked(this.player()) ? consentRevokedMessage(this.player().name) : ''));

  protected openDialog(): void {
    const range = loadReportRange('4', '', '', this.today);
    this.period.set('4');
    this.from.set('from' in range ? range.from : this.today);
    this.to.set(this.today);
    this.includeHealth.set(true);
    this.error.set('');
    this.open.set(true);
  }

  protected choosePeriod(value: string): void {
    this.period.set((LOAD_REPORT_PERIODS.find((option) => option.value === value)?.value ?? '4') as LoadReportPeriod);
    this.error.set('');
  }

  protected create(event: Event): void {
    event.preventDefault();
    const player = this.player();
    if (!canCreateLoadReport(this.session.role(), this.session.playerId(), player.id)) return;
    const range = loadReportRange(this.period(), this.from(), this.to(), this.today);
    if ('error' in range) {
      this.error.set(range.error);
      return;
    }
    const report = buildLoadReport({
      teamName: this.current.name(),
      player,
      items: this.items(),
      absences: this.absences(),
      measurements: this.measurements(),
      includeHealth: this.includeHealth(),
      from: range.from,
      to: range.to,
      today: this.today,
      createdBy: this.author(player),
    });
    this.files.print(loadReportHtml(report, new URL('club-logo.png', document.baseURI).href), LOAD_REPORT_CSS);
    this.open.set(false);
  }

  private author(player: Player): string {
    if (this.session.role() === 'player') return `${player.name} (Spieler, selbst erstellt)`;
    const name = this.session.displayName().trim();
    return name ? `Trainer (${name})` : 'Trainer';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
