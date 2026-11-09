import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LayoutService, injectNarrowViewport } from '../../core/shell/layout.service';
import {
  EVENT_SORT_OPTIONS,
  EVENT_TYPES,
  exertionLabel,
  type EventSort,
  type EventTypeFilter,
  type TeamEvent,
  filterEvents,
  formatDate,
  resultText,
} from '../../core/events/event';
import { groupByMonth, sectionEvents } from '../../core/events/event-sections';
import { EventsService } from '../../core/events/events.service';
import { ICS_MIME_TYPE, buildIcs, calendarEvents, icsFileName } from '../../core/events/ical';
import { FileOutput } from '../../core/export/file-output';
import { CurrentTeam } from '../../core/team/current-team.service';
import { SquadService } from '../../core/player/squad.service';
import { isUpcoming, rsvpCounts, rsvpCountsText } from '../../core/rsvp/rsvp';
import { RsvpService } from '../../core/rsvp/rsvp.service';
import { PlanningService } from '../../core/planning/planning.service';
import { isSeriesEvent } from '../../core/planning/series-events';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Icon } from '../../ui/icon/icon';
import { BreakNotice } from '../../ui/break-notice/break-notice';
import { WeatherService } from '../../core/weather/weather.service';
import { Weather } from '../../ui/weather/weather';
import { WEATHER_ATTRIBUTION, berlinNow } from '../../core/weather/weather';
import { EventDeleteDialog, type EventDeleted } from './event-delete-dialog';
import { EventDialog } from './event-dialog';
import { ScheduleImportDialog } from './schedule-import-dialog';

/**
 * Events (Training/Spiel): Liste mit Suche und Typfilter, anlegen und löschen. Ein Klick auf die Kachel bzw. den Titel
 * öffnet die Bewertungsseite; dort stehen die Eventdetails mit dem Stift zum Bearbeiten (SCRUM-285).
 */
