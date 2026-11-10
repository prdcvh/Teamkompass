import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { formatDate } from '../../core/events/event';
import { SquadService } from '../../core/player/squad.service';
import {
  MATURITY_BAND_LABELS,
  MATURITY_STOPPED_TEXT,
  MAX_PARENT_HEIGHT_CM,
  MIN_PARENT_HEIGHT_CM,
  type MaturityInputs,
  type MaturitySex,
  decimalAge,
  inMaturityAgeRange,
  maturityHistory,
  maturityInputsForCalculation,
  maturityStopped,
  missingMaturityInputs,
  parseParentHeight,
  percentText,
} from '../../core/records/maturity';
import { MaturityService } from '../../core/records/maturity.service';
import { MeasurementsService } from '../../core/records/measurements.service';
import { RecordsStateService } from '../../core/records/records-state.service';
import { todayIso } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

interface Draft {
  readonly sex: MaturitySex | '';
  readonly parentsConsent: boolean;
  readonly motherHeight: string;
  readonly fatherHeight: string;
}

/** Hinweis neben dem Wert: so sollen Trainer ihn lesen (keine Umrechnung der Noten). */
export const MATURITY_GRADES_HINT =
  'Noten und Tests im Licht des Reifestands lesen: Früh entwickelte Spieler haben oft einen körperlichen Vorsprung, spät entwickelte holen ihn meist noch auf. Die Noten werden nicht umgerechnet.';

/**
 * Reife-Kompass im Spielerprofil (SCRUM-190): Reifestand nach Khamis & Roche als Prozent der erwarteten
 * Erwachsenengröße mit Verlauf und Einordnung. Sichtbar nur für Trainer und Medizin; ändern darf nur der Trainer.
 * Spieler, Eltern und Scouts sehen die Karte nicht (und die Regeln sperren die Angaben der Eltern für sie).
 * Bei widerrufener Einwilligung wird nichts mehr berechnet und nichts ergänzt (SCRUM-252); gelöscht wird über die
 * Aufgabe in der Einwilligungs-Karte.
 */
