import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { numberLabel } from '../../../core/profile/profile';
import { type Leader } from '../../../core/team/team';

/** Eintrag der Formkurve: Bestenlisten-Eintrag plus fertig berechnete Anzeigewerte. */
export type HomeBoardEntry = Leader & {
  readonly spark: {
    readonly width: number;
    readonly height: number;
    readonly path: string;
    readonly last: { readonly x: number; readonly y: number } | null;
    readonly label: string;
  };
  readonly trendText: string;
  readonly tone: string;
  readonly initials: string;
};

/** Formkurve (Bestenliste mit Mini-Verlauf) der Startseite (aus Home ausgelagert, SCRUM-156). */
@Component({
  selector: 'app-home-board',
  imports: [RouterLink],
  templateUrl: './home-board.html',
  styleUrl: './home-board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeBoard {
  readonly entries = input.required<readonly HomeBoardEntry[]>();
  readonly mobile = input.required<boolean>();
  protected readonly numberLabel = numberLabel;
}