@Component({
  selector: 'app-events',
  imports: [NgTemplateOutlet, RouterLink, Button, Card, Icon, EventDialog, EventDeleteDialog, ScheduleImportDialog, Weather, BreakNotice],
  templateUrl: './events.html',
  styleUrl: './events.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Events implements OnInit {
  protected readonly events = inject(EventsService);
  protected readonly sync = inject(SyncService);
  protected readonly mobile = inject(LayoutService).isMobile;
  private readonly weather = inject(WeatherService);
  private readonly rsvp = inject(RsvpService);
  private readonly squad = inject(SquadService);
  private readonly files = inject(FileOutput);
  private readonly team = inject(CurrentTeam);
  protected readonly planning = inject(PlanningService);
  private readonly narrow = injectNarrowViewport();
  /** Kartenliste statt Tabelle: auf dem Handy und überall, wo die Tabelle nicht neben das Seitenmenü passt (SCRUM-134). */
  protected readonly cards = computed(() => this.mobile() || this.narrow());
  protected readonly source = WEATHER_ATTRIBUTION;

  protected readonly typeOptions = EVENT_TYPES;
  protected readonly sortOptions = EVENT_SORT_OPTIONS;

  protected readonly query = signal('');
  protected readonly type = signal<EventTypeFilter>('all');
  protected readonly sort = signal<EventSort>('chronological');

  /** „Event anlegen“; bestehende Events werden auf der Bewertungsseite bearbeitet (SCRUM-285). */
  protected readonly dialogOpen = signal(false);
  /** Spielplan-Import (SCRUM-189), nur für Trainer. */
  protected readonly importOpen = signal(false);
  protected readonly deleting = signal<TeamEvent | null>(null);
  /**
   * Hat der Trainer „Alle Termine der Serie“ gewählt, steht der Fortschritt dieser Aktion auf der Seite – auch wenn er
   * auf der Bewertungsseite gewählt wurde (dann kommt er mit `?serie-geloescht=1` hierher zurück, SCRUM-285).
   */
  protected readonly seriesDeleteStarted = signal(false);

  protected readonly pastOpen = signal(false);
  protected readonly laterOpen = signal(false);

  protected readonly visible = computed(() => filterEvents(this.events.events(), { query: this.query(), type: this.type() }));
  /** Drei Bereiche (SCRUM-140); „heute“ nach Berliner Datum, über dieselbe Uhr wie die Wetteranzeige. */
  protected readonly sections = computed(() => sectionEvents(this.visible(), this.sort(), berlinNow(this.weather.now()).date));
  protected readonly searching = computed(() => this.query().trim() !== '');
  /** Bei aktiver Suche klappen Bereiche mit Treffern von selbst auf. */
  protected readonly showPast = computed(() => this.pastOpen() || this.searching());
  protected readonly showLater = computed(() => this.laterOpen() || this.searching());
  protected readonly pastMonths = computed(() => groupByMonth(this.sections().past));
  protected readonly laterMonths = computed(() => groupByMonth(this.sections().later));
  protected readonly filtering = computed(() => this.query().trim() !== '' || this.type() !== 'all');

  /** Einstieg nach der Registrierung (SCRUM-181): /events?neu=1 öffnet direkt „Event anlegen“, sobald die Liste geladen ist. */
  private readonly startQuery = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly openOnLoad = this.startQuery.get('neu') === '1';
  private openedOnLoad = false;

  constructor() {
    if (this.startQuery.get('serie-geloescht') === '1') this.seriesDeleteStarted.set(true);
    effect(() => {
      if (!this.openOnLoad || this.openedOnLoad || !this.events.canEdit()) return;
      this.openedOnLoad = true;
      untracked(() => this.openNew());
    });
  }

  ngOnInit(): void {
    this.events.start();
  }

  /** Kalenderdatei (SCRUM-179): Zahl der kommenden Termine ab heute (Berliner Datum). */
  protected readonly calendarCount = computed(() => calendarEvents(this.events.events(), berlinNow(this.weather.now()).date).length);

  /** Lädt die kommenden Termine als .ics-Datei herunter; enthält nur Titel, Zeit und Ort, keine Personendaten. */
  protected downloadCalendar(): void {
    const now = this.weather.now();
    const ics = buildIcs(this.events.events(), { fromDate: berlinNow(now).date, now, calendarName: `TeamKompass ${this.team.name()}`.trim() });
    this.files.saveText(icsFileName(this.team.id()), ics, ICS_MIME_TYPE);
  }

  protected formatDate = formatDate;
  protected resultText = resultText;

  protected intensityLabel(event: TeamEvent): string {
    return exertionLabel(event.exertion);
  }

  /**
   * Zu-/Absagen eines kommenden Termins (SCRUM-205): „x zugesagt · y abgesagt · z offen“. Leer bei vergangenen
   * Terminen und solange Rückmeldungen oder Kader noch laden.
   */
  protected rsvpText(event: TeamEvent): string {
    if (!this.events.canWrite() || this.squad.load() !== 'ready' || !isUpcoming(event, berlinNow(this.weather.now()).date)) return '';
    const responses = this.rsvp.responsesFor(event.id);
    return responses ? rsvpCountsText(rsvpCounts(responses, this.squad.players())) : '';
  }

  /** Das Training stammt aus einer Trainingsserie (SCRUM-146). */
  protected fromSeries(event: TeamEvent): boolean {
    return isSeriesEvent(event.id);
  }

  /** „vs. Gegner · Ort“ bzw. nur der Ort. */
  protected detail(event: TeamEvent): string {
    return [event.opponent ? `vs. ${event.opponent}` : '', event.location].filter(Boolean).join(' · ');
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected openNew(): void {
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected askDelete(event: TeamEvent): void {
    this.deleting.set(event);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected onDeleted(result: EventDeleted): void {
    if (result.series) this.seriesDeleteStarted.set(true);
    this.deleting.set(null);
  }

  protected resetFilters(): void {
    this.query.set('');
    this.type.set('all');
  }

  protected retry(): void {
    this.events.stop();
    this.events.start();
  }
}
