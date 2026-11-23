import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { COMPETENCE_DOMAINS, DOMAIN_HINTS, DOMAIN_LABELS, OBSERVATION_STEPS, OCCASIONS, OCCASION_LABELS, type Occasion, criteriaOf } from '../../core/competence/competence-catalog';
import { MAX_OBSERVATION_NOTE, type ObservationDraft, type ObservationErrors } from '../../core/competence/competence';
import { CompetenceService } from '../../core/competence/competence.service';
import { type TeamEvent, formatDate } from '../../core/events/event';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

const blankDraft = (): ObservationDraft => ({ date: todayIso(), occasion: 'training', eventId: '', position: '', note: '', values: {} });

/**
 * Beobachtung zum Entwicklungsraster eintragen (SCRUM-266): Tag, Anlass, optional Termin und Position, dann je
 * Kriterium höchstens eine Stufe. Was leer bleibt, gilt als nicht beobachtet (kein Wert, keine 0).
 */
@Component({
  selector: 'tk-competence-observation-dialog',
  imports: [Dialog, Button],
  styleUrl: './record-dialogs.css',
  styles: `
    fieldset {
      display: grid;
      gap: var(--tk-space-3);
      margin: 0;
      padding: var(--tk-space-3);
      border: 1px solid var(--tk-line);
      border-radius: var(--tk-radius-md);
    }
    legend {
      padding: 0 4px;
      font-weight: 700;
    }
    .anchor {
      display: block;
      color: var(--tk-muted);
      font-size: var(--tk-text-sm);
      font-weight: 400;
    }
    @media (max-width: 600px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" title="Beobachtung eintragen" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <p class="hint">Nur einstufen, was du an diesem Tag wirklich gesehen hast. Leer = nicht beobachtet. Nur für Trainer sichtbar.</p>
        <div class="grid">
          <div class="field">
            <label class="tk-label">
              Termin (optional)
              <select class="tk-input" name="eventId" data-testid="observation-event" (change)="chooseEvent(value($event))">
                <option value="" [selected]="!draft().eventId">ohne Termin</option>
                @for (event of pastEvents(); track event.id) {
                  <option [value]="event.id" [selected]="draft().eventId === event.id">{{ formatDate(event.date) }} · {{ event.type }} · {{ event.title }}</option>
                }
              </select>
            </label>
          </div>
          <div class="field">
            <label class="tk-label">
              Tag der Beobachtung
              <input class="tk-input" name="date" type="date" data-testid="observation-date" [attr.max]="today" [value]="draft().date" [attr.aria-invalid]="errors().date ? 'true' : null" (input)="patch({ date: value($event) })" />
            </label>
            @if (errors().date) { <span class="error" role="alert">{{ errors().date }}</span> }
          </div>
          <div class="field">
            <label class="tk-label">
              Anlass
              <select class="tk-input" name="occasion" data-testid="observation-occasion" (change)="patch({ occasion: occasionOf(value($event)) })">
                @for (occasion of occasions; track occasion) {
                  <option [value]="occasion" [selected]="draft().occasion === occasion">{{ occasionLabels[occasion] }}</option>
                }
              </select>
            </label>
          </div>
          <div class="field">
            <label class="tk-label">
              Position (optional)
              <select class="tk-input" name="position" data-testid="observation-position" (change)="patch({ position: value($event) })">
                <option value="" [selected]="!draft().position">keine Angabe</option>
                @for (position of positions(); track position) {
                  <option [value]="position" [selected]="draft().position === position">{{ position }}</option>
                }
              </select>
            </label>
          </div>
        </div>
        @for (domain of domains(); track domain) {
          <fieldset [attr.data-domain]="domain">
            <legend>{{ domainLabels[domain] }}</legend>
            @if (domainHints[domain]; as hint) { <p class="hint">{{ hint }}</p> }
            @for (criterion of criteriaOf(domain); track criterion.id) {
              <label class="tk-label">
                {{ criterion.label }}
                <span class="anchor">{{ criterion.anchor }}</span>
                <select class="tk-input" [attr.data-criterion]="criterion.id" (change)="setValue(criterion.id, value($event))">
                  <option value="" [selected]="!draft().values[criterion.id]">nicht beobachtet</option>
                  @for (step of steps; track step.value) {
                    <option [value]="step.value" [selected]="draft().values[criterion.id] === step.value">{{ step.label }} – {{ step.description }}</option>
                  }
                </select>
              </label>
            }
          </fieldset>
        }
        @if (errors().values) { <span class="error" role="alert">{{ errors().values }}</span> }
        <div class="field">
          <label class="tk-label">
            Notiz (optional)
            <textarea class="tk-input" name="note" rows="2" [attr.maxlength]="maxNote" placeholder="z. B. Situation, in der du es gesehen hast" [value]="draft().note" (input)="patch({ note: value($event) })"></textarea>
          </label>
          @if (errors().note) { <span class="error" role="alert">{{ errors().note }}</span> }
        </div>
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary" data-testid="observation-save" [disabled]="busy()">{{ busy() ? 'Speichert …' : 'Speichern' }}</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class CompetenceObservationDialog {
  protected readonly service = inject(CompetenceService);
  readonly open = input(false);
  readonly positions = input<readonly string[]>([]);
  readonly events = input<readonly TeamEvent[]>([]);
  readonly closed = output<void>();

  protected readonly today = todayIso();
  protected readonly maxNote = MAX_OBSERVATION_NOTE;
  protected readonly occasions = OCCASIONS;
  protected readonly occasionLabels = OCCASION_LABELS;
  protected readonly domainLabels = DOMAIN_LABELS;
  protected readonly domainHints = DOMAIN_HINTS;
  protected readonly steps = OBSERVATION_STEPS;
  protected readonly criteriaOf = criteriaOf;
  protected readonly formatDate = formatDate;
  /** Nur die Bereiche, die das Team erhebt. */
  protected readonly domains = computed(() => COMPETENCE_DOMAINS.filter((domain) => this.service.config().domains.includes(domain)));
  /** Vergangene Termine, neueste zuerst (höchstens 30). */
  protected readonly pastEvents = computed(() =>
    [...this.events()]
      .filter((event) => event.date <= this.today)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30),
  );
  protected readonly draft = signal<ObservationDraft>(blankDraft());
  protected readonly errors = signal<ObservationErrors>({});
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.draft.set(blankDraft());
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<ObservationDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  /** Ein gewählter Termin übernimmt Tag und Anlass (änderbar). */
  protected chooseEvent(id: string): void {
    const event = this.events().find((entry) => entry.id === id);
    if (!event) {
      this.patch({ eventId: '' });
      return;
    }
    this.patch({ eventId: event.id, date: event.date, occasion: event.type === 'Spiel' ? 'match' : 'training' });
  }

  protected setValue(criterionId: string, raw: string): void {
    this.draft.update((draft) => {
      const values = { ...draft.values };
      const number = Number(raw);
      if (raw && Number.isInteger(number)) values[criterionId] = number;
      else delete values[criterionId];
      return { ...draft, values };
    });
  }

  protected occasionOf(value: string): Occasion {
    return OCCASIONS.find((entry) => entry === value) ?? 'other';
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    const errors = await this.service.addObservations(this.draft());
    this.busy.set(false);
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
