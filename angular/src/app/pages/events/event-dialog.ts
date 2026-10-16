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
  formatDate,
  resultText,
} from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import { type GeocodedPlace, GeocodingService, GEOCODING_MIN_QUERY, coordsFromPlace, geocodingMessage, placeLabel } from '../../core/geocoding/geocoding.service';
import { TEAM_HOME_LOCATION } from '../../core/team-settings/team-settings';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';

/**
 * Event ansehen/anlegen/bearbeiten. Bestehende Events öffnen zuerst die Leseansicht; der Stift (nur Trainer)
 * schaltet in den Bearbeiten-Modus (SCRUM-144). Neue Events öffnen direkt das Formular.
 * Spielfelder (Gegner, Dauer, Ergebnis) erscheinen nur bei Spielen, Trainingsfokus nur bei Trainings. */
@Component({
  selector: 'tk-event-dialog',
  imports: [Dialog, Button, Icon],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDialog {
  private readonly events = inject(EventsService);
  private readonly geocoding = inject(GeocodingService);

  readonly open = input(false);
  /** Zu bearbeitendes Event; leer = neues Event anlegen. */
  readonly event = input<TeamEvent | null>(null);
  /** Nur Trainer dürfen vom Ansehen ins Bearbeiten wechseln. */
  readonly canEdit = input(false);
  readonly closed = output<void>();
  readonly deleteRequested = output<TeamEvent>();

  protected readonly types = EVENT_TYPES;
  protected readonly intensities = INTENSITIES;
  protected readonly focuses = TRAINING_FOCUSES;
  protected readonly limits = { title: MAX_TITLE_LENGTH, text: MAX_TEXT_LENGTH, notes: MAX_NOTES_LENGTH, score: MAX_SCORE, duration: MAX_MATCH_DURATION, trainingDuration: MAX_TRAINING_DURATION };

  protected readonly draft = signal<EventDraft>(emptyDraft(todayIso()));
  protected readonly errors = signal<EventErrors>({});
  protected readonly editing = computed(() => this.event() !== null);
  /** true = Formular zeigen (neues Event oder Stift gedrückt), false = Leseansicht. */
  protected readonly formMode = signal(true);
  protected readonly viewing = computed(() => this.editing() && (!this.formMode() || !this.canEdit()));
  protected readonly title = computed(() => (this.viewing() ? 'Event ansehen' : this.editing() ? 'Event bearbeiten' : 'Event anlegen'));
  /** Anzeigewerte: nach dem Speichern das aktuelle Event aus dem Service, sonst das übergebene. */
  protected readonly shown = computed(() => {
    const event = this.event();
    return event ? (this.events.events().find((entry) => entry.id === event.id) ?? event) : null;
  });
  /** Nur gefüllte Felder, in fester Reihenfolge; Notizen getrennt, damit sie Zeilenumbrüche behalten. */
  protected readonly facts = computed(() => {
    const event = this.shown();
    if (!event) return [];
    const duration = event.type === 'Spiel' ? event.matchDuration : event.durationMinutes;
    const rows: { label: string; value: string }[] = [
      { label: 'Typ', value: event.type },
      { label: 'Titel', value: event.title },
      { label: 'Datum', value: formatDate(event.date) },
      { label: 'Startzeit', value: event.startTime ? `${event.startTime} Uhr` : '' },
      { label: 'Dauer', value: duration ? `${duration} Minuten` : '' },
      { label: 'Ort', value: event.location },
      { label: 'Gegner', value: event.type === 'Spiel' ? event.opponent : '' },
      { label: 'Ergebnis', value: resultText(event) },
      { label: 'Intensität', value: INTENSITIES.find((entry) => entry.value === event.intensity)?.label ?? '' },
      { label: 'Trainingsschwerpunkt', value: event.type === 'Training' ? event.trainingFocus : '' },
    ];
    return rows.filter((row) => row.value.trim() !== '');
  });

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
        this.formMode.set(event === null);
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

  protected patch(change: Partial<EventDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected startEdit(): void {
    const event = this.shown();
    if (!this.canEdit() || !event) return;
    this.draft.set(draftFromEvent(event));
    this.errors.set({});
    this.resetSearch();
    this.formMode.set(true);
  }

  /** Abbrechen: bei bestehenden Events zurück in die Leseansicht (Eingaben verworfen), bei neuen Events schließen. */
  protected cancel(): void {
    if (!this.editing()) {
      this.closed.emit();
      return;
    }
    this.resetSearch();
    this.errors.set({});
    this.formMode.set(false);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.events.save(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;
    if (this.editing()) this.formMode.set(false);
    else this.closed.emit();
  }

  protected askDelete(): void {
    const event = this.event();
    if (event) this.deleteRequested.emit(event);
  }
}
