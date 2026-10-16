import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  EVENT_TYPES,
  type EventDraft,
  type EventErrors,
  INTENSITIES,
  MAX_MATCH_DURATION,
  MAX_NOTES_LENGTH,
  MAX_SCORE,
  MAX_TEXT_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_TRAINING_DURATION,
  type TeamEvent,
  TRAINING_FOCUSES,
  draftFromEvent,
  emptyDraft,
} from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import { type GeocodedPlace, GeocodingService, GEOCODING_MIN_QUERY, coordsFromPlace, geocodingMessage, placeLabel } from '../../core/geocoding/geocoding.service';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Event anlegen/bearbeiten. Spielfelder (Gegner, Dauer, Ergebnis) erscheinen nur bei Spielen, Trainingsfokus nur bei Trainings. */
@Component({
  selector: 'tk-event-dialog',
  imports: [Dialog, Button],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDialog {
  private readonly events = inject(EventsService);
  private readonly geocoding = inject(GeocodingService);
  private readonly settings = inject(TeamSettingsService);

  readonly open = input(false);
  /** Zu bearbeitendes Event; leer = neues Event anlegen. */
  readonly event = input<TeamEvent | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<TeamEvent>();

  protected readonly types = EVENT_TYPES;
  protected readonly intensities = INTENSITIES;
  protected readonly focuses = TRAINING_FOCUSES;
  protected readonly limits = { title: MAX_TITLE_LENGTH, text: MAX_TEXT_LENGTH, notes: MAX_NOTES_LENGTH, score: MAX_SCORE, duration: MAX_MATCH_DURATION, trainingDuration: MAX_TRAINING_DURATION };

  protected readonly draft = signal<EventDraft>(emptyDraft(todayIso()));
  protected readonly errors = signal<EventErrors>({});
  protected readonly editing = computed(() => this.event() !== null);
  protected readonly title = computed(() => (this.editing() ? 'Event bearbeiten' : 'Event anlegen'));

  /** Ortssuche: Treffer, Zustand und Meldung. Gesucht wird nur auf Klick, nie beim Tippen. */
  protected readonly places = signal<readonly GeocodedPlace[]>([]);
  protected readonly searchState = signal<'idle' | 'searching' | 'done'>('idle');
  protected readonly searchError = signal('');
  protected readonly defaultLocation = this.settings.defaultLocation;
  protected readonly canSearch = computed(() => this.draft().location.trim().length >= GEOCODING_MIN_QUERY && this.searchState() !== 'searching');
  protected readonly canSaveDefault = computed(() => this.draft().location.trim() !== '' || this.draft().locationCoords !== null);
  protected readonly label = placeLabel;
  private searchRun = 0;

  constructor() {
    // Beim Öffnen frisch befüllen: bearbeiten = Werte des Events, anlegen = Standardwerte mit heutigem Datum
    // und – falls festgelegt – dem Standardort des Teams.
    effect(() => {
      if (!this.open()) return;
      const event = this.event();
      untracked(() => {
        this.settings.start();
        this.draft.set(event ? draftFromEvent(event) : this.withDefaultLocation(emptyDraft(todayIso())));
        this.errors.set({});
        this.resetSearch();
      });
    });
    // Der Standardort kann erst nach dem Öffnen eintreffen: nur einsetzen, solange noch kein Ort eingegeben wurde.
    effect(() => {
      const fallback = this.defaultLocation();
      if (!this.open() || this.event() !== null || fallback === null) return;
      untracked(() => {
        const draft = this.draft();
        if (draft.location === '' && draft.locationCoords === null) this.draft.set(this.withDefaultLocation(draft));
      });
    });
  }

  private withDefaultLocation(draft: EventDraft): EventDraft {
    const fallback = this.defaultLocation();
    return fallback ? { ...draft, location: fallback.text, locationCoords: fallback.coords } : draft;
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
    if (run !== this.searchRun) return; // Dialog wurde inzwischen neu geöffnet
    this.searchState.set('done');
    if (result.status === 'ok') this.places.set(result.places);
    else this.searchError.set(geocodingMessage(result.reason));
  }

  protected choosePlace(place: GeocodedPlace): void {
    const draft = this.draft();
    // Der Ortstext des Trainers (z. B. „Hauptplatz“) bleibt; nur ein leeres Feld wird mit dem Treffernamen gefüllt.
    this.patch({ locationCoords: coordsFromPlace(place), location: draft.location.trim() === '' ? place.name.slice(0, MAX_TEXT_LENGTH) : draft.location });
    this.resetSearch();
  }

  protected removeCoords(): void {
    this.patch({ locationCoords: null });
  }

  protected saveAsDefault(): void {
    const draft = this.draft();
    this.settings.saveDefaultLocation({ text: draft.location.trim().slice(0, MAX_TEXT_LENGTH), coords: draft.locationCoords });
  }

  protected clearDefault(): void {
    this.settings.saveDefaultLocation(null);
  }

  protected patch(change: Partial<EventDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.events.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }

  protected askDelete(): void {
    const event = this.event();
    if (event) this.deleteRequested.emit(event);
  }
}
