import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  EVENT_TYPES,
  type EventDraft,
  type EventErrors,
  EXERTIONS,
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
import { type Opponent, opponentNameKey } from '../../core/opponents/opponent';
import { OpponentsService } from '../../core/opponents/opponents.service';
import { type GeocodedPlace, GeocodingService, GEOCODING_MIN_QUERY, coordsFromPlace, geocodingMessage, placeLabel } from '../../core/geocoding/geocoding.service';
import { TEAM_HOME_LOCATION } from '../../core/team-settings/team-settings';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Event anlegen/bearbeiten. Die Leseansicht („Anschauen“, SCRUM-144) steht seit SCRUM-285 als Eventdetails oben auf
 * der Bewertungsseite; deren Stift öffnet diesen Dialog direkt mit dem Formular. Speichern und Abbrechen schließen ihn.
 * Spielfelder (Gegner, Dauer, Ergebnis) erscheinen nur bei Spielen, Trainingsfokus nur bei Trainings. */
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
  private readonly opponents = inject(OpponentsService);

  readonly open = input(false);
  /** Zu bearbeitendes Event; leer = neues Event anlegen. */
  readonly event = input<TeamEvent | null>(null);
  readonly closed = output<void>();
  readonly deleteRequested = output<TeamEvent>();

  protected readonly types = EVENT_TYPES;
  protected readonly exertions = EXERTIONS;
  protected readonly focuses = TRAINING_FOCUSES;
  protected readonly limits = { title: MAX_TITLE_LENGTH, text: MAX_TEXT_LENGTH, notes: MAX_NOTES_LENGTH, score: MAX_SCORE, duration: MAX_MATCH_DURATION, trainingDuration: MAX_TRAINING_DURATION };

  protected readonly draft = signal<EventDraft>(emptyDraft(todayIso()));
  protected readonly errors = signal<EventErrors>({});
  protected readonly editing = computed(() => this.event() !== null);
  protected readonly title = computed(() => (this.editing() ? 'Event bearbeiten' : 'Event anlegen'));

  /** Gegnerprofile zur Auswahl (nur Trainer bekommen sie geladen, sonst leer). */
  protected readonly profiles = computed(() => [...this.opponents.opponents()].sort((a, b) => a.name.localeCompare(b.name, 'de')));
  /** Ortssuche: Treffer, Zustand und Meldung. Gesucht wird nur auf Klick, nie beim Tippen. */
  protected readonly places = signal<readonly GeocodedPlace[]>([]);
  protected readonly searchState = signal<'idle' | 'searching' | 'done'>('idle');
  protected readonly searchError = signal('');
  /** Ohne gewählten Ort zeigt das Wetter den Standardort des Teams (SCRUM-153). */
  protected readonly homeName = TEAM_HOME_LOCATION.name;
  protected readonly canSearch = computed(() => this.draft().location.trim().length >= GEOCODING_MIN_QUERY && this.searchState() !== 'searching');
  protected readonly label = placeLabel;
  private searchRun = 0;

  constructor() {
    // Beim Öffnen frisch befüllen: bearbeiten = Werte des Events, anlegen = Standardwerte mit heutigem Datum.
    effect(() => {
      if (!this.open()) return;
      const event = this.event();
      untracked(() => {
        this.opponents.start(); // startet nur für Trainer
        this.draft.set(event ? draftFromEvent(event) : emptyDraft(todayIso()));
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

  protected chooseProfile(id: string): void {
    const profile: Opponent | undefined = this.opponents.opponents().find((entry) => entry.id === id);
    this.patch(profile ? { opponentId: profile.id, opponent: profile.name.slice(0, MAX_TEXT_LENGTH) } : { opponentId: '' });
  }

  /** Wird der Name von Hand geändert und passt nicht mehr zum gewählten Profil, löst sich die Zuordnung. */
  protected changeOpponentText(text: string): void {
    const draft = this.draft();
    const profile = draft.opponentId ? this.opponents.opponents().find((entry) => entry.id === draft.opponentId) : undefined;
    const keep = profile !== undefined && opponentNameKey(profile.name) === opponentNameKey(text);
    this.patch({ opponent: text, ...(keep || !profile ? {} : { opponentId: '' }) });
  }

  protected patch(change: Partial<EventDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  /** Abbrechen verwirft die Eingaben und schließt den Dialog. */
  protected cancel(): void {
    this.resetSearch();
    this.errors.set({});
    this.closed.emit();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.events.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.closed.emit();
  }

  protected askDelete(): void {
    const event = this.event();
    if (event) this.deleteRequested.emit(event);
  }
}
