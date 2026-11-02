import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { EventsService } from '../../core/events/events.service';
import { type TeamEvent, exertionLabel, formatDate } from '../../core/events/event';
import { WELLNESS_FIELDS, WELLNESS_QUESTIONS, type WellnessEntry, wellnessSum, wellnessWord } from '../../core/self-report/self-report';
import { deviationHint, exertionPairs, wellnessStatus } from '../../core/self-report/self-report-hints';
import { SelfReportsService } from '../../core/self-report/self-reports.service';
import { todayIso } from '../../core/shared/dates';
import { Card } from '../../ui/card/card';

interface Row {
  readonly event: TeamEvent;
  readonly trainer: number;
  readonly player: number | null;
  readonly wellness: WellnessEntry | null;
  readonly sum: number | null;
}

const SHOWN = 8;

/**
 * Angaben des Spielers je Termin (SCRUM-138): Anstrengung (Spieler, bei `compare` auch Trainer) und Befinden mit
 * Verlauf. Trainer und Medizin sehen dazu die Hinweise („deutlich härter als geplant“, „Befinden schlechter als
 * üblich“); Spieler und Eltern sehen nur ihre eigenen Angaben.
 */
@Component({
  selector: 'tk-self-report-history',
  imports: [Card],
  templateUrl: './self-report-history.html',
  styleUrl: '../member-view/self-report.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelfReportHistory implements OnInit {
  /** Trainerwert und Hinweise zeigen (Trainer, Medizin). */
  readonly compare = input(false);
  readonly heading = input('Anstrengung und Befinden');

  protected readonly reports = inject(SelfReportsService);
  private readonly events = inject(EventsService);
  protected readonly today = todayIso();
  protected readonly all = signal(false);
  protected readonly fields = WELLNESS_FIELDS;
  protected readonly questions = WELLNESS_QUESTIONS;

  protected readonly rows = computed<Row[]>(() => {
    const reports = this.reports.reports();
    const wellness = this.reports.wellness();
    return this.events
      .events()
      .filter((event) => reports.has(event.id) || wellness.has(event.id))
      .map((event) => {
        const entry = wellness.get(event.id) ?? null;
        return { event, trainer: event.exertion, player: reports.get(event.id)?.exertion ?? null, wellness: entry, sum: entry ? wellnessSum(entry) : null };
      })
      .sort((a, b) => b.event.date.localeCompare(a.event.date) || (b.event.startTime ?? '').localeCompare(a.event.startTime ?? ''));
  });
  protected readonly shown = computed(() => (this.all() ? this.rows() : this.rows().slice(0, SHOWN)));
  protected readonly hints = computed(() => {
    if (!this.compare()) return [];
    const deviation = deviationHint(exertionPairs(this.events.events(), this.reports.reports()));
    const wellness = wellnessStatus([...this.reports.wellness().values()], this.today).hint;
    return [deviation, wellness].filter((hint): hint is string => hint !== null);
  });
  protected readonly status = computed(() => wellnessStatus([...this.reports.wellness().values()], this.today));
  /** Befindensverlauf: die letzten 12 vollständigen Antworten, älteste zuerst (Höhe = Summe 4–28). */
  protected readonly trend = computed(() =>
    this.rows()
      .filter((row) => row.sum !== null)
      .slice(0, 12)
      .reverse()
      .map((row) => ({ date: row.event.date, sum: row.sum!, percent: Math.round(((row.sum! - 4) / 24) * 100) })),
  );

  protected readonly trendLabel = computed(() => `Befindensverlauf (Summe 4 bis 28, höher ist besser): ${this.trend().map((point) => point.sum).join(', ')}`);

  ngOnInit(): void {
    // Medizin lädt sonst keine Termine (sie liest keine Bewertungen, also startet das Profil die Eventliste nicht).
    this.events.start();
  }

  protected formatDate = formatDate;
  protected exertionLabel = exertionLabel;
  protected wellnessWord = wellnessWord;

  protected wellnessText(entry: WellnessEntry): string {
    return WELLNESS_FIELDS.filter((field) => entry[field] !== null)
      .map((field) => `${WELLNESS_QUESTIONS[field].label}: ${wellnessWord(field, entry[field])}`)
      .join(' · ');
  }
}
