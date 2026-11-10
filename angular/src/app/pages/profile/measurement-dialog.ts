import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { todayIso } from '../../core/shared/dates';
import { type Measurement, type MeasurementDraft, type MeasurementErrors, type SittingMode, draftFromMeasurement, emptyMeasurementDraft, evaluateMeasurement } from '../../core/records/measurement';
import { FLAG_TEXT, MAX_READINGS, type SeriesResult, decimalText } from '../../core/records/measurement-protocol';
import { MeasurementsService } from '../../core/records/measurements.service';
import { Button } from '../../ui/button/button';
import { Dialog } from '../../ui/dialog/dialog';

type Series = 'height' | 'weight' | 'sitting';

function nowTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * Messassistent (SCRUM-253): Messung mit Datum, Uhrzeit, Messstation und Wiederholungen eintragen oder bearbeiten.
 * Größe zweimal, bei Abweichung ab 0,4 cm ein drittes Mal; Gewicht und Sitzhöhe optional mit Wiederholungen.
 * Bestandsmessungen (ohne Messassistent erfasst) werden wie bisher mit einem Wert je Feld bearbeitet.
 * Nur im Trainer-Profil eingebunden (profile-extras, `canEdit`).
 */
@Component({
  selector: 'tk-measurement-dialog',
  imports: [Dialog, Button],
  styleUrls: ['./record-dialogs.css', './measurement-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <tk-dialog [open]="open()" [title]="title()" (closed)="closed.emit()">
      <form (submit)="submit($event)" novalidate>
        @if (draft().legacy) {
          <p class="hint legacy">Bestandsmessung – Messqualität nicht dokumentiert. Es gibt keine Einzelmessungen dazu; für eine dokumentierte Messung bitte eine neue Messung eintragen.</p>
        } @else {
          <details class="guide" [open]="!draft().id">
            <summary>So wird gemessen</summary>
            <ul>
              <li>Schuhe aus, leichte Kleidung, Haare flach.</li>
              <li>Möglichst ähnliche Tageszeit wie beim letzten Mal{{ lastTime() ? ' (zuletzt ' + lastTime() + ' Uhr)' : '' }}.</li>
              <li>Immer dieselbe Messstation (Wand-Messlatte, Waage).</li>
              <li>Größe zweimal messen. Weichen beide um 0,4 cm oder mehr ab, ein drittes Mal. Verwendet wird der mittlere Wert.</li>
              <li>Sitzhöhe nur, wenn sie gebraucht wird: auf einem Sitzkasten sitzend vom Boden messen und die Kastenhöhe angeben – oder die schon bereinigte Sitzhöhe eintragen.</li>
            </ul>
          </details>
        }
        <div class="grid">
          <div class="field">
            <label class="tk-label">
              Datum
              <input class="tk-input" name="date" type="date" [max]="today" [value]="draft().date" [attr.aria-invalid]="errors().date ? 'true' : null" [attr.aria-describedby]="errors().date ? 'err-date' : null" (input)="patch({ date: value($event) })" />
            </label>
            @if (errors().date) { <span class="error" id="err-date" role="alert">{{ errors().date }}</span> }
          </div>
          @if (!draft().legacy) {
            <div class="field">
              <label class="tk-label">
                Uhrzeit
                <input class="tk-input" name="time" type="time" [value]="draft().time" [attr.aria-invalid]="errors().time ? 'true' : null" [attr.aria-describedby]="errors().time ? 'err-time' : null" (input)="patch({ time: value($event) })" />
              </label>
              @if (errors().time) { <span class="error" id="err-time" role="alert">{{ errors().time }}</span> }
            </div>
          }
        </div>
        @if (!draft().legacy) {
          <div class="field">
            <label class="tk-label">
              Messstation / Methode
              <input class="tk-input" name="station" autocomplete="off" list="measurement-stations" maxlength="60" placeholder="z. B. Messlatte Kabine, Waage Vereinsheim" [value]="draft().station" [attr.aria-invalid]="errors().station ? 'true' : null" (input)="patch({ station: value($event) })" />
            </label>
            <datalist id="measurement-stations">
              @for (station of stations(); track station) { <option [value]="station"></option> }
            </datalist>
            @if (errors().station) { <span class="error" role="alert">{{ errors().station }}</span> }
          </div>
        }

        <fieldset class="series" [attr.aria-describedby]="'status-height'">
          <legend>Größe (cm){{ draft().legacy ? '' : ' – zweimal messen' }}</legend>
          <div class="readings">
            @for (index of slots('height'); track index) {
              <label class="tk-label">
                {{ draft().legacy ? 'Größe' : index + 1 + '. Messung' }}
                <input class="tk-input" [name]="'height' + (index + 1)" inputmode="decimal" autocomplete="off" [value]="draft().height[index]" [attr.aria-invalid]="errors().height ? 'true' : null" (input)="patchReading('height', index, value($event))" />
              </label>
            }
          </div>
          <p class="status" id="status-height" aria-live="polite">{{ status(evaluation().height, 'cm', 'Größe') }}</p>
          @if (errors().height) { <span class="error" id="err-height" role="alert">{{ errors().height }}</span> }
        </fieldset>

        <fieldset class="series">
          <legend>Gewicht (kg) – optional</legend>
          <div class="readings">
            @for (index of slots('weight'); track index) {
              <label class="tk-label">
                {{ draft().legacy ? 'Gewicht' : index + 1 + '. Messung' }}
                <input class="tk-input" [name]="'weight' + (index + 1)" inputmode="decimal" autocomplete="off" [value]="draft().weight[index]" [attr.aria-invalid]="errors().weight ? 'true' : null" (input)="patchReading('weight', index, value($event))" />
              </label>
            }
          </div>
          <p class="status" aria-live="polite">{{ status(evaluation().weight, 'kg', 'Gewicht') }}</p>
          @if (errors().weight) { <span class="error" id="err-weight" role="alert">{{ errors().weight }}</span> }
        </fieldset>

        @if (!draft().legacy) {
          <details class="series sitting" [open]="sittingOpen()">
            <summary>Sitzhöhe (cm) – nur wenn gebraucht</summary>
            <div class="modes" role="radiogroup" aria-label="Was wurde abgelesen?">
              <label><input type="radio" name="sittingMode" value="box" [checked]="draft().sittingMode === 'box'" (change)="patchMode('box')" /> Abgelesene Gesamthöhe auf dem Sitzkasten</label>
              <label><input type="radio" name="sittingMode" value="net" [checked]="draft().sittingMode === 'net'" (change)="patchMode('net')" /> Bereits bereinigte Sitzhöhe (ohne Kasten)</label>
            </div>
            @if (draft().sittingMode === 'box') {
              <div class="field">
                <label class="tk-label">
                  Höhe Sitzkasten (cm)
                  <input class="tk-input" name="boxHeight" inputmode="decimal" autocomplete="off" [value]="draft().boxHeight" [attr.aria-invalid]="errors().box ? 'true' : null" (input)="patch({ boxHeight: value($event) })" />
                </label>
                @if (errors().box) { <span class="error" role="alert">{{ errors().box }}</span> }
              </div>
            }
            <div class="readings">
              @for (index of slots('sitting'); track index) {
                <label class="tk-label">
                  {{ index + 1 }}. {{ draft().sittingMode === 'box' ? 'Gesamthöhe' : 'Sitzhöhe' }}
                  <input class="tk-input" [name]="'sitting' + (index + 1)" inputmode="decimal" autocomplete="off" [value]="draft().sitting[index]" [attr.aria-invalid]="errors().sitting ? 'true' : null" (input)="patchReading('sitting', index, value($event))" />
                </label>
              }
            </div>
            <p class="status" aria-live="polite">{{ sittingStatus() }}</p>
            @if (errors().sitting) { <span class="error" id="err-sitting" role="alert">{{ errors().sitting }}</span> }
          </details>
        }

        @if (summary()) { <p class="hint summary">{{ summary() }}</p> }
        @if (evaluation().flags.length) {
          <div class="flags" role="status">
            <strong>Wird zur Prüfung markiert:</strong>
            <ul>
              @for (flag of evaluation().flags; track flag) { <li>{{ flagText[flag] }}</li> }
            </ul>
            <p class="hint">Die Werte werden so gespeichert, wie sie eingegeben sind – nichts wird verändert oder gelöscht.</p>
          </div>
        }

        @if (draft().id) {
          <div class="field">
            <label class="tk-label">
              Grund der Änderung
              <textarea class="tk-input" name="reason" rows="2" maxlength="200" placeholder="z. B. Tippfehler, Sitzkasten vergessen" [value]="draft().reason" [attr.aria-invalid]="errors().reason ? 'true' : null" [attr.aria-describedby]="errors().reason ? 'err-reason' : null" (input)="patch({ reason: value($event) })"></textarea>
            </label>
            @if (errors().reason) { <span class="error" id="err-reason" role="alert">{{ errors().reason }}</span> }
          </div>
        }
        <menu>
          <button tkButton type="button" variant="neutral" (click)="closed.emit()">Abbrechen</button>
          <button tkButton type="submit" variant="primary">Speichern</button>
        </menu>
      </form>
    </tk-dialog>
  `,
})
export class MeasurementDialog {
  private readonly measurements = inject(MeasurementsService);
  readonly open = input(false);
  readonly measurement = input<Measurement | null>(null);
  readonly closed = output<void>();

  protected readonly today = todayIso();
  protected readonly draft = signal<MeasurementDraft>(emptyMeasurementDraft(todayIso()));
  protected readonly errors = signal<MeasurementErrors>({});
  protected readonly title = computed(() => (this.measurement() ? 'Messung bearbeiten' : 'Messung eintragen'));
  protected readonly evaluation = computed(() => evaluateMeasurement(this.draft(), this.measurements.context(this.draft().id)));
  protected readonly flagText = FLAG_TEXT;
  /** Bisher verwendete Messstationen als Vorschläge. */
  protected readonly stations = computed(() => [...new Set(this.measurements.measurements().map((entry) => entry.station ?? '').filter(Boolean))]);
  /** Uhrzeit der letzten Messung (Hinweis "ähnliche Tageszeit"). */
  protected readonly lastTime = computed(() => [...this.measurements.measurements()].reverse().find((entry) => entry.time && entry.id !== this.draft().id)?.time ?? '');
  protected readonly sittingOpen = signal(false);

  protected readonly summary = computed(() => {
    const evaluation = this.evaluation();
    const parts: string[] = [];
    if (evaluation.age !== null) parts.push(`Alter am Messtag: ${decimalText(evaluation.age)} Jahre`);
    if (evaluation.legLength !== null) parts.push(`Beinlänge (Größe − Sitzhöhe): ${decimalText(evaluation.legLength)} cm`);
    return parts.join(' · ');
  });

  protected readonly sittingStatus = computed(() => {
    const { sitting, boxCm, errors } = this.evaluation();
    if (!sitting.readings.length) return 'Nicht gemessen – für eine einfache Größenmessung nicht nötig.';
    if (sitting.needs === 'third') return `Abweichung ${decimalText(sitting.range)} cm – bitte ein drittes Mal messen.`;
    if (sitting.value === null || errors.sitting || errors.box) return '';
    const raw = sitting.readings.length === 1 ? 'Einzelmessung' : sitting.readings.length === 2 ? 'Mittelwert aus 2 Messungen' : 'mittlerer Wert aus 3 Messungen';
    return boxCm > 0
      ? `Verwendet: ${decimalText(sitting.value)} cm Sitzhöhe (${raw}, Sitzkasten ${decimalText(boxCm)} cm abgezogen).`
      : `Verwendet: ${decimalText(sitting.value)} cm Sitzhöhe (${raw}).`;
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const measurement = this.measurement();
      untracked(() => {
        const last = this.measurements.measurements().at(-1);
        this.draft.set(measurement ? draftFromMeasurement(measurement) : emptyMeasurementDraft(todayIso(), nowTime(), last?.station ?? ''));
        this.sittingOpen.set(!!measurement?.sittingReadings?.length);
        this.errors.set({});
      });
    });
  }

  /** Eingabefelder je Reihe: Bestand 1; Größe 2 (+3. bei Bedarf); Gewicht/Sitzhöhe 2 (+3. bei Bedarf). */
  protected slots(series: Series): number[] {
    if (this.draft().legacy) return [0];
    const result = this.evaluation()[series];
    const third = result.needs === 'third' || result.spread || this.draft()[series][MAX_READINGS - 1].trim() !== '';
    return third ? [0, 1, 2] : [0, 1];
  }

  protected status(result: SeriesResult, unit: string, label: string): string {
    if (!result.readings.length) return '';
    if (result.needs === 'second') return 'Bitte ein zweites Mal messen.';
    if (result.needs === 'third') return `Abweichung ${decimalText(result.range)} ${unit} – bitte ein drittes Mal messen.`;
    if (result.value === null || this.draft().legacy) return '';
    const raw = result.readings.length === 1 ? 'Einzelmessung' : result.readings.length === 2 ? 'Mittelwert aus 2 Messungen' : 'mittlerer Wert aus 3 Messungen';
    return `Verwendet: ${decimalText(result.value)} ${unit} ${label} (${raw}).`;
  }

  protected patch(change: Partial<MeasurementDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected patchReading(series: Series, index: number, text: string): void {
    this.draft.update((draft) => ({ ...draft, [series]: draft[series].map((entry, position) => (position === index ? text : entry)) }));
  }

  protected patchMode(mode: SittingMode): void {
    this.patch({ sittingMode: mode });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const errors = this.measurements.saveMeasurement(this.draft());
    this.errors.set(errors);
    if (errors.sitting || errors.box) this.sittingOpen.set(true);
    if (Object.keys(errors).length === 0) this.closed.emit();
  }
}
