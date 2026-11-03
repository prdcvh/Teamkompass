import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { CurrentTeam } from '../team/current-team.service';
import { TeamSettingsService } from '../team-settings/team-settings.service';
import { type RatingScale, defaultScaleForLabel, scoreLabel } from './rating-scale';

/**
 * Bewertungsskala des geöffneten Teams (SCRUM-188). Trainer lesen die Wahl aus den Teameinstellungen; ohne Wahl (und für
 * alle, die die Teameinstellungen nicht lesen dürfen) gilt der Standard der Altersklasse aus der Teambezeichnung.
 * Spieler und Eltern sehen ihre eigenen Bewertungen deshalb in der Skala, mit der sie vergeben wurden (`scale` im
 * Bewertungsdokument, siehe `displayScaleFor` in `profile.ts`).
 */
@Injectable({ providedIn: 'root' })
export class RatingScaleService {
  private readonly settings = inject(TeamSettingsService);
  private readonly team = inject(CurrentTeam);

  /** Standard ohne Wahl: U6–U11 Stufen, sonst Schulnoten. */
  readonly defaultScale = computed<RatingScale>(() => defaultScaleForLabel(this.team.label()));
  readonly scale = computed<RatingScale>(() => this.settings.ratingScale() ?? this.defaultScale());
  /** Anzeige eines Werts (Gesamtnote, Schnitt) in der Skala des Teams. */
  readonly label = (value: number | null): string => scoreLabel(value, this.scale());

  constructor() {
    // Die Teameinstellungen dürfen nur Trainer lesen; untracked: ein Ladefehler startet keine Wiederhol-Schleife.
    effect(() => {
      if (this.settings.canWrite()) untracked(() => this.settings.start());
    });
  }
}
