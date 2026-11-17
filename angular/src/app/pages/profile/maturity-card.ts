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
  hasMaturityData,
  inMaturityAgeRange,
  maturityInputsForCalculation,
  maturityStopped,
  parseParentHeight,
  percentText,
} from '../../core/records/maturity';
import { MATURITY_STALE_DAYS, assessMaturity, pahSentence } from '../../core/records/maturity-assessment';
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

/** Hilfe in der Karte (SCRUM-256): Begriffe und Grenzen des Reife-Kompass in einfachen Worten. */
export const MATURITY_HELP_LINES: readonly string[] = [
  'Anteil an der geschätzten Erwachsenengröße (Fachwort %PAH): heutige Größe geteilt durch die geschätzte Größe als Erwachsener. Beispiel: 166 cm von geschätzt 181 cm sind etwa 91,7 %.',
  'Wachstumsspitze (Fachwort PHV): die Zeit, in der ein Jugendlicher am stärksten in die Höhe wächst. Die App erkennt sie nicht automatisch.',
  'Der Wert ist kein Knochenalter und kein genaues biologisches Alter. Er ersetzt keine ärztliche Untersuchung.',
  'Die Formel (Khamis & Roche) braucht Geschlecht, Größe und Gewicht vom selben Tag und die Größe beider leiblichen Eltern – die nur mit deren Einverständnis gespeichert wird. Ohne sie gibt es keinen Wert, die Wachstumskurve bleibt trotzdem nutzbar.',
  'Fehlerbreite: Bei 9 von 10 Kindern der Studiengruppe lag die geschätzte Erwachsenengröße höchstens etwa 5 cm (Jungen) bzw. 4 cm (Mädchen) daneben. Eine Sicherheit in Prozent für einen einzelnen Spieler gibt es nicht. Stimmen mehrere ähnliche Formeln überein, ist das kein zusätzlicher Beweis.',
  'Die Formel wurde an weißen US-Kindern entwickelt. Für andere Herkunft, Leistungssportler und besonders früh oder spät reifende Spieler ist sie ungenauer. Selbst angegebene Größen der Eltern sind oft zu hoch.',
  'Angezeigt wird der Wert nur für Spieler von 12 bis 15 Jahren (Entscheidung vom 02.11.2026). Eine Erweiterung braucht eine eigene Entscheidung.',
  'Ein Wert älter als 90 Tage gilt als veraltet und wird nicht eingeordnet. Widersprechen sich Hinweise (z. B. Größe gesunken, Messung zur Prüfung markiert), steht dort „Einordnung unsicher – prüfen“ mit den Gründen.',
  'Kleine Sprünge im Verlauf (bis etwa 1 Prozentpunkt) können entstehen, weil die Formel je halbes Lebensjahr andere Zahlen nutzt. Sie sind keine Entwicklung.',
  'Der Reife-Kompass steht in keinem Export (Datensicherung, Profil-PDF, Spielerkarte) und ändert keine Note, keine Punkte und keine Auswahl.',
];

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
            } @else if (assessment().latest; as last) {
              <div class="maturity-now" [attr.data-status]="assessment().status" [attr.data-band]="assessment().band">
                <strong class="maturity-percent">{{ percent(last.percent) }}</strong>
                <span>der geschätzten Erwachsenengröße</span>
                @if (assessment().band; as band) {
                  <span class="pill maturity-band" [attr.data-band]="band">{{ bandLabel(band) }}</span>
                } @else {
                  <span class="pill maturity-status" data-tone="warning" data-test="maturity-status">{{ assessment().statusText }}</span>
                }
              </div>
              <p class="muted" data-test="maturity-sentence">Stand {{ formatDate(last.date) }} · {{ sentence(last.heightCm, last.predictedAdultCm) }}</p>
              @if (assessment().status !== 'classified') {
                <div class="maturity-causes" role="status" data-test="maturity-causes">
                  <strong>{{ assessment().status === 'uncertain' ? 'Warum die Einordnung unsicher ist:' : 'Warum keine Einordnung:' }}</strong>
                  <ul>
                    @for (cause of assessment().causes; track $index) {
                      <li>{{ cause }}</li>
                    }
                  </ul>
                  <p>Die App bildet daraus keine Mehrheit und keinen Mittelwert. Bitte Messungen und Angaben prüfen; nach einer Korrektur rechnet sie sofort neu.</p>
                </div>
              }
              @if (assessment().range; as range) {
                <p class="muted" data-test="maturity-range">
                  Fehlerbreite: Bei 9 von 10 Kindern der Studiengruppe lag die geschätzte Erwachsenengröße höchstens etwa {{ decimal(range.errorCm) }} cm daneben. Für diesen Wert hieße das ungefähr {{ percent(range.lowPercent) }} bis {{ percent(range.highPercent) }}. Das ist keine Sicherheitsangabe für diesen Spieler.
                  @if (range.boundaries.length) {
                    Die Grenze {{ boundariesText(range.boundaries) }} liegt in diesem Bereich – die Einordnung könnte auch anders ausfallen.
                  }
                </p>
              }
              @if (assessment().recalculation) {
                <p class="muted" data-test="maturity-recalculation">{{ assessment().recalculation }}</p>
              }
              <p class="maturity-hint">{{ gradesHint }}</p>
              @if (assessment().history.length > 1) {
                <h3>Verlauf</h3>
                <ul class="items" aria-label="Verlauf des Reifestands">
                  @for (entry of historyNewestFirst(); track entry.point.date) {
                    <li>
                      <div>
                        <strong>{{ formatDate(entry.point.date) }}</strong>
                        <p>{{ percent(entry.point.percent) }} · {{ entry.quality === 'flagged' ? 'Messung prüfen' : bandLabel(entry.point.band) }} · {{ ageText(entry.point.age) }} Jahre</p>
                      </div>
                    </li>
                  }
                </ul>
              }
            } @else {
              <div class="maturity-now">
                <span class="pill maturity-status" data-tone="warning" data-test="maturity-status">nicht eingeordnet</span>
              </div>
              <p class="muted pad" data-test="maturity-missing">
                Anteil an der geschätzten Erwachsenengröße nicht berechnet. Für einen Wert fehlt noch: {{ assessment().causes.join(', ') }}. Die Wachstumskurve oben ist davon unabhängig nutzbar.
              </p>
            }

            @if (ageInRange()) {
              <h3>Datengrundlage</h3>
              <dl class="maturity-facts" data-test="maturity-basis">
                <div>
                  <dt>Messungen</dt>
                  <dd>{{ measurementsText() }}</dd>
                </div>
                <div>
                  <dt>Messqualität</dt>
                  <dd>{{ qualityText() }}</dd>
                </div>
                <div>
                  <dt>Aktualität</dt>
                  <dd>{{ freshnessText() }}</dd>
                </div>
                <div>
                  <dt>Fehlende Angaben</dt>
                  <dd>{{ assessment().basis.missing.length ? assessment().basis.missing.join(', ') : 'keine' }}</dd>
                </div>
                @if (assessment().basis.notCounted.length) {
                  <div>
                    <dt>Nicht berücksichtigt</dt>
                    <dd>{{ assessment().basis.notCounted.join('; ') }}</dd>
                  </div>
                }
                <div>
                  <dt>Eingabestand</dt>
                  <dd data-test="maturity-inputs-date">{{ inputsText() }}</dd>
                </div>
                <div>
                  <dt>Methode</dt>
                  <dd data-test="maturity-method">Khamis &amp; Roche, Methodenversion {{ assessment().basis.methodVersion }}</dd>
                </div>
              </dl>
              <p class="muted">Der Wert wird bei jeder Anzeige aus den aktuellen Messungen und Angaben neu berechnet und nirgends gespeichert.</p>

              <h3>Wachstumsspitze (vor / um / nach)</h3>
              <p class="muted" data-test="maturity-phv">
                Ob ein Spieler vor, um oder nach seiner Wachstumsspitze steht, ordnet die App nicht automatisch ein – dafür gibt es keine geprüfte Regel. Anhaltspunkt ist die Wachstumskurve oben. Das ist eine andere Frage als die Einordnung oben, die nur den Anteil an der geschätzten Erwachsenengröße beschreibt. Ein Zusatzmodell mit Sitzhöhe (Moore) ist nicht freigegeben.
              </p>
            }
            <p class="muted maturity-source">
              Methode: Khamis &amp; Roche (1994) aus Größe, Gewicht und Größe beider Eltern. Einordnung: unter 85 % spät entwickelt, 85–95 % im Schnitt, über 95 % früh entwickelt.
            </p>
            <details class="maturity-help" data-test="maturity-help">
              <summary>So liest du den Reife-Kompass</summary>
              <ul>
                @for (line of helpLines; track $index) {
                  <li>{{ line }}</li>
                }
              </ul>
            </details>

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
  /** Einordnung mit Datengrundlage, Unsicherheit und Widersprüchen (SCRUM-256); rechnet nur mit `calculationInputs`. */
  protected readonly assessment = computed(() => assessMaturity(this.measurements.measurements(), this.birthdate(), this.calculationInputs(), todayIso()));
  protected readonly historyNewestFirst = computed(() => [...this.assessment().history].reverse());
  /** Nur für Spieler, die heute 12 bis 15 Jahre alt sind (PO, 02.11.2026). */
  protected readonly ageInRange = computed(() => inMaturityAgeRange(decimalAge(this.birthdate(), todayIso())));
  protected readonly measurementsText = computed(() => {
    const { heightCount, firstDate, lastDate, usableCount } = this.assessment().basis;
    if (!heightCount) return 'noch keine Messung mit Größe';
    const period = firstDate === lastDate ? `am ${formatDate(firstDate ?? '')}` : `vom ${formatDate(firstDate ?? '')} bis ${formatDate(lastDate ?? '')}`;
    return `${heightCount} mit Größe ${period}, davon ${usableCount} mit Reifewert`;
  });
  protected readonly qualityText = computed(() => {
    const { verified, undocumented, flagged } = this.assessment().basis.quality;
    const parts = [verified ? `${verified} geprüft` : '', undocumented ? `${undocumented} nicht dokumentiert` : '', flagged ? `${flagged} zur Prüfung markiert` : ''].filter(Boolean);
    return parts.length ? parts.join(', ') : '–';
  });
  protected readonly freshnessText = computed(() => {
    const { latest, basis } = this.assessment();
    if (!latest) return 'kein Reifewert';
    const days = basis.latestAgeDays ?? 0;
    return `jüngster Wert vom ${formatDate(latest.date)} (vor ${days} ${days === 1 ? 'Tag' : 'Tagen'})${days > MATURITY_STALE_DAYS ? ', veraltet' : ''}`;
  });
  protected readonly inputsText = computed(() => {
    const date = this.assessment().basis.inputsDate;
    if (date) return `Angaben für die Berechnung gespeichert am ${formatDate(date)}`;
    return hasMaturityData(this.calculationInputs()) ? 'Angaben für die Berechnung ohne Datum gespeichert' : 'noch keine Angaben gespeichert';
  });
  protected readonly helpLines = MATURITY_HELP_LINES;
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

  protected sentence(heightCm: number, predictedAdultCm: number): string {
    return pahSentence(heightCm, predictedAdultCm);
  }

  protected decimal(value: number): string {
    return String(value).replace('.', ',');
  }

  protected boundariesText(boundaries: readonly number[]): string {
    return boundaries.map((value) => `${value} %`).join(' und ');
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
