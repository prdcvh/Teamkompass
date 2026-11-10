import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { type TeamEvent, exertionLabel, formatDate, resultText } from '../../core/events/event';
import { DEFAULT_WARMUP_PROGRAM, WARMUP_INFO_URL, WARMUP_PROGRAMS, type WarmupProgram } from '../../core/events/warmup';
import { EventsService } from '../../core/events/events.service';
import { opponentForEvent, opponentRecord, recordText } from '../../core/opponents/opponent';
import { OpponentsService } from '../../core/opponents/opponents.service';
import { BIO_BANDING_HINT } from '../../core/records/bio-banding';
import { BioBandingService } from '../../core/records/bio-banding.service';
import { percentText } from '../../core/records/maturity';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';

/**
 * Eventdetails oben auf der Bewertungsseite (SCRUM-285, vorher die Leseansicht „Anschauen“ im Event-Dialog, SCRUM-144):
 * alle gefüllten Felder, Notizen, Aufwärmprogramm, Gegnerprofil und Bio-Banding. Der Stift (nur Trainer) meldet
 * `editRequested`; das Formular selbst ist weiterhin der Event-Dialog.
 */
@Component({
  selector: 'tk-event-details',
  imports: [Button, Icon],
  templateUrl: './event-details.html',
  styleUrl: './event-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetails {
  private readonly events = inject(EventsService);
  private readonly opponents = inject(OpponentsService);
  private readonly bioBanding = inject(BioBandingService);

  readonly event = input.required<TeamEvent>();
  /** Nur Trainer sehen den Stift, das Aufwärmprogramm, Punkte und das Gegnerprofil. */
  readonly canEdit = input(false);
  readonly editRequested = output<void>();

  protected readonly warmupPrograms = WARMUP_PROGRAMS;
  protected readonly warmupUrl = WARMUP_INFO_URL;
  protected readonly bioHint = BIO_BANDING_HINT;
  protected readonly percentText = percentText;

  /** Nur gefüllte Felder, in fester Reihenfolge; Notizen getrennt, damit sie Zeilenumbrüche behalten. */
  protected readonly facts = computed(() => {
    const event = this.event();
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
      // Punkte sehen nur Trainer.
      { label: 'Punkte vergeben', value: event.type === 'Spiel' && this.canEdit() ? (event.pointsEnabled ? 'Ja' : 'Nein') : '' },
      { label: 'Anstrengung', value: exertionLabel(event.exertion) },
      { label: 'Trainingsschwerpunkt', value: event.type === 'Training' ? event.trainingFocus : '' },
    ];
    return rows.filter((row) => row.value.trim() !== '');
  });

  protected readonly notes = computed(() => this.event().notes?.trim() ?? '');

  /** Aufwärmprogramm-Haken (SCRUM-178): nur Trainer, nur bei Trainings; zeigt das gespeicherte Programm oder null. */
  protected readonly warmup = computed(() => {
    const event = this.event();
    return event.type === 'Training' && this.canEdit() ? { program: event.warmup ?? null } : null;
  });

  /** Spiel: Matchplan, Stärken, Schwächen und Bilanz des Gegners (SCRUM-34), nur für Trainer. */
  protected readonly plan = computed(() => {
    const event = this.event();
    if (!this.canEdit()) return null;
    const list = this.opponents.opponents();
    const profile = opponentForEvent(event, list);
    if (!profile) return null;
    const details = [
      { label: 'Matchplan', value: profile.gamePlan },
      { label: 'Stärken', value: profile.strengths },
      { label: 'Schwächen', value: profile.weaknesses },
    ].filter((entry) => entry.value !== '');
    return { profile, details, recordText: recordText(opponentRecord(profile, this.events.events(), list)) };
  });

  /**
   * Bio-Banding (SCRUM-191): Vorschlag für Trainingsgruppen nach Reifestand, nur bei Trainings und nur für Trainer und
   * Medizin. Er liest je Spieler Reife-Kompass und Messwerte – deshalb erst auf Knopfdruck, nicht bei jedem Öffnen der
   * Bewertungsseite (vorher: beim Öffnen von „Anschauen“). Es wird nichts gespeichert.
   */
  protected readonly bioAvailable = computed(() => this.event().type === 'Training' && this.bioBanding.visible());
  protected readonly bioOpen = signal(false);
  private readonly bioWanted = computed(() => this.bioOpen() && this.bioAvailable());
  protected readonly bio = computed(() => (this.bioWanted() ? { state: this.bioBanding.state(), suggestion: this.bioBanding.suggestion() } : null));

  constructor() {
    untracked(() => this.opponents.start()); // startet nur für Trainer
    effect(() => {
      const wanted = this.bioWanted();
      untracked(() => {
        if (wanted) void this.bioBanding.load();
        else this.bioBanding.reset();
      });
    });
    inject(DestroyRef).onDestroy(() => this.bioBanding.reset());
  }

  protected toggleBio(): void {
    this.bioOpen.update((open) => !open);
  }

  protected retryBio(): void {
    void this.bioBanding.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected toggleWarmup(checked: boolean): void {
    this.events.setWarmup(this.event().id, checked ? DEFAULT_WARMUP_PROGRAM : null);
  }

  protected chooseWarmup(program: string): void {
    const chosen: WarmupProgram | undefined = WARMUP_PROGRAMS.find((entry) => entry === program);
    if (chosen) this.events.setWarmup(this.event().id, chosen);
  }
}
