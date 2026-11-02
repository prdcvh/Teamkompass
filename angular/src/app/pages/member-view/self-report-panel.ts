import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { injuryRisk } from '../../core/analysis/risk';
import { SessionService } from '../../core/auth/session.service';
import { EXERTIONS, type TeamEvent, formatDate } from '../../core/events/event';
import type { Player } from '../../core/player/player';
import { ProfileService } from '../../core/profile/profile.service';
import { MeasurementsService } from '../../core/records/measurements.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import {
  SELF_REPORT_NOTICE,
  WELLNESS_FIELDS,
  WELLNESS_NOTICE,
  WELLNESS_QUESTIONS,
  type WellnessAnswers,
  type WellnessField,
  openReportItems,
  reportWindow,
  wellnessOptions,
} from '../../core/self-report/self-report';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { addDays } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * „Wie anstrengend war das heute?“ für Spieler und Eltern (SCRUM-138): je Termin mit Teilnahme ab dessen Ende bis
 * zum Ende des Folgetags. Dazu – nur mit dokumentierter Einwilligung – 4 freiwillige Fragen zum Befinden, und die
 * eigene Wochenbelastung (letzte 7 Tage gegen den eigenen Schnitt). Andere Rollen sehen hier nichts.
 */
@Component({
  selector: 'tk-self-report-panel',
  imports: [Button, Card],
  templateUrl: './self-report-panel.html',
  styleUrl: './self-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelfReportPanel {
  readonly player = input.required<Player>();

  protected readonly reports = inject(SelfReportsService);
  private readonly profile = inject(ProfileService);
  private readonly records = inject(RecordsStateService);
  private readonly measurements = inject(MeasurementsService);
  private readonly session = inject(SessionService);

  /** Uhr der Anzeige; jede Minute neu, damit eine Frage zur richtigen Zeit erscheint bzw. verschwindet. */
  protected readonly now = signal(new Date());
  protected readonly parent = computed(() => this.session.role() === 'parent');
  /** Befindensfragen nur mit dokumentierter Einwilligung (PO 02.11.2026, SCRUM-173). */
  protected readonly askWellness = computed(() => this.player().consentStatus === 'granted');
  /** Fragen nur zeigen, wenn das Befinden auch gelesen (und damit gespeichert) werden kann. */
  protected readonly showWellness = computed(() => this.askWellness() && this.reports.wellnessReadable());
  protected readonly notice = computed(() => (this.showWellness() ? `${SELF_REPORT_NOTICE} ${WELLNESS_NOTICE}` : SELF_REPORT_NOTICE));
  protected readonly open = computed(() => (this.reports.loaded() ? openReportItems(this.profile.items(), this.now()) : []));
  protected readonly exertions = EXERTIONS;
  protected readonly fields = WELLNESS_FIELDS;
  protected readonly questions = WELLNESS_QUESTIONS;
  protected readonly options = wellnessOptions;
  /** Gerade gespeicherte Termine (für „Gespeichert“). */
  protected readonly saved = signal<ReadonlySet<string>>(new Set());

  /** Eigene Wochenbelastung (Minuten × Anstrengung), gleiche Rechnung wie die Ampel des Trainers. */
  protected readonly week = computed(() => {
    if (!this.records.ready() || this.profile.loading()) return null;
    const risk = injuryRisk(this.player(), this.profile.items(), this.records.absences(), this.measurements.measurements(), this.now());
    return { load: Math.round(risk.load), baseline: Math.round(risk.baseline) };
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected title(event: TeamEvent): string {
    return event.title || event.type;
  }

  protected detail(event: TeamEvent): string {
    return [formatDate(event.date) + (event.startTime ? `, ${event.startTime} Uhr` : ''), event.type].join(' · ');
  }

  /** „offen bis Mittwoch, 04.11.“ (Ende des Folgetags). */
  protected until(event: TeamEvent): string {
    const window = reportWindow(event);
    if (!window) return '';
    const last = addDays(event.date, 1);
    const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${last}T12:00:00Z`));
    return `Offen bis ${weekday}, ${formatDate(last).slice(0, 6)} um 24 Uhr`;
  }

  protected exertionOf(event: TeamEvent): number | null {
    return this.reports.reports().get(event.id)?.exertion ?? null;
  }

  protected wellnessOf(event: TeamEvent, field: WellnessField): number | null {
    return this.reports.wellness().get(event.id)?.[field] ?? null;
  }

  protected number = (value: number) => value.toLocaleString('de-DE');

  protected submit(domEvent: Event, event: TeamEvent): void {
    domEvent.preventDefault();
    const form = domEvent.target as HTMLFormElement;
    const read = (name: string) => {
      const value = (form.elements.namedItem(name) as HTMLSelectElement | null)?.value ?? '';
      return value === '' ? null : Number(value);
    };
    const exertion = read('exertion');
    if (exertion === null) return;
    const wellness = this.showWellness() ? (Object.fromEntries(WELLNESS_FIELDS.map((field) => [field, read(field)])) as unknown as WellnessAnswers) : null;
    void this.reports.save(event, exertion, wellness).then((ok) => {
      if (ok) this.saved.update((set) => new Set(set).add(event.id));
    });
  }
}
