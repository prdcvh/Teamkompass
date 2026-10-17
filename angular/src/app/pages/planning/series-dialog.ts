import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { EXERTIONS, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, MAX_TRAINING_DURATION, TRAINING_FOCUSES } from '../../core/events/event';
import { type GeocodedPlace, GeocodingService, GEOCODING_MIN_QUERY, coordsFromPlace, geocodingMessage, placeLabel } from '../../core/geocoding/geocoding.service';
import { DEFAULT_SERIES_TITLE, MAX_SERIES_MONTHS, type SeriesDraft, type SeriesErrors, type TrainingSeries, WEEKDAYS, draftFromSeries, emptySeriesDraft } from '../../core/planning/planning';
import { PlanningService } from '../../core/planning/planning.service';
import { todayIso } from '../../core/shared/dates';
import { TEAM_HOME_LOCATION } from '../../core/team-settings/team-settings';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Trainingsserie anlegen/ändern. Der Ort ist mit dem Standardort des Teams vorbelegt; die Ortssuche läuft nur auf Klick. */
@Component({
  selector: 'tk-series-dialog',
  imports: [Dialog, Button],
  templateUrl: './series-dialog.html',
  styleUrl: './series-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesDialog {
  private readonly planning = inject(PlanningService);
  private readonly settings = inject(TeamSettingsService);
  private readonly geocoding = inject(GeocodingService);

  readonly open = input(false);
  /** Zu bearbeitende Serie; leer = neue Serie. */
  readonly series = input<TrainingSeries | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<TrainingSeries>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly exertions = EXERTIONS;
  protected readonly focuses = TRAINING_FOCUSES;
  protected readonly limits = { title: MAX_TITLE_LENGTH, text: MAX_TEXT_LENGTH, duration: MAX_TRAINING_DURATION, months: MAX_SERIES_MONTHS };
  protected readonly defaultTitle = DEFAULT_SERIES_TITLE;
  protected readonly homeName = TEAM_HOME_LOCATION.name;

  protected readonly draft = signal<SeriesDraft>(emptySeriesDraft(todayIso(), null));
  protected readonly errors = signal<SeriesErrors>({});
  protected readonly editing = computed(() => this.series() !== null);
  protected readonly heading = computed(() => (this.editing() ? 'Serie bearbeiten' : 'Serie anlegen'));

  protected readonly places = signal<readonly GeocodedPlace[]>([]);
  protected readonly searchState = signal<'idle' | 'searching' | 'done'>('idle');
  protected readonly searchError = signal('');
  protected readonly canSearch = computed(() => this.draft().location.trim().length >= GEOCODING_MIN_QUERY && this.searchState() !== 'searching');
  protected readonly label = placeLabel;
  private searchRun = 0;

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const series = this.series();
      untracked(() => {
        const defaultLocation = this.settings.defaultLocation();
        this.draft.set(series ? draftFromSeries(series) : emptySeriesDraft(todayIso(), defaultLocation));
        this.errors.set({});
        this.resetSearch();
      });
    });
  }

  private resetSearch(): void {
    this.searchRun += 1;
    this.places.set([]);
    this.searchState.set('idle');
    this.searchError.set('');
  }

  protected async searchPlaces(): Promise<void> {
    const query = this.draft().location.trim();
    if (query.length < GEOCODING_MIN_QUERY || this.searchState() === 'searching') return;
    const run = ++this.searchRun;
    this.searchState.set('searching');
    this.searchError.set('');
    this.places.set([]);
    const result = await this.geocoding.search(query, 'de');
    if (run !== this.searchRun) return;
    this.searchState.set('done');
    if (result.status === 'ok') this.places.set(result.places);
    else this.searchError.set(geocodingMessage(result.reason));
  }

  protected choosePlace(place: GeocodedPlace): void {
    const draft = this.draft();
    this.patch({ locationCoords: coordsFromPlace(place), location: draft.location.trim() === '' ? place.name.slice(0, MAX_TEXT_LENGTH) : draft.location });
    this.resetSearch();
  }

  protected patch(change: Partial<SeriesDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.planning.saveSeries(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const series = this.series();
    if (series) this.deleteRequested.emit(series);
  }
}
