import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MAX_PLAN_ACTIONS, MAX_PLAN_FOCUS, MAX_PLAN_GOAL, MAX_PLAN_TEXT, PLAN_STATUSES, type DevelopmentPlan, type PlanDraft, type PlanErrors, draftFromPlan, emptyPlanDraft } from '../../core/records';
import { RecordsService } from '../../core/records.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Förderplan anlegen/bearbeiten. */
@Component({
  selector: 'tk-plan-dialog',
  imports: [Dialog, Button],
  styleUrl: './record-dialogs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <div class="field">
          <label class="tk-label">
            Schwerpunkt
            <input class="tk-input" name="focus" autocomplete="off" [attr.maxlength]="limits.focus" placeholder="z. B. erster Kontakt, Orientierung" [value]="draft().focus"
              [attr.aria-invalid]="errors().focus ? 'true' : null" [attr.aria-describedby]="errors().focus ? 'err-focus' : null" (input)="patch({ focus: value($event) })" />
          </label>
          @if (errors().focus) { <span class="error" id="err-focus" role="alert">{{ errors().focus }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Ziel
            <input class="tk-input" name="goal" autocomplete="off" [attr.maxlength]="limits.goal" placeholder="konkret beobachtbares Ziel" [value]="draft().goal"
              [attr.aria-invalid]="errors().goal ? 'true' : null" [attr.aria-describedby]="errors().goal ? 'err-goal' : null" (input)="patch({ goal: value($event) })" />
          </label>
          @if (errors().goal) { <span class="error" id="err-goal" role="alert">{{ errors().goal }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Maßnahmen
            <textarea class="tk-input" name="actions" rows="3" [attr.maxlength]="limits.actions" placeholder="Trainingsformen, Coachingpunkte, Heimaufgabe" [value]="draft().actions"
              [attr.aria-invalid]="errors().actions ? 'true' : null" (input)="patch({ actions: value($event) })"></textarea>
          </label>
          @if (errors().actions) { <span class="error" role="alert">{{ errors().actions }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Trainerreview
            <textarea class="tk-input" name="coachReview" rows="2" [attr.maxlength]="limits.text" placeholder="Beobachtung und nächster Coachingpunkt" [value]="draft().coachReview"
              [attr.aria-invalid]="errors().coachReview ? 'true' : null" (input)="patch({ coachReview: value($event) })"></textarea>
          </label>
          @if (errors().coachReview) { <span class="error" role="alert">{{ errors().coachReview }}</span> }
        </div>
        <div class="grid">
          <label class="tk-label">
            Status
            <select class="tk-input" name="status" [value]="draft().status" (change)="patch({ status: $any(value($event)) })">
              @for (status of statuses; track status) {
                <option [value]="status" [selected]="draft().status === status">{{ status }}</option>
              }
            </select>
          </label>
          <div class="field">
            <label class="tk-label">
              Zieldatum
              <input class="tk-input" name="dueDate" type="date" [value]="draft().dueDate" [attr.aria-invalid]="errors().dueDate ? 'true' : null" (input)="patch({ dueDate: value($event) })" />
            </label>
            @if (errors().dueDate) { <span class="error" role="alert">{{ errors().dueDate }}</span> }
          </div>
          <div class="field">
            <label class="tk-label">
              Review-Termin
              <input class="tk-input" name="reviewDate" type="date" [value]="draft().reviewDate" [attr.aria-invalid]="errors().reviewDate ? 'true' : null" (input)="patch({ reviewDate: value($event) })" />
            </label>
            @if (errors().reviewDate) { <span class="error" role="alert">{{ errors().reviewDate }}</span> }
          </div>
        </div>
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary">Speichern</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class PlanDialog {
  private readonly records = inject(RecordsService);
  readonly open = input(false);
  readonly plan = input<DevelopmentPlan | null>(null);
  readonly closed = output<void>();

  protected readonly statuses = PLAN_STATUSES;
  protected readonly limits = { focus: MAX_PLAN_FOCUS, goal: MAX_PLAN_GOAL, text: MAX_PLAN_TEXT, actions: MAX_PLAN_ACTIONS };
  protected readonly draft = signal<PlanDraft>(emptyPlanDraft());
  protected readonly errors = signal<PlanErrors>({});
  protected readonly title = computed(() => (this.plan() ? 'Förderplan bearbeiten' : 'Förderplan anlegen'));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const plan = this.plan();
      untracked(() => {
        this.draft.set(plan ? draftFromPlan(plan) : emptyPlanDraft());
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<PlanDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.records.savePlan(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}

