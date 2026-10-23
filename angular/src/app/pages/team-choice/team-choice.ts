import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { roleLabel } from '../../core/access/access';
import { AuthService } from '../../core/auth/auth.service';
import { homeFor, normalizeRole } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { CurrentTeam, type TeamChoice as Choice, rememberTeam } from '../../core/team/current-team.service';

/** Seite neu laden (eigene Funktion, damit Tests sie ersetzen können). */
export const RELOAD = { to: (url: string) => location.assign(url) };

/**
 * Teamauswahl (SCRUM-181): Wer in mehreren Teams ist, wählt hier – nach der Anmeldung oder später über „Team
 * wechseln“. Ein Wechsel lädt die App neu, damit keine Daten des vorigen Teams im Speicher bleiben.
 */
@Component({
  selector: 'app-team-choice',
  imports: [RouterLink],
  templateUrl: './team-choice.html',
  styleUrl: './team-choice.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamChoice {
  protected readonly auth = inject(AuthService);
  protected readonly team = inject(CurrentTeam);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected title(choice: Choice): string {
    return choice.meta?.name || choice.meta?.label || `Team ${choice.teamId}`;
  }

  protected subtitle(choice: Choice): string {
    const role = normalizeRole(choice.role);
    return [choice.meta?.clubName, role ? roleLabel(role).split(' (')[0] : ''].filter(Boolean).join(' · ');
  }

  protected isCurrent(choice: Choice): boolean {
    return this.auth.status() === 'ready' && choice.teamId === this.team.id();
  }

  protected async open(choice: Choice): Promise<void> {
    if (this.auth.chooseTeam(choice.teamId)) {
      await this.router.navigateByUrl(homeFor(this.session.role()));
      return;
    }
    if (this.isCurrent(choice)) {
      await this.router.navigateByUrl(homeFor(this.session.role()));
      return;
    }
    rememberTeam(choice.teamId);
    RELOAD.to('/');
  }
}
