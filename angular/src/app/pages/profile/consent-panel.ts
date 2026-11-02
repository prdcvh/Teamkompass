import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { formatDate } from '../../core/events/event';
import { FileOutput } from '../../core/export/file-output';
import {
  CONSENT_PRINT_CSS,
  CONSENT_SIGNATURE_LINE,
  CONSENT_TITLE,
  consentPrintHtml,
  consentTextParagraphs,
  hasHealthFields,
  healthLockedMessage,
  mayStoreHealth,
  requiresDocumentedConsent,
} from '../../core/player/consent';
import { type Player, draftFromPlayer } from '../../core/player/player';
import { SquadService } from '../../core/player/squad.service';
import { AbsencesService } from '../../core/records/absences.service';
import { MeasurementsService } from '../../core/records/measurements.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { todayIso } from '../../core/shared/dates';
import { CurrentTeam } from '../../core/team/current-team.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

type Pending = 'grant' | 'status' | 'absences' | 'measurements';

/**
 * Einwilligung im Spielerprofil (nur Trainer, SCRUM-245): Stand der Einwilligung mit Datum und wer sie eingetragen hat,
 * der Einwilligungstext zum Lesen und Drucken, „als dokumentiert eintragen“ und – bei widerrufener Einwilligung – die
 * Aufgabe „Gesundheitsdaten prüfen und löschen“. Gelöscht wird nur nach Rückfrage, nie automatisch.
 */
