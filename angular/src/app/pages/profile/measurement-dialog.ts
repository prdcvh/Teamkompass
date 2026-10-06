import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { todayIso } from '../../core/player';
import { type Measurement, type MeasurementDraft, type MeasurementErrors, draftFromMeasurement, emptyMeasurementDraft } from '../../core/records';
import { RecordsService } from '../../core/records.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

/** Messung (Größe, Gewicht) eintragen/bearbeiten; der BMI wird daraus berechnet. */
@Component({
  selector: 'tk-measurement-dialog',
  imports: [Dialog, Button],
  styleUrl: './record-dialogs.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        <div class="field">
          <label class="tk-label">
            Datum
            <input class="tk-input" name="date" type="date" [value]="draft().date" [attr.aria-invalid]="errors().date ? 'true' : null" [attr.aria-describedby]="errors().date ? 'err-date' : null" (input)="patch({ date: value($event) })" />
          </label>
          @if (errors().date) { <span class="error" id="err-date" role="alert">{{ errors().date }}</span> }
        </div>
        <div class="grid">
          <div class="field">
            <label class="tk-label">
              Größe (cm)
              <input class="tk-input" name="height" inputmode="decimal" autocomplete="off" [value]="draft().height" [attr.aria-invalid]="errors().height ? 'true' : null" [attr.aria-describedby]="errors().height ? 'err-height' : null" (input)="patch({ height: value($event) })" />
            </label>
            @if (errors().height) { <span class="error" id="err-height" role="alert">{{ errors().height }}</span> }
          </div>
          <div class="field">
            <label class="tk-label">
              Gewicht (kg)
              <input class="tk-input" name="weight" inputmode="decimal" autocomplete="off" [value]="draft().weight" [attr.aria-invalid]="errors().weight ? 'true' : null" [attr.aria-describedby]="errors().weight ? 'err-weight' : null" (input)="patch({ weight: value($event) })" />
            </label>
            @if (errors().weight) { <span class="error" id="err-weight" role="alert">{{ errors().weight }}</span> }
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
export class MeasurementDialog {
  private readonly records = inject(RecordsService);
  readonly open = input(false);
  readonly measurement = input<Measurement | null>(null);
  readonly closed = output<void>();

  protected readonly draft = signal<MeasurementDraft>(emptyMeasurementDraft(todayIso()));
  protected readonly errors = signal<MeasurementErrors>({});
  protected readonly title = computed(() => (this.measurement() ? 'Messung bearbeiten' : 'Messung eintragen'));

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const measurement = this.measurement();
      untracked(() => {
        this.draft.set(measurement ? draftFromMeasurement(measurement) : emptyMeasurementDraft(todayIso()));
        this.errors.set({});
      });
    });
  }

  protected patch(change: Partial<MeasurementDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.records.saveMeasurement(this.draft());
    this.errors.set(errors);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
