import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { exertionLabel, formatDate, resultText } from '../../core/events/event';
import { EventsService } from '../../core/events/events.service';
import { LineupService } from '../../core/lineup/lineup.service';
import { lineupSummary } from '../../core/lineup/lineup';
import { LayoutService, injectNarrowViewport } from '../../core/shell/layout.service';
import { type Player, consentRevokedMessage, isConsentRevoked } from '../../core/player/player';
import {
  ATTENDANCES,
  ATTENDANCE_LABELS,
  type Attendance,
  type AttendanceTone,
  GRADE_FIELDS,
  type GradeField,
  GRADE_LABELS,
  MAX_GOALS_OR_ASSISTS,
  MAX_NOTE_LENGTH,
  RATING_VIEWS,
  type RatingField,
  type RatingView,
  attendanceTone,
  calculatedGrade,
  gradeLabel,
  matchesView,
  progress,
} from '../../core/ratings/rating';
import { RatingsService } from '../../core/ratings/ratings.service';
import { rsvpCounts, rsvpReason } from '../../core/rsvp/rsvp';
import { RsvpService } from '../../core/rsvp/rsvp.service';
import { SquadService } from '../../core/player/squad.service';
import { SyncService } from '../../core/shell/sync.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Chip, type Tone } from '../../ui/chip/chip';
import { Weather } from '../../ui/weather/weather';

const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/** Spaltenköpfe der Matrix: lange Wörter mit weichen Trennstellen, damit sie in schmalen Spalten umbrechen statt abgeschnitten zu werden. */
const GRADE_HEADERS: Readonly<Record<GradeField, string>> = {
  ...GRADE_LABELS,
  technique: 'Fehler\u00ADquote',
  tactics: 'Entschei\u00ADdungs\u00ADfindung',
  comprehension: 'Lern\u00ADfähig\u00ADkeit',
};

/**
 * Event bewerten (Figma: Bewertungsmatrix Desktop, Stepper Handy): je Spieler Anwesenheit, vier Teilnoten
 * (daraus die Gesamtnote), bei Spielen Minuten/Tore/Vorlagen, sichtbares Feedback und interne Notiz.
 */
