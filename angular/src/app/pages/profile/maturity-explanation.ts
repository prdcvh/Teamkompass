import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatDate } from '../../core/shared/dates';
import { MATURITY_BAND_LABELS, type MaturityBand, percentText } from '../../core/records/maturity';
import { MATURITY_STALE_DAYS, type MaturityAssessment, pahSentence } from '../../core/records/maturity-assessment';

/** Hinweis neben dem Wert: so sollen Trainer ihn lesen (keine Umrechnung der Noten). */
export const MATURITY_GRADES_HINT =
  'Noten und Tests im Licht des Reifestands lesen: Früh entwickelte Spieler haben oft einen körperlichen Vorsprung, spät entwickelte holen ihn meist noch auf. Die Noten werden nicht umgerechnet.';

/** Hilfe in der Reife-Karte (SCRUM-256): Begriffe und Grenzen des Reife-Kompass in einfachen Worten. */
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
 * Wert, Einordnung und Erklärung im Reife-Kompass (SCRUM-256): Datengrundlage, Fehlerbreite, Widersprüche,
 * Neuberechnung nach Korrektur und die getrennte Frage nach der Wachstumsspitze. Bekommt die fertige Einschätzung
 * aus der Karte (die nur mit den bei Widerruf geleerten Angaben rechnet) und rechnet selbst nichts nach.
 */
@Component({
  selector: 'tk-maturity-explanation',
  styleUrls: ['./profile-extras.css', './maturity-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (assessment().latest; as last) {
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
  `,
})
export class MaturityExplanation {
  readonly assessment = input.required<MaturityAssessment>();
  /** Sind Angaben für die Berechnung gespeichert (auch ohne Datum)? */
  readonly hasInputs = input(false);

  protected readonly gradesHint = MATURITY_GRADES_HINT;
  protected readonly formatDate = formatDate;

  protected readonly historyNewestFirst = computed(() => [...this.assessment().history].reverse());
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
    return this.hasInputs() ? 'Angaben für die Berechnung ohne Datum gespeichert' : 'noch keine Angaben gespeichert';
  });

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

  protected bandLabel(band: MaturityBand): string {
    return MATURITY_BAND_LABELS[band];
  }
}
