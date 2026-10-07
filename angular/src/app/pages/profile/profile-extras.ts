import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { formatDate } from '../../core/event';
import { todayIso } from '../../core/player';
import {
  type Absence,
  type DevelopmentPlan,
  type Measurement,
  absencePeriodText,
  absenceTitle,
  isInjuryAbsence,
  measurementChart,
  measurementText,
} from '../../core/records';
import { RecordsService } from '../../core/records.service';
import { SyncService } from '../../core/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { AbsenceDialog } from './absence-dialog';
import { MeasurementDialog } from './measurement-dialog';
import { PlanDialog } from './plan-dialog';

type Kind = 'plan' | 'absence' | 'measurement';
interface Deleting {
  readonly kind: Kind;
  readonly id: string;
  readonly text: string;
}

/** Zusatzdaten im Profil: Förderpläne, Abwesenheiten/Verletzungen und Messwerte (mit Verlaufsdiagramm). */
@Component({
  selector: 'tk-profile-extras',
  imports: [Button, Card, Dialog, PlanDialog, AbsenceDialog, MeasurementDialog],
  templateUrl: './profile-extras.html',
  styleUrl: './profile-extras.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileExtras {
  protected readonly records = inject(RecordsService);
  private readonly sync = inject(SyncService);

  /** Anzeigeseitig: nur Trainer sehen Schaltflächen zum Ändern. */
  readonly editable = input(true);
  /** Warntext bei widerrufener Einwilligung (leer = keine Warnung); blockiert nichts. */
  readonly consentWarning = input('');

  protected readonly plans = computed(() => [...this.records.plans()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly absences = computed(() => [...this.records.absences()].sort((a, b) => b.from.localeCompare(a.from)));
  protected readonly measurementsNewestFirst = computed(() => [...this.records.measurements()].reverse());
  protected readonly chart = computed(() => measurementChart(this.records.measurements(), todayIso()));
  protected readonly canEdit = computed(() => this.editable() && this.records.canWrite());

  protected readonly planDialog = signal<{ open: boolean; plan: DevelopmentPlan | null }>({ open: false, plan: null });
  protected readonly absenceDialog = signal<{ open: boolean; absence: Absence | null }>({ open: false, absence: null });
  protected readonly measurementDialog = signal<{ open: boolean; measurement: Measurement | null }>({ open: false, measurement: null });
  protected readonly deleting = signal<Deleting | null>(null);
  protected readonly deleteBusy = signal(false);
  protected readonly deleteFailed = signal(false);

  protected formatDate = formatDate;
  protected absenceTitle = absenceTitle;
  protected absencePeriodText = absencePeriodText;
  protected measurementText = measurementText;
  protected isInjury = isInjuryAbsence;

  protected planTone(plan: DevelopmentPlan): string {
    return plan.status === 'Erreicht' ? 'success' : plan.status === 'In Arbeit' ? 'warning' : '';
  }

  protected openPlan(plan: DevelopmentPlan | null): void {
    this.planDialog.set({ open: true, plan });
  }

  protected openAbsence(absence: Absence | null): void {
    this.absenceDialog.set({ open: true, absence });
  }

  protected openMeasurement(measurement: Measurement | null): void {
    this.measurementDialog.set({ open: true, measurement });
  }

  protected closePlan(): void {
    this.planDialog.update((state) => ({ ...state, open: false }));
  }

  protected closeAbsence(): void {
    this.absenceDialog.update((state) => ({ ...state, open: false }));
  }

  protected closeMeasurement(): void {
    this.measurementDialog.update((state) => ({ ...state, open: false }));
  }

  protected askDelete(kind: Kind, id: string, text: string): void {
    this.deleteFailed.set(false);
    this.deleting.set({ kind, id, text });
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (!target || this.deleteBusy()) return;
    this.deleteBusy.set(true);
    this.deleteFailed.set(false);
    try {
      const ok =
        target.kind === 'plan'
          ? await this.records.deletePlan(target.id)
          : target.kind === 'absence'
            ? await this.records.deleteAbsence(target.id)
            : await this.records.deleteMeasurement(target.id);
      if (ok) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }

  protected get syncFailed(): boolean {
    return this.sync.isFailed();
  }
}