@Component({
  selector: 'app-event-rating',
  imports: [RouterLink, Button, Card, Chip, Weather],
  templateUrl: './event-rating.html',
  styleUrl: './event-rating.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRating implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly ratings = inject(RatingsService);
  protected readonly squad = inject(SquadService);
  protected readonly eventsService = inject(EventsService);
  protected readonly sync = inject(SyncService);
  private readonly lineupService = inject(LineupService);
  private readonly rsvp = inject(RsvpService);
  private readonly layoutMobile = inject(LayoutService).isMobile;
  private readonly narrow = injectNarrowViewport();
  /** Einzelkarten-Ansicht (Handy und alles unter TABLE_MIN_WIDTH); sonst die Matrix mit allen Spalten. */
  protected readonly mobile = computed(() => this.layoutMobile() || this.narrow());

  protected readonly attendances = ATTENDANCES;
  protected readonly attendanceLabels = ATTENDANCE_LABELS;
  protected readonly gradeFields = GRADE_FIELDS;
  protected readonly gradeLabels = GRADE_LABELS;
  protected readonly gradeOptions = GRADE_OPTIONS;
  protected readonly views = RATING_VIEWS;
  protected readonly gradeHeaders = GRADE_HEADERS;
  protected readonly limits = { note: MAX_NOTE_LENGTH, goals: MAX_GOALS_OR_ASSISTS };

  private readonly eventId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), { initialValue: '' });
  protected readonly view = signal<RatingView>('all');
  protected readonly index = signal(0);

  protected readonly event = this.ratings.event;
  protected readonly isGame = computed(() => this.event()?.type === 'Spiel');
  protected readonly ready = computed(() => this.ratings.load() === 'ready' && this.squad.load() === 'ready' && this.eventsService.load() === 'ready');
  protected readonly failed = computed(() => this.ratings.load() === 'error' || this.squad.load() === 'error' || this.eventsService.load() === 'error');
  protected readonly errorText = computed(() => this.ratings.error() || this.squad.error() || this.eventsService.error());

  /** Für dieses Spiel gespeicherte Aufstellung (nur lesend, nur Trainer; fehlt sie oder lädt sie nicht, bleibt der Block weg). */
  protected readonly lineupView = computed(() => {
    const event = this.event();
    if (!event || event.type !== 'Spiel' || !this.lineupService.canWrite() || this.lineupService.load() !== 'ready') return null;
    const entry = this.lineupService.eventLineups()[event.id];
    return entry ? lineupSummary(entry.assignments, this.allPlayers()) : null;
  });

  protected readonly allPlayers = computed(() => [...this.squad.players()].sort((a, b) => a.number - b.number));
  protected readonly players = computed(() => this.allPlayers().filter((player) => matchesView(this.ratings.ratingFor(player.id), this.view())));
  protected readonly progress = computed(() => progress(this.allPlayers().map((player) => this.ratings.ratingFor(player.id))));
  protected readonly current = computed(() => this.players()[Math.min(this.index(), Math.max(0, this.players().length - 1))] ?? null);
  protected readonly currentIndex = computed(() => Math.min(this.index(), Math.max(0, this.players().length - 1)));

  /** Zu-/Absagen zu diesem Termin (SCRUM-205); nur für kommende und kürzlich vergangene Termine geladen. */
  private readonly responses = computed(() => this.rsvp.responsesFor(this.eventId()));
  protected readonly rsvpSummary = computed(() => {
    const responses = this.responses();
    return responses ? rsvpCounts(responses, this.allPlayers()) : null;
  });

  constructor() {
    // Das Event wechselt mit der Adresse: Abos neu starten, Stepper und Filter zurücksetzen.
    effect(() => {
      const id = this.eventId();
      untracked(() => {
        this.index.set(0);
        this.view.set('all');
        if (id) this.ratings.start(id);
      });
    });
  }

  ngOnInit(): void {
    this.squad.start();
    this.eventsService.start();
    this.lineupService.start(); // startet nur für Trainer
  }

  protected formatDate = formatDate;
  protected resultText = resultText;
  protected gradeLabel = gradeLabel;

  protected revoked(player: Player): boolean {
    return isConsentRevoked(player);
  }

  protected revokedMessage(player: Player): string {
    return consentRevokedMessage(player.name);
  }

  /** Schild „Zugesagt“, „Abgesagt (Eltern): Grund“ oder „Offen“ je Spieler; null, solange keine Rückmeldungen geladen sind. */
  protected rsvpBadge(player: Player): { readonly label: string; readonly tone: Tone } | null {
    const responses = this.responses();
    if (!responses) return null;
    const response = responses.get(player.id);
    if (!response) return { label: 'Offen', tone: 'neutral' };
    const by = response.by === 'parent' ? ' (Eltern)' : '';
    if (response.status === 'yes') return { label: `Zugesagt${by}`, tone: 'green' };
    const reason = rsvpReason(response.reason);
    return { label: `Abgesagt${by}${reason ? `: ${reason}` : ''}`, tone: 'red' };
  }

  protected total(player: Player): string {
    return gradeLabel(calculatedGrade(this.ratings.ratingFor(player.id)));
  }

  protected intensity(): string {
    const event = this.event();
    return event ? exertionLabel(event.exertion) : '';
  }

  protected attendanceOf(player: Player): Attendance {
    return this.ratings.ratingFor(player.id).attendance;
  }

  protected tone(player: Player): AttendanceTone {
    return attendanceTone(this.attendanceOf(player));
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected set(player: Player, field: RatingField, value: string): void {
    this.ratings.setField(player.id, field, value);
  }

  /** Punkte im Feld: leer bei 0, damit das Feld nicht mit Nullen gefüllt wirkt. */
  protected pointsText(player: Player): string {
    const points = this.ratings.pointsFor(player.id);
    return points > 0 ? String(points) : '';
  }

  /** Speichert die Punkte und zeigt im Feld den bereinigten Wert (negativ/ungültig wird zu leer = 0). */
  protected setPoints(player: Player, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ratings.setPoints(player.id, input.value);
    input.value = this.pointsText(player);
  }

  protected setNote(player: Player, value: string): void {
    this.ratings.setPrivateNote(player.id, value);
  }

  protected previous(): void {
    this.index.set(Math.max(0, this.currentIndex() - 1));
  }

  protected next(): void {
    this.index.set(Math.min(this.players().length - 1, this.currentIndex() + 1));
  }

  protected jump(value: string): void {
    this.index.set(Number(value));
  }

  protected setView(value: string): void {
    this.view.set(value as RatingView);
    this.index.set(0);
  }

  protected retry(): void {
    this.ratings.stop();
    this.ratings.start(this.eventId());
    if (this.squad.load() === 'error') {
      this.squad.stop();
      this.squad.start();
    }
    if (this.eventsService.load() === 'error') {
      this.eventsService.stop();
      this.eventsService.start();
    }
  }
}
