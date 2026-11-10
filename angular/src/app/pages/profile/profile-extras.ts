import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatDate } from '../../core/events/event';
import { HEALTH_HIDDEN_TEXT } from '../../core/player/consent';
import { todayIso } from '../../core/shared/dates';
import { type Absence, absencePeriodText, absenceTitle, isInjuryAbsence } from '../../core/records/absence';
import { type Measurement, measurementQuality, measurementText, readingsText } from '../../core/records/measurement';
import { FLAG_TEXT, QUALITY_TEXT, decimalAgeAt, decimalText, legLengthCm } from '../../core/records/measurement-protocol';
import { measurementChart } from '../../core/records/measurement-chart';
import type { DevelopmentPlan } from '../../core/records/plan';
import { AbsencesService } from '../../core/records/absences.service';
import { MeasurementsService } from '../../core/records/measurements.service';
import { PlansService } from '../../core/records/plans.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { SessionService } from '../../core/auth/session.service';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';
import { AbsenceDialog } from './absence-dialog';
import { MaturityCard } from './maturity-card';
import { MeasurementDialog } from './measurement-dialog';
import { PlanDialog } from './plan-dialog';

type Kind = 'plan' | 'absence' | 'measurement';
interface Deleting {
  readonly kind: Kind;
  readonly id: string;
  readonly text: string;
}

