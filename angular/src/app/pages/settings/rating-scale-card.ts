import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RATING_SCALES, RATING_SCALE_LABELS, isRatingScale } from '../../core/ratings/rating-scale';
import { RatingScaleService } from '../../core/ratings/rating-scale.service';
import { CurrentTeam } from '../../core/team/current-team.service';
import { TeamSettingsService } from '../../core/team-settings/team-settings.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Einstellungen → „Bewertungsskala“ (nur Trainer, SCRUM-188): Schulnoten 1–6 oder drei Kompetenzstufen. Ohne Wahl gilt
 * der Standard der Altersklasse (U6–U11 Stufen, sonst Schulnoten). Ein Wechsel schreibt keine Bewertung um.
 */
@Component({
  selector: 'tk-rating-scale-card',
  imports: [Button, Card],
  template: `
    @if (settings.canWrite()) {
      <tk-card>
        <div class="panel" id="bewertungsskala">
          <h2>Bewertungsskala (Cloud, für das Team)</h2>
          <fieldset class="scale-options" [disabled]="settings.load() !== 'ready'">
            <legend class="tk-sr-only">Bewertungsskala des Teams</legend>
            @for (option of scales; track option) {
              <label class="row">
                <span>{{ labels[option] }}</span>
                <input type="radio" name="rating-scale" [value]="option" [checked]="scale.scale() === option" [attr.data-testid]="'rating-scale-' + option" (change)="choose($event)" />
              </label>
            }
          </fieldset>
          <p class="muted">
            Standard für {{ team.label() || 'dieses Team' }} ohne eigene Wahl: {{ labels[scale.defaultScale()] }}.
            Für Kinder bis U11 sind Stufen der Standard, ab U12 Schulnoten. Nur Trainer können die Skala ändern.
          </p>
          <p class="muted">
            Bereits vergebene Bewertungen bleiben unverändert und werden weiter so angezeigt, wie sie vergeben wurden. Schnitte und
            Verläufe rechnen beide Skalen gemeinsam (lernt es noch = 4,5 · kann es = 3 · kann es sicher = 1,5).
          </p>
          @if (settings.load() === 'error') {
            <div>
              <button tkButton type="button" (click)="settings.start()">Erneut laden</button>
            </div>
          }
          @if (settings.error()) {
            <p class="error" role="alert">{{ settings.error() }}</p>
          }
        </div>
      </tk-card>
    }
  `,
  styleUrl: './settings.css',
  styles: `
    .scale-options {
      display: grid;
      gap: var(--tk-space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingScaleCard {
  protected readonly settings = inject(TeamSettingsService);
  protected readonly scale = inject(RatingScaleService);
  protected readonly team = inject(CurrentTeam);
  protected readonly scales = RATING_SCALES;
  protected readonly labels = RATING_SCALE_LABELS;

  protected choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Nicht erlaubt oder ungültig: die Auswahl springt auf den gespeicherten Stand zurück.
    if (!isRatingScale(input.value) || !this.settings.saveRatingScale(input.value)) input.checked = this.scale.scale() === input.value;
  }
}