@Component({
  selector: 'tk-maturity-card',
  imports: [Button, Card],
  styleUrls: ['./profile-extras.css', './maturity-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (service.visible() && player(); as p) {
      <section class="block" aria-labelledby="maturity-title">
        <div class="block-head">
          <h2 id="maturity-title">Reife-Kompass</h2>
          <small class="muted">nur für Trainer und Medizin sichtbar</small>
        </div>
        <tk-card>
          @if (service.state() === 'error') {
            <div class="notice" role="alert">
              <p>{{ service.error() }}</p>
              <button tkButton size="sm" type="button" (click)="service.retry()">Erneut versuchen</button>
            </div>
          } @else if (service.state() !== 'ready') {
            <p class="muted pad" role="status">Reife-Kompass wird geladen …</p>
          } @else if (stopped()) {
            <p class="consent-warning" role="status" data-test="maturity-stopped">{{ stoppedText }}</p>
          } @else {
            @if (!ageInRange()) {
              <p class="muted pad" data-test="maturity-age">Der Reifestand wird nur für Spieler von 12 bis 15 Jahren angezeigt.</p>
            } @else if (latest(); as last) {
              <div class="maturity-now" [attr.data-band]="last.band">
                <strong class="maturity-percent">{{ percent(last.percent) }}</strong>
                <span>der erwarteten Erwachsenengröße</span>
                <span class="pill maturity-band" [attr.data-band]="last.band">{{ bandLabel(last.band) }}</span>
              </div>
              <p class="muted">
                Stand {{ formatDate(last.date) }} · erwartete Erwachsenengröße ca. {{ cm(last.predictedAdultCm) }} cm (Schätzung, meist ± 5 cm)
              </p>
              <p class="maturity-hint">{{ gradesHint }}</p>
              @if (history().length > 1) {
                <h3>Verlauf</h3>
                <ul class="items" aria-label="Verlauf des Reifestands">
                  @for (point of historyNewestFirst(); track point.date) {
                    <li>
                      <div>
                        <strong>{{ formatDate(point.date) }}</strong>
                        <p>{{ percent(point.percent) }} · {{ bandLabel(point.band) }} · {{ ageText(point.age) }} Jahre</p>
                      </div>
                    </li>
                  }
                </ul>
              }
            } @else {
              <p class="muted pad" data-test="maturity-missing">Für einen Wert fehlt noch: {{ missing().join(', ') }}.</p>
            }
            <p class="muted maturity-source">
              Methode: Khamis &amp; Roche (1994) aus Größe, Gewicht und Größe beider Eltern. Einordnung: unter 85 % spät entwickelt, 85–95 % im Schnitt, über 95 % früh entwickelt.
            </p>

            @if (canEdit()) {
              <form class="maturity-form" (submit)="submit($event)" novalidate>
                <h3>Angaben für die Berechnung</h3>
                @if (healthLocked()) {
                  <p class="consent-warning" role="status">{{ healthLocked() }}</p>
                }
                <label class="tk-label">
                  Geschlecht (für die Formel)
                  <select class="tk-input" name="sex" [value]="draft().sex" (change)="patch({ sex: sexOf($event) })" [disabled]="locked()">
                    <option value="">– bitte wählen –</option>
                    <option value="m">Junge</option>
                    <option value="f">Mädchen</option>
                  </select>
                </label>
                <label class="maturity-consent">
                  <input type="checkbox" name="parentsConsent" [checked]="draft().parentsConsent" (change)="patch({ parentsConsent: checked($event) })" [disabled]="locked()" />
                  Eltern sind mit der Speicherung ihrer Größe einverstanden
                </label>
                @if (service.inputs().parentsConsent) {
                  <p class="muted" data-test="maturity-consent-record">{{ consentRecord() }}</p>
                }
                <div class="grid">
                  <label class="tk-label">
                    Größe Mutter (cm)
                    <input class="tk-input" name="motherHeight" inputmode="decimal" autocomplete="off" [value]="draft().motherHeight" [disabled]="locked() || !draft().parentsConsent" (input)="patch({ motherHeight: value($event) })" />
                  </label>
                  <label class="tk-label">
                    Größe Vater (cm)
                    <input class="tk-input" name="fatherHeight" inputmode="decimal" autocomplete="off" [value]="draft().fatherHeight" [disabled]="locked() || !draft().parentsConsent" (input)="patch({ fatherHeight: value($event) })" />
                  </label>
                </div>
                @if (!draft().parentsConsent && (service.inputs().motherHeight || service.inputs().fatherHeight)) {
                  <p class="muted">Ohne Häkchen werden die gespeicherten Größen der Eltern beim Speichern gelöscht.</p>
                }
                @if (formError()) {
                  <p class="error" role="alert">{{ formError() }}</p>
                }
                @if (saved()) {
                  <p class="muted" role="status">Gespeichert.</p>
                }
                <div>
                  <button tkButton size="sm" type="submit" variant="primary" [disabled]="locked() || busy()">{{ busy() ? 'Speichert …' : 'Angaben speichern' }}</button>
                </div>
              </form>
            }
          }
        </tk-card>
      </section>
    }
  `,
})
export class MaturityCard {
  protected readonly service = inject(MaturityService);
  private readonly records = inject(RecordsStateService);
  private readonly squad = inject(SquadService);
  private readonly measurements = inject(MeasurementsService);

  /** Schaltflächen zum Ändern anzeigen (Trainer-Profil); in der Medizin-Ansicht nur lesen. */
  readonly editable = input(true);
  /** Fremder Verein ohne dokumentierte Einwilligung: Angaben lassen sich nicht speichern (die Regeln sperren es). */
  readonly healthLocked = input('');

  protected readonly player = computed(() => {
    const id = this.records.playerId();
    return id ? (this.squad.players().find((entry) => entry.id === id) ?? null) : null;
  });
  private readonly birthdate = computed(() => this.player()?.birthdate ?? '');
  /** Einwilligung widerrufen: keine Berechnung, kein Formular (SCRUM-252). */
  protected readonly stopped = computed(() => maturityStopped(this.player()));
  /** Nur damit wird gerechnet – bei Widerruf leer, dann gibt es keinen Wert. */
  private readonly calculationInputs = computed(() => maturityInputsForCalculation(this.service.inputs(), this.player()));
  protected readonly history = computed(() => maturityHistory(this.measurements.measurements(), this.birthdate(), this.calculationInputs()));
  protected readonly historyNewestFirst = computed(() => [...this.history()].reverse());
  protected readonly latest = computed(() => this.history().at(-1) ?? null);
  /** Nur für Spieler, die heute 12 bis 15 Jahre alt sind (PO, 02.11.2026). */
  protected readonly ageInRange = computed(() => inMaturityAgeRange(decimalAge(this.birthdate(), todayIso())));
  protected readonly missing = computed(() => missingMaturityInputs(this.calculationInputs(), this.birthdate(), this.measurements.measurements()));
  /** Nachweis des Einverständnisses der Eltern (SCRUM-252). */
  protected readonly consentRecord = computed(() => {
    const { parentsConsentDate, parentsConsentBy } = this.service.inputs();
    if (!parentsConsentDate) return 'Einverständnis der Eltern ohne Datum eingetragen (vor November 2026).';
    return `Einverständnis der Eltern eingetragen am ${formatDate(parentsConsentDate)}${parentsConsentBy ? ` von ${parentsConsentBy}` : ''}.`;
  });
  protected readonly canEdit = computed(() => this.editable() && this.service.canWrite());
  protected readonly locked = computed(() => !!this.healthLocked());

  protected readonly draft = signal<Draft>({ sex: '', parentsConsent: false, motherHeight: '', fatherHeight: '' });
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);

  protected readonly gradesHint = MATURITY_GRADES_HINT;
  protected readonly stoppedText = MATURITY_STOPPED_TEXT;
  protected readonly formatDate = formatDate;

  constructor() {
    // Folgt dem Spieler, dessen Zusatzdaten gerade geladen sind.
    effect(() => {
      const id = this.records.playerId();
      const visible = this.service.visible();
      untracked(() => {
        if (id && visible) this.service.start(id);
        else this.service.stop();
      });
    });
    // Formular mit den gespeicherten Angaben füllen (neu bei jedem Laden/Spielerwechsel).
    effect(() => {
      const inputs = this.service.inputs();
      untracked(() => {
        this.draft.set({
          sex: inputs.sex ?? '',
          parentsConsent: inputs.parentsConsent,
          motherHeight: inputs.motherHeight === null ? '' : String(inputs.motherHeight),
          fatherHeight: inputs.fatherHeight === null ? '' : String(inputs.fatherHeight),
        });
        this.formError.set('');
      });
    });
  }

  protected percent(value: number): string {
    return percentText(value);
  }

  protected cm(value: number): string {
    return String(Math.round(value));
  }

  protected ageText(age: number): string {
    return String(Math.floor(age * 10) / 10).replace('.', ',');
  }

  protected bandLabel(band: keyof typeof MATURITY_BAND_LABELS): string {
    return MATURITY_BAND_LABELS[band];
  }

  protected patch(change: Partial<Draft>): void {
    this.saved.set(false);
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected sexOf(event: Event): MaturitySex | '' {
    const value = (event.target as HTMLSelectElement).value;
    return value === 'm' || value === 'f' ? value : '';
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || this.locked() || this.stopped()) return;
    const draft = this.draft();
    const mother = draft.parentsConsent ? parseParentHeight(draft.motherHeight) : null;
    const father = draft.parentsConsent ? parseParentHeight(draft.fatherHeight) : null;
    if (Number.isNaN(mother) || Number.isNaN(father)) {
      this.formError.set(`Bitte die Größe der Eltern in cm eingeben (${MIN_PARENT_HEIGHT_CM} bis ${MAX_PARENT_HEIGHT_CM}).`);
      return;
    }
    const inputs: MaturityInputs = { sex: draft.sex || null, parentsConsent: draft.parentsConsent, motherHeight: mother, fatherHeight: father };
    this.formError.set('');
    this.busy.set(true);
    try {
      const ok = await this.service.save(inputs, new Date().toISOString());
      if (ok) this.saved.set(true);
      else this.formError.set('Speichern fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.');
    } finally {
      this.busy.set(false);
    }
  }
}