/** Zusatzdaten im Profil: Förderpläne, Abwesenheiten/Verletzungen, Messwerte (mit Verlaufsdiagramm) und Reife-Kompass. */
@Component({
  selector: 'tk-profile-extras',
  imports: [FormsModule, Button, Card, Dialog, PlanDialog, AbsenceDialog, MeasurementDialog, MaturityCard],
  templateUrl: './profile-extras.html',
  styleUrls: ['./profile-extras.css', '../../ui/chart/chart.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileExtras {
  protected readonly records = inject(RecordsStateService);
  private readonly plansService = inject(PlansService);
  private readonly absencesService = inject(AbsencesService);
  private readonly measurementsService = inject(MeasurementsService);
  private readonly sync = inject(SyncService);
  private readonly session = inject(SessionService);

  /** Anzeigeseitig: nur Trainer sehen Schaltflächen zum Ändern. */
  readonly editable = input(true);
  /** Förderpläne anzeigen (die medizinische Rolle darf sie nicht lesen). */
  readonly showPlans = input(true);
  /** Warntext bei widerrufener Einwilligung (leer = keine Warnung); blockiert nichts. */
  readonly consentWarning = input('');
  /**
   * Fremder Verein ohne dokumentierte Einwilligung (SCRUM-245): Hinweistext; Abwesenheiten und Messwerte lassen sich
   * dann nicht anlegen oder ändern (die Regeln sperren es), nur löschen. Leer = keine Sperre.
   */
  readonly healthLocked = input('');
  /** Spieler/Eltern bei widerrufener Einwilligung: Abwesenheiten und Messwerte sind ausgeblendet (SCRUM-245). */
  readonly healthHidden = input(false);

  protected readonly plans = computed(() => [...this.records.plans()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly absences = computed(() => [...this.records.absences()].sort((a, b) => b.from.localeCompare(a.from)));
  protected readonly measurementsNewestFirst = computed(() => [...this.measurementsService.measurements()].reverse());
  protected readonly chart = computed(() => measurementChart(this.measurementsService.measurements(), todayIso()));
  protected readonly canEdit = computed(() => this.editable() && this.records.canWrite());
  /** Abwesenheiten/Messwerte anlegen und ändern: nicht bei gesperrten Gesundheitsdaten (löschen geht immer). */
  protected readonly canEditHealth = computed(() => this.canEdit() && !this.healthLocked());
  protected readonly hiddenText = HEALTH_HIDDEN_TEXT;
  /**
   * Einzelmessungen, Sitzhöhe, Beinlänge, Prüfhinweise und Änderungsprotokoll (SCRUM-253): nur Trainer und Medizin –
   * genau die Rollen, die Messwerte heute erfassen bzw. fachlich auswerten. Spieler/Eltern sehen wie bisher die
   * verwendeten Werte, dazu nur das Qualitätskennzeichen.
   */
  protected readonly showDetails = computed(() => this.canEdit() || this.session.role() === 'physio');

  /** Nur der Spieler selbst schreibt die Selbstreflexion (Eltern lesen nur). */
  protected readonly canReflect = computed(() => this.session.role() === 'player');
  protected readonly reflections = signal<Readonly<Record<string, string>>>({});
  protected readonly reflectionBusy = signal('');
  protected readonly reflectionFailed = signal('');

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
  protected readonly qualityText = QUALITY_TEXT;
  protected readonly flagText = FLAG_TEXT;
  protected quality = measurementQuality;

  /** Zeile unter den Werten: Qualität, Uhrzeit, Messstation. */
  protected measurementMeta(measurement: Measurement): string {
    return [QUALITY_TEXT[measurementQuality(measurement)], measurement.time ? `${measurement.time} Uhr` : '', measurement.station ?? ''].filter(Boolean).join(' · ');
  }

  /** Einzelmessungen, Sitzhöhe, Beinlänge und Alter am Messtag (nur Trainer/Medizin). */
  protected measurementDetails(measurement: Measurement): string[] {
    const lines: string[] = [];
    if (measurement.heightReadings?.length) lines.push(`Größe gemessen: ${readingsText(measurement.heightReadings)} cm`);
    if (measurement.weightReadings?.length) lines.push(`Gewicht gemessen: ${readingsText(measurement.weightReadings)} kg`);
    if (measurement.sittingHeight) {
      const raw = readingsText(measurement.sittingReadings);
      const box = measurement.sittingBoxCm ? ` (abgelesen ${raw} cm, Sitzkasten ${decimalText(measurement.sittingBoxCm)} cm abgezogen)` : raw ? ` (gemessen ${raw} cm)` : '';
      lines.push(`Sitzhöhe: ${decimalText(measurement.sittingHeight)} cm${box}`);
      const spread = measurement.flags?.some((flag) => flag === 'height-spread' || flag === 'sitting-spread');
      const leg = spread ? null : legLengthCm(measurement.height, measurement.sittingHeight);
      if (leg !== null) lines.push(`Beinlänge: ${decimalText(leg)} cm`);
    }
    const age = decimalAgeAt(this.measurementsService.birthdate(), measurement.date);
    if (age !== null) lines.push(`Alter am Messtag: ${decimalText(age)} Jahre`);
    return lines;
  }

  /** Änderungsprotokoll: wann, warum, was vorher galt. */
  protected changeText(change: NonNullable<Measurement['changes']>[number]): string {
    const at = new Date(change.at);
    const when = Number.isNaN(at.getTime())
      ? change.at
      : `${String(at.getDate()).padStart(2, '0')}.${String(at.getMonth() + 1).padStart(2, '0')}.${at.getFullYear()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    const before = measurementText({ id: '', date: '', height: change.before.height, weight: change.before.weight });
    const sitting = change.before.sittingHeight ? ` · Sitzhöhe ${decimalText(change.before.sittingHeight)} cm` : '';
    return `Geändert am ${when}: ${change.reason} (vorher ${before}${sitting})`;
  }
  protected isInjury = isInjuryAbsence;

  protected reflectionText(plan: DevelopmentPlan): string {
    return this.reflections()[plan.id] ?? plan.selfReflection;
  }

  protected editReflection(plan: DevelopmentPlan, text: string): void {
    this.reflections.update((map) => ({ ...map, [plan.id]: text }));
  }

  protected async saveReflection(plan: DevelopmentPlan): Promise<void> {
    if (this.reflectionBusy()) return;
    this.reflectionBusy.set(plan.id);
    this.reflectionFailed.set('');
    try {
      const ok = await this.plansService.saveSelfReflection(plan.id, this.reflectionText(plan));
      if (!ok) this.reflectionFailed.set(plan.id);
      else this.reflections.update((map) => Object.fromEntries(Object.entries(map).filter(([id]) => id !== plan.id)));
    } finally {
      this.reflectionBusy.set('');
    }
  }

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
          ? await this.plansService.deletePlan(target.id)
          : target.kind === 'absence'
            ? await this.absencesService.deleteAbsence(target.id)
            : await this.measurementsService.deleteMeasurement(target.id);
      if (ok) this.deleting.set(null);
      else this.deleteFailed.set(true);
    } finally {
      this.deleteBusy.set(false);
    }
  }

  /** Springt zum Abschnitt „Einwilligung“ im Profil. */
  protected showConsent(): void {
    const target = document.getElementById('einwilligung');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  }

  protected get syncFailed(): boolean {
    return this.sync.isFailed();
  }
}
