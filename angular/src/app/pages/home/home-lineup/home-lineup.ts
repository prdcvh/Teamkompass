import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Spieler als Punkt auf dem Mini-Spielfeld (Position in Prozent). */
export interface HomeLineupMarker {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly keeper: boolean;
  readonly left: number;
  readonly top: number;
}

/** Kurzansicht der Startelf: Formation, Anzahl und besetzte Zeilen von vorn nach hinten. */
export interface HomeLineupSummary {
  readonly formation: string;
  readonly count: number;
  readonly rows: readonly { readonly label: string; readonly names: readonly string[] }[];
}

/** Mini-Spielfeld mit Startelf und Kurzliste auf der Startseite (aus Home ausgelagert, SCRUM-156). */
@Component({
  selector: 'app-home-lineup',
  imports: [RouterLink],
  templateUrl: './home-lineup.html',
  styleUrl: './home-lineup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeLineup {
  readonly summary = input.required<HomeLineupSummary>();
  readonly markers = input.required<readonly HomeLineupMarker[]>();
  readonly mobile = input.required<boolean>();
}
