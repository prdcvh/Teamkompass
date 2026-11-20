import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { CONSENT_LABELS } from '../../core/player/player';
import { SquadService } from '../../core/player/squad.service';
import { DUE_WINDOW_DAYS, GRACE_DAYS, MAX_INTERVAL_MONTHS, MIN_INTERVAL_MONTHS, PLAN_STATUS_LABELS, type PlanRow, type PlanStatus } from '../../core/records/measurement-plan';
import { MeasurementPlanService } from '../../core/records/measurement-plan.service';
import { MeasurementsService } from '../../core/records/measurements.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { formatDate } from '../../core/shared/dates';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip, type Tone } from '../../ui/chip/chip';
import { MeasurementDialog } from '../profile/measurement-dialog';

const TONES: Readonly<Record<PlanStatus, Tone>> = {
  'baseline-missing': 'blue',
  planned: 'neutral',
  due: 'amber',
  overdue: 'red',
  paused: 'neutral',
  'no-consent': 'neutral',
};

/**
 * Messplan (SCRUM-255, nur Trainer): wer wann wieder gemessen wird, und die Messrunde für den Kader, die den
 * Messassistenten (SCRUM-253) Spieler für Spieler öffnet. Wer übersprungen wird, bekommt keine Messung (keine
 * Nullwerte). Spieler ohne dokumentierte Einwilligung stehen neutral unter „Nicht im Messplan“ – ohne Termin, ohne
 * Status „überfällig“ und ohne Erinnerung. Hinweise gibt es nur auf dieser Seite, keine E-Mails.
 */
@Component({
  selector: 'app-measurement-plan',
  imports: [Button, Card, Chip, MeasurementDialog, RouterLink],
  templateUrl: './measurement-plan.html',
  styleUrl: './measurement-plan.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeasurementPlan implements OnInit, OnDestroy {
  protected readonly plan = inject(MeasurementPlanService);
  protected readonly sync = inject(SyncService);
  private readonly session = inject(SessionService);
  private readonly squad = inject(SquadService);
  private readonly records = inject(RecordsStateService);
  private readonly measurements = inject(MeasurementsService);

  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly inPlan = computed(() => this.plan.rows().filter((row) => row.status !== 'no-consent'));
  protected readonly outOfPlan = computed(() => this.plan.rows().filter((row) => row.status === 'no-consent'));

  protected readonly intervals = Array.from({ length: MAX_INTERVAL_MONTHS - MIN_INTERVAL_MONTHS + 1 }, (_, index) => MIN_INTERVAL_MONTHS + index);
  protected readonly dueWindow = DUE_WINDOW_DAYS;
  protected readonly grace = GRACE_DAYS;
  protected readonly formatDate = formatDate;
  protected readonly consentLabels = CONSENT_LABELS;
  protected readonly error = signal('');

  // --- Messrunde ----------------------------------------------------------------------------------------------
  /** Spieler der laufenden Runde (beim Start festgelegt); null = keine Runde offen. */
  protected readonly round = signal<readonly string[] | null>(null);
  protected readonly position = signal(0);
  protected readonly measured = signal<readonly string[]>([]);
  protected readonly skipped = signal<readonly string[]>([]);
  protected readonly dialogOpen = signal(false);
  private countBefore = 0;

  protected readonly currentId = computed(() => {
    const round = this.round();
    return round ? (round[this.position()] ?? null) : null;
  });
  protected readonly current = computed(() => this.plan.rows().find((row) => row.playerId === this.currentId()) ?? null);
  protected readonly finished = computed(() => this.round() !== null && this.currentId() === null);
  protected readonly recordsReady = computed(() => this.records.ready() && this.records.playerId() === this.currentId());

  constructor() {
    effect(() => {
      if (this.isTrainer() && this.squad.load() === 'ready') untracked(() => this.plan.start());
    });
    // Zusatzdaten des Spielers, der gerade dran ist (der Messassistent schreibt in dessen Messwerte).
    effect(() => {
      const id = this.currentId();
      untracked(() => (id ? this.records.start(id) : undefined));
    });
  }

  ngOnInit(): void {
    this.squad.start();
  }

  ngOnDestroy(): void {
    this.records.stop();
  }

  protected label(status: PlanStatus): string {
    return PLAN_STATUS_LABELS[status];
  }

  protected tone(status: PlanStatus): Tone {
    return TONES[status];
  }

  protected startRound(): void {
    const ids = this.plan.queue().map((row) => row.playerId);
    if (ids.length === 0) return;
    this.measured.set([]);
    this.skipped.set([]);
    this.position.set(0);
    this.round.set(ids);
  }

  protected endRound(): void {
    this.dialogOpen.set(false);
    this.round.set(null);
    this.records.stop();
  }

  protected openAssistant(): void {
    this.countBefore = this.measurements.measurements().length;
    this.dialogOpen.set(true);
  }

  protected assistantClosed(): void {
    this.dialogOpen.set(false);
    const id = this.currentId();
    if (!id) return;
    // Gespeichert, wenn eine Messung dazugekommen ist; Abbrechen lässt den Spieler offen (nichts wird geschrieben).
    if (this.measurements.measurements().length > this.countBefore) {
      this.plan.applyMeasurements(id, this.records.measurementList());
      this.measured.update((list) => [...list, id]);
      this.next();
    }
  }

  protected skip(): void {
    const id = this.currentId();
    if (!id) return;
    this.skipped.update((list) => [...list, id]);
    this.next();
  }

  private next(): void {
    this.position.update((value) => value + 1);
  }

  protected nameOf(id: string): string {
    return this.squad.players().find((player) => player.id === id)?.name ?? '';
  }

  protected setInterval(row: PlanRow, event: Event): void {
    this.error.set(this.plan.setInterval(row.playerId, Number((event.target as HTMLSelectElement).value)));
  }

  protected setDue(row: PlanRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const message = this.plan.setDueDate(row.playerId, input.value);
    this.error.set(message);
    if (message) input.value = row.nextDue ?? '';
  }

  protected clearDue(row: PlanRow): void {
    this.error.set(this.plan.setDueDate(row.playerId, ''));
  }

  protected togglePause(row: PlanRow): void {
    this.error.set(this.plan.setPaused(row.playerId, row.status !== 'paused'));
  }
}
