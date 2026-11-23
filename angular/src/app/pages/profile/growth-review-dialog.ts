import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MAX_REVIEW_ACTION, type GrowthReviewDraft, type GrowthReviewErrors } from '../../core/records/growth-review';
import { GrowthReviewsService } from '../../core/records/growth-reviews.service';
import type { DevelopmentPlan } from '../../core/records/plan';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/**
 * Trainerprüfung „Wachstum und Belastung gemeinsam ansehen“ dokumentieren (SCRUM-257): Förderplan, Datum, Maßnahme.
 * Name und Konto des Trainers trägt die App ein. Die App ändert dabei nichts an Belastung, Teilnahme oder Verfügbarkeit.
 */
@Component({
  selector: 'tk-growth-review-dialog',
  imports: [Dialog, Button],
  styleUrl: './record-dialogs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" title="Prüfung dokumentieren" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <p class="muted">Geprüft von: <strong>{{ service.reviewer() }}</strong>. Die Notiz hängt am gewählten Förderplan und ist nur für Trainer sichtbar.</p>
        <div class="field">
          <label class="tk-label">
            Förderplan
            <select class="tk-input" name="planId" [value]="draft().planId" [attr.aria-invalid]="errors().planId ? 'true' : null" (change)="patch({ planId: value($event) })">
              <option value="" [selected]="!draft().planId">Bitte wählen</option>
              @for (plan of plans(); track plan.id) {
                <option [value]="plan.id" [selected]="draft().planId === plan.id">{{ plan.focus }}</option>
              }
            </select>
          </label>
          @if (errors().planId) { <span class="error" role="alert">{{ errors().planId }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Datum der Prüfung
            <input class="tk-input" name="date" type="date" [attr.max]="today" [value]="draft().date" [attr.aria-invalid]="errors().date ? 'true' : null" (input)="patch({ date: value($event) })" />
          </label>
          @if (errors().date) { <span class="error" role="alert">{{ errors().date }}</span> }
        </div>
        <div class="field">
          <label class="tk-label">
            Maßnahme
            <textarea class="tk-input" name="action" rows="3" [attr.maxlength]="maxAction" placeholder="z. B. Sprung- und Sprintumfang zwei Wochen reduziert, mit Spieler besprochen" [value]="draft().action"
              [attr.aria-invalid]="errors().action ? 'true' : null" (input)="patch({ action: value($event) })"></textarea>
          </label>
          @if (errors().action) { <span class="error" role="alert">{{ errors().action }}</span> }
        </div>
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary" [disabled]="busy()">{{ busy() ? 'Speichert …' : 'Speichern' }}</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class GrowthReviewDialog {
  protected readonly service = inject(GrowthReviewsService);
  readonly open = input(false);
  readonly hintKey = input.required<string>();
  readonly plans = input.required<readonly DevelopmentPlan[]>();
  readonly closed = output<void>();

  protected readonly today = todayIso();
  protected readonly maxAction = MAX_REVIEW_ACTION;
  protected readonly draft = signal<GrowthReviewDraft>({ planId: '', date: this.today, action: '' });
  protected readonly errors = signal<GrowthReviewErrors>({});
  protected readonly busy = signal(false);
  private readonly planIds = computed(() => this.plans().map((plan) => plan.id));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const plans = this.plans();
      untracked(() => {
        this.draft.set({ planId: plans.length === 1 ? plans[0].id : '', date: todayIso(), action: '' });
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<GrowthReviewDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    const errors = await this.service.save(this.draft(), this.hintKey(), this.planIds());
    this.busy.set(false);
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
