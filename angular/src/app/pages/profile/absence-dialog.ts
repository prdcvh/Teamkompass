import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  ABSENCE_FIXED_REASONS,
  ABSENCE_INJURY_REASON,
  ABSENCE_OTHER_REASON,
  MAX_ABSENCE_CUSTOM,
  MAX_ABSENCE_DETAIL,
  type Absence,
  type AbsenceDraft,
  type AbsenceErrors,
  draftFromAbsence,
  emptyAbsenceDraft,
} from '../../core/records';
import { RecordsService } from '../../core/records.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Abwesenheit oder Verletzung eintragen/bearbeiten; ein offenes Ende ist nur bei einer Verletzung möglich. */
@Component({
  selector: 'tk-absence-dialog',
  imports: [Dialog, Button],
  styleUrl: './record-dialogs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <div class="field">
          <label class="tk-label">
            Grund
            <select class="tk-input" name="reason" [value]="draft().reason" [attr.aria-invalid]="errors().reason ? 'true' : null" [attr.aria-describedby]="errors().reason ? 'err-reason' : null" (change)="patch({ reason: value($event) })">
              <option value="" disabled [selected]="draft().reason === ''">Bitte wählen</option>
              @for (reason of reasons; track reason) {
                <option [value]="reason" [selected]="draft().reason === reason">{{ reason }}</option>
              }
              <option [value]="other" [selected]="draft().reason === other">{{ other }}</option>
            </select>
          </label>
          @if (errors().reason) { <span class="error" id="err-reason" role="alert">{{ errors().reason }}</span> }
        </div>
        @if (injury()) {
          <div class="field">
            <label class="tk-label">
              Art der Verletzung
              <input class="tk-input" name="detail" autocomplete="off" [attr.maxlength]="limits.detail" placeholder="z. B. Muskelfaserriss Oberschenkel" [value]="draft().detail"
                [attr.aria-invalid]="errors().detail ? 'true' : null" (input)="patch({ detail: value($event) })" />
            </label>
            @if (errors().detail) { <span class="error" role="alert">{{ errors().detail }}</span> }
          </div>
        }
        @if (draft().reason === other) {
          <div class="field">
            <label class="tk-label">
              Details
              <input class="tk-input" name="custom" autocomplete="off" [attr.maxlength]="limits.custom" placeholder="z. B. Krankenhausaufenthalt" [value]="draft().custom"
                [attr.aria-invalid]="errors().custom ? 'true' : null" (input)="patch({ custom: value($event) })" />
            </label>
            @if (errors().custom) { <span class="error" role="alert">{{ errors().custom }}</span> }
          </div>
        }
        <div class="grid">
          <div class="field">
            <label class="tk-label">
              Von
              <input class="tk-input" name="from" type="date" [value]="draft().from" [attr.aria-invalid]="errors().from ? 'true' : null" [attr.aria-describedby]="errors().from ? 'err-from' : null" (input)="patch({ from: value($event) })" />
            </label>
            @if (errors().from) { <span class="error" id="err-from" role="alert">{{ errors().from }}</span> }
          </div>
          <div class="field">
            <label class="tk-label">
              {{ injury() ? 'Voraussichtlich bis' : 'Bis' }}
              <input class="tk-input" name="to" type="date" [value]="draft().to" [attr.aria-invalid]="errors().to ? 'true' : null" [attr.aria-describedby]="errors().to ? 'err-to' : null" (input)="patch({ to: value($event) })" />
            </label>
            @if (errors().to) { <span class="error" id="err-to" role="alert">{{ errors().to }}</span> }
          </div>
        </div>
        @if (injury()) {
          <p class="hint">Rückkehrdatum noch offen? Dann „Voraussichtlich bis“ leer lassen: Der Spieler bleibt verletzt, bis du das Datum nachträgst oder den Eintrag löschst.</p>
        }
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary">Speichern</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class AbsenceDialog {
  private readonly records = inject(RecordsService);
  readonly open = input(false);
  readonly absence = input<Absence | null>(null);
  readonly closed = output<void>();

  protected readonly reasons = ABSENCE_FIXED_REASONS;
  protected readonly other = ABSENCE_OTHER_REASON;
  protected readonly limits = { detail: MAX_ABSENCE_DETAIL, custom: MAX_ABSENCE_CUSTOM };
  protected readonly draft = signal<AbsenceDraft>(emptyAbsenceDraft());
  protected readonly errors = signal<AbsenceErrors>({});
  protected readonly injury = computed(() => this.draft().reason === ABSENCE_INJURY_REASON);
  protected readonly title = computed(() => (this.absence() ? 'Eintrag bearbeiten' : 'Abwesenheit oder Verletzung eintragen'));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const absence = this.absence();
      untracked(() => {
        this.draft.set(absence ? draftFromAbsence(absence) : emptyAbsenceDraft());
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<AbsenceDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.records.saveAbsence(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
