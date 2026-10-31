import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { roleLabel } from '../../core/access/access';
import { AuthService } from '../../core/auth/auth.service';
import { homeFor, normalizeRole } from '../../core/auth/role';
import { SessionService } from '../../core/auth/session.service';
import { CurrentTeam, type TeamChoice as Choice } from '../../core/team/current-team.service';

/**
 * Teamauswahl (SCRUM-181): Wer in mehreren Teams ist, wählt hier – nach der Anmeldung oder später über „Team
 * wechseln“ in der Seitenleiste bzw. im Mehr-Menü. Seit SCRUM-182 ohne Neuladen: der {@link AuthService} baut das alte
 * Team vollständig ab (Rolle, Daten, Seiten) und öffnet das neue mit der Rolle, die das Konto dort hat.
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
  /** Team, das gerade geöffnet wird (gegen Doppel-Tippen). */
  protected readonly opening = signal<string | null>(null);

  protected title(choice: Choice): string {
    return choice.meta?.name || choice.meta?.label || `Team ${choice.teamId}`;
  }

  protected initial(choice: Choice): string {
    return (choice.meta?.clubName || this.title(choice)).trim().charAt(0).toUpperCase() || '?';
  }

  protected subtitle(choice: Choice): string {
    const role = normalizeRole(choice.role);
    return [choice.meta?.clubName, role ? roleLabel(role).split(' (')[0] : ''].filter(Boolean).join(' · ');
  }

  protected isCurrent(choice: Choice): boolean {
    return this.auth.status() === 'ready' && choice.teamId === this.team.id();
  }

  protected async open(choice: Choice): Promise<void> {
    if (this.opening()) return;
    if (this.isCurrent(choice) || (this.auth.status() === 'chooseTeam' && this.auth.chooseTeam(choice.teamId))) {
      await this.router.navigateByUrl(homeFor(this.session.role()));
      return;
    }
    this.opening.set(choice.teamId);
    try {
      // Danach zur Startseite der neuen Rolle (eine Seite des alten Teams, z. B. ein Spielerprofil, gibt es dort nicht).
      if (await this.auth.switchTeam(choice.teamId)) await this.router.navigateByUrl(homeFor(this.session.role()));
    } finally {
      this.opening.set(null);
    }
  }
}
