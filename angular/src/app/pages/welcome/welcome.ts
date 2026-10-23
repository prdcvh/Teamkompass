import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsService } from '../../core/events/events.service';
import { SquadService } from '../../core/player/squad.service';
import { CurrentTeam } from '../../core/team/current-team.service';

/**
 * Kurzer Einstieg nach der Registrierung (SCRUM-181): erster Spieler, erster Termin. Die Schritte führen auf die
 * bestehenden Seiten und öffnen dort direkt den Dialog „anlegen“ (?neu=1); erledigte Schritte sind abgehakt.
 */
@Component({
  selector: 'app-welcome',
  imports: [RouterLink],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Welcome implements OnInit {
  protected readonly team = inject(CurrentTeam);
  private readonly squad = inject(SquadService);
  private readonly events = inject(EventsService);

  protected readonly hasPlayer = computed(() => this.squad.players().length > 0);
  protected readonly hasEvent = computed(() => this.events.events().length > 0);
  protected readonly done = computed(() => this.hasPlayer() && this.hasEvent());

  ngOnInit(): void {
    this.squad.start();
    this.events.start();
  }
}