@Component({
  selector: 'tk-consent-panel',
  imports: [Button, Card, Dialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-card>
      <section class="consent" id="einwilligung" aria-labelledby="consent-title" tabindex="-1">
        <div class="head">
          <h2 id="consent-title">Einwilligung Gesundheitsdaten</h2>
          <span class="pill" [attr.data-state]="player().consentStatus">{{ stateLabel() }}</span>
        </div>
        @if (locked()) {
          <p class="lock" role="status">{{ lockText() }}</p>
        }
        @if (revoked()) {
          <div class="task" role="region" aria-labelledby="task-title">
            <h3 id="task-title">Aufgabe: Gesundheitsdaten prüfen und löschen</h3>
            <p>Die Einwilligung ist widerrufen. Spieler, Eltern und Medizin sehen diese Daten nicht mehr – du schon. Bitte prüfen und löschen, was nicht aus einem anderen Grund aufbewahrt werden muss. Gelöscht wird erst nach deiner Bestätigung.</p>
            @if (!records.ready()) {
              <p class="muted" role="status">Daten werden geladen …</p>
            } @else if (nothingLeft()) {
              <p class="done">Keine Gesundheitsdaten mehr gespeichert (Status, Abwesenheiten, Messwerte).</p>
            } @else {
              <ul>
                @if (statusStored()) {
                  <li>
                    <span>Status „{{ player().status }}“@if (player().injuryUntil) { (ca. bis {{ formatDate(player().injuryUntil) }})}</span>
                    <button tkButton size="sm" type="button" class="danger" (click)="ask('status')">Auf „Fit“ zurücksetzen</button>
                  </li>
                }
                @if (records.absences().length > 0) {
                  <li>
                    <span>{{ records.absences().length }} Abwesenheit(en)/Verletzung(en)</span>
                    <button tkButton size="sm" type="button" class="danger" (click)="ask('absences')">Alle löschen</button>
                  </li>
                }
                @if (records.measurementList().length > 0) {
                  <li>
                    <span>{{ records.measurementList().length }} Messwert(e)</span>
                    <button tkButton size="sm" type="button" class="danger" (click)="ask('measurements')">Alle löschen</button>
                  </li>
                }
              </ul>
            }
            <p class="muted">Absagegründe in den Terminen und Rückmeldungen in den Bewertungen sind hier nicht aufgeführt; bitte bei Bedarf dort prüfen.</p>
          </div>
        }
        @if (player().consentStatus !== 'granted') {
          <button tkButton size="sm" type="button" variant="primary" (click)="ask('grant')">Einwilligung liegt vor – als dokumentiert eintragen</button>
        }
        <details class="text">
          <summary>Einwilligungstext anzeigen</summary>
          <h3>{{ title }}</h3>
          @for (paragraph of paragraphs(); track $index) {
            <p>{{ paragraph }}</p>
          }
          <p class="muted">{{ signature }}</p>
          <p class="muted">Hinweis: Der Text sollte vom Verein oder dem Datenschutzbeauftragten geprüft werden.</p>
        </details>
        <button tkButton size="sm" type="button" (click)="print()">Einwilligung drucken</button>
      </section>
    </tk-card>

    <tk-dialog [open]="pending() !== null" [title]="dialogTitle()" (closed)="cancel()">
      <p>{{ dialogText() }}</p>
      @if (failed()) {
        <p class="error" role="alert">Das hat nicht geklappt. Bitte Verbindung prüfen und erneut versuchen.</p>
      }
      <div class="confirm-actions">
        <button tkButton type="button" (click)="cancel()">Abbrechen</button>
        <button tkButton type="button" variant="primary" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Bitte warten …' : confirmLabel() }}</button>
      </div>
    </tk-dialog>
  `,
  styleUrl: './consent-panel.css',
})
export class ConsentPanel {
  private readonly squad = inject(SquadService);
  protected readonly records = inject(RecordsStateService);
  private readonly absences = inject(AbsencesService);
  private readonly measurements = inject(MeasurementsService);
  private readonly team = inject(CurrentTeam);
  private readonly files = inject(FileOutput);

  readonly player = input.required<Player>();

  protected readonly title = CONSENT_TITLE;
  protected readonly signature = CONSENT_SIGNATURE_LINE;
  protected readonly paragraphs = computed(() => consentTextParagraphs(this.team.title()));
  protected readonly revoked = computed(() => this.player().consentStatus === 'revoked');
  protected readonly locked = computed(() => !mayStoreHealth(this.player(), this.team.id()));
  protected readonly lockText = computed(() => healthLockedMessage(this.player().name));
  protected readonly statusStored = computed(() => hasHealthFields(this.player()));
  protected readonly nothingLeft = computed(
    () => !this.statusStored() && this.records.absences().length === 0 && this.records.measurementList().length === 0,
  );
  protected readonly stateLabel = computed(() => {
    const player = this.player();
    if (player.consentStatus === 'revoked') return 'widerrufen';
    if (player.consentStatus === 'pending') return requiresDocumentedConsent(this.team.id()) ? 'offen – Gesundheitsdaten gesperrt' : 'offen';
    const parts = ['dokumentiert'];
    if (player.consentDate) parts.push(`am ${formatDate(player.consentDate)}`);
    if (player.consentBy) parts.push(`von ${player.consentBy}`);
    return parts.join(' ');
  });

  protected readonly pending = signal<Pending | null>(null);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  protected readonly dialogTitle = computed(() => {
    switch (this.pending()) {
      case 'grant':
        return 'Einwilligung dokumentieren?';
      case 'status':
        return 'Status zurücksetzen?';
      default:
        return 'Gesundheitsdaten löschen?';
    }
  });
  protected readonly dialogText = computed(() => {
    const name = this.player().name;
    switch (this.pending()) {
      case 'grant':
        return `Bitte nur bestätigen, wenn die unterschriebene Einwilligung für ${name} vorliegt. Gespeichert werden das heutige Datum und dein Konto.`;
      case 'status':
        return `Status von ${name} wird auf „Fit“ gesetzt, „verletzt bis/seit“ wird gelöscht.`;
      case 'absences':
        return `Alle ${this.records.absences().length} Abwesenheiten/Verletzungen von ${name} werden gelöscht. Das lässt sich nicht rückgängig machen.`;
      case 'measurements':
        return `Alle ${this.records.measurementList().length} Messwerte von ${name} werden gelöscht. Das lässt sich nicht rückgängig machen.`;
      default:
        return '';
    }
  });
  protected readonly confirmLabel = computed(() => (this.pending() === 'grant' ? 'Ja, liegt vor' : this.pending() === 'status' ? 'Zurücksetzen' : 'Endgültig löschen'));

  protected formatDate = formatDate;

  protected ask(kind: Pending): void {
    this.failed.set(false);
    this.pending.set(kind);
  }

  protected cancel(): void {
    this.pending.set(null);
  }

  protected async confirm(): Promise<void> {
    const kind = this.pending();
    if (!kind || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      const ok = await this.run(kind);
      if (ok) this.pending.set(null);
      else this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private async run(kind: Pending): Promise<boolean> {
    const player = this.player();
    if (kind === 'grant') {
      return Object.keys(this.squad.save({ ...draftFromPlayer(player), consentStatus: 'granted', consentDate: todayIso() })).length === 0;
    }
    if (kind === 'status') {
      return Object.keys(this.squad.save({ ...draftFromPlayer(player), status: 'Fit', injuryUntil: '' })).length === 0;
    }
    if (kind === 'absences') {
      for (const absence of [...this.records.absences()]) if (!(await this.absences.deleteAbsence(absence.id))) return false;
      return true;
    }
    for (const measurement of [...this.records.measurementList()]) if (!(await this.measurements.deleteMeasurement(measurement.id))) return false;
    return true;
  }

  protected print(): void {
    this.files.print(consentPrintHtml(this.team.title(), this.player().name), CONSENT_PRINT_CSS);
  }
}
