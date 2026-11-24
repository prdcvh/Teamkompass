import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import {
  BEHAVIOR_CRITERIA,
  type EvidenceEvent,
  MAX_EVIDENCE,
  MAX_OPPORTUNITIES,
  type ObservationDraft,
  type ObservationErrors,
  criterionById,
} from '../../core/observations/behavior-observation';
import { BehaviorObservationsService } from '../../core/observations/behavior-observations.service';
import { addDays, todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Beobachtung mit Verhaltensanker eintragen (SCRUM-268): Kriterium, Stufe über die Verhaltensbeschreibung (1–5 mit
 * Beispiel), Beobachtungszeitraum, Zahl der Gelegenheiten und optional ein Beleg (Termin, kurzes Beispiel). Datum,
 * Name und Konto des Trainers trägt die App ein.
 */
@Component({
  selector: 'tk-behavior-observation-dialog',
  imports: [Dialog, Button],
  styleUrls: ['./record-dialogs.css', './behavior-observation-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" title="Beobachtung eintragen" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <p class="hint">
          Eingetragen von: <strong>{{ service.author() }}</strong> · Quelle: Trainereinschätzung · Datum: heute. Beschreibe, was du im Zeitraum
          <em>gesehen</em> hast – keine Eigenschaft, kein Urteil über die Person. Nur für Trainer sichtbar.
        </p>
        <div class="field">
          <label class="tk-label">
            Kriterium
            <select class="tk-input" name="criterionId" [value]="draft().criterionId" [attr.aria-invalid]="errors().criterionId ? 'true' : null" (change)="patch({ criterionId: value($event), value: null })">
              @for (criterion of criteria; track criterion.id) {
                <option [value]="criterion.id" [selected]="draft().criterionId === criterion.id">{{ criterion.label }}</option>
              }
            </select>
          </label>
          @if (errors().criterionId) { <span class="error" role="alert">{{ errors().criterionId }}</span> }
        </div>
        @if (criterion(); as c) {
          <fieldset class="anchors" [attr.aria-invalid]="errors().value ? 'true' : null">
            <legend class="tk-label">Was trifft das beobachtete Verhalten am besten?</legend>
            <p class="hint">{{ c.question }}</p>
            @for (anchor of c.anchors; track $index) {
              <label class="anchor" [attr.data-selected]="draft().value === $index + 1">
                <input type="radio" name="value" [value]="$index + 1" [checked]="draft().value === $index + 1" (change)="patch({ value: $index + 1 })" />
                <span class="level">Stufe {{ $index + 1 }}</span>
                <span class="text">{{ anchor.text }}<small>Beispiel: {{ anchor.example }}</small></span>
              </label>
            }
          </fieldset>
          @if (errors().value) { <span class="error" role="alert">{{ errors().value }}</span> }
        }
        <div class="grid">
          <div class="field">
            <label class="tk-label">
              Beobachtet von
              <input class="tk-input" name="periodFrom" type="date" [attr.max]="today" [value]="draft().periodFrom" [attr.aria-invalid]="errors().periodFrom ? 'true' : null" (input)="patch({ periodFrom: value($event) })" />
            </label>
            @if (errors().periodFrom) { <span class="error" role="alert">{{ errors().periodFrom }}</span> }
          </div>
          <div class="field">
            <label class="tk-label">
              bis
              <input class="tk-input" name="periodTo" type="date" [attr.max]="today" [value]="draft().periodTo" [attr.aria-invalid]="errors().periodTo ? 'true' : null" (input)="patch({ periodTo: value($event) })" />
            </label>
            @if (errors().periodTo) { <span class="error" role="alert">{{ errors().periodTo }}</span> }
          </div>
        </div>
        <div class="field">
          <label class="tk-label">
            Konkrete Beobachtungsgelegenheiten
            <input class="tk-input" name="opportunities" type="number" inputmode="numeric" min="1" [attr.max]="maxOpportunities" [value]="draft().opportunities"
              [attr.aria-invalid]="errors().opportunities ? 'true' : null" (input)="patch({ opportunities: value($event) })" />
          </label>
          <p class="hint">Wie oft hast du die Situation wirklich gesehen (z. B. 4 Fehler im Spiel, 3 Korrekturen im Training)?</p>
          @if (errors().opportunities) { <span class="error" role="alert">{{ errors().opportunities }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Beleg: Termin (optional)
            <select class="tk-input" name="eventId" [value]="draft().eventId" [attr.aria-invalid]="errors().eventId ? 'true' : null" (change)="patch({ eventId: value($event) })">
              <option value="" [selected]="!draft().eventId">Kein bestimmter Termin</option>
              @for (event of eventOptions(); track event.id) {
                <option [value]="event.id" [selected]="draft().eventId === event.id">{{ formatDate(event.date) }} · {{ event.title }}</option>
              }
            </select>
          </label>
          @if (errors().eventId) { <span class="error" role="alert">{{ errors().eventId }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Beleg: konkretes Beispiel (optional)
            <textarea class="tk-input" name="evidence" rows="2" [attr.maxlength]="maxEvidence" placeholder="z. B. nach dem 0:1 sofort den Ball gefordert und angetrieben"
              [value]="draft().evidence" [attr.aria-invalid]="errors().evidence ? 'true' : null" (input)="patch({ evidence: value($event) })"></textarea>
          </label>
          <p class="hint">Nur beobachtbares Verhalten, keine Gesundheits- oder Familienangaben.</p>
          @if (errors().evidence) { <span class="error" role="alert">{{ errors().evidence }}</span> }
        </div>
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary" [disabled]="busy()">{{ busy() ? 'Speichert …' : 'Speichern' }}</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class BehaviorObservationDialog {
  protected readonly service = inject(BehaviorObservationsService);
  readonly open = input(false);
  /** Vorgewähltes Kriterium. */
  readonly criterionId = input('');
  /** Termine des Spielers als mögliche Belege. */
  readonly events = input.required<readonly EvidenceEvent[]>();
  readonly closed = output<void>();

  protected readonly criteria = BEHAVIOR_CRITERIA;
  protected readonly today = todayIso();
  protected readonly maxEvidence = MAX_EVIDENCE;
  protected readonly maxOpportunities = MAX_OPPORTUNITIES;
  protected readonly formatDate = formatDate;
  protected readonly draft = signal<ObservationDraft>(this.emptyDraft(''));
  protected readonly errors = signal<ObservationErrors>({});
  protected readonly busy = signal(false);
  protected readonly criterion = computed(() => criterionById(this.draft().criterionId));
  /** Termine im gewählten Zeitraum (bei ungültigem Zeitraum alle bis heute), neueste zuerst. */
  protected readonly eventOptions = computed(() => {
    const { periodFrom, periodTo } = this.draft();
    return [...this.events()]
      .filter((event) => event.date <= this.today && (!periodFrom || event.date >= periodFrom) && (!periodTo || event.date <= periodTo))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const criterionId = this.criterionId();
      untracked(() => {
        this.draft.set(this.emptyDraft(criterionId));
        this.errors.set({});
      });
    });
  }

  private emptyDraft(criterionId: string): ObservationDraft {
    const today = todayIso();
    return { criterionId: criterionById(criterionId)?.id ?? BEHAVIOR_CRITERIA[0].id, value: null, periodFrom: addDays(today, -27), periodTo: today, opportunities: '', eventId: '', evidence: '' };
  }

  protected patch(change: Partial<ObservationDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    const errors = await this.service.save(this.draft(), this.events());
    this.busy.set(false);
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
