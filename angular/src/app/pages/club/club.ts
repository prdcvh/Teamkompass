import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { type ClubTeamSummary, ClubAdminOverviewService } from '../../core/club/club-admin-overview.service';
import { gradeLabel } from '../../core/ratings/rating';
import { formatInviteCode } from '../../core/registration/registration';
import { formatDate } from '../../core/shared/dates';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Vereinsübersicht für Vereinsadmins (SCRUM-183): `/verein` zeigt alle Teams des eigenen Vereins, `/verein/:teamId`
 * ein Team zum Ansehen – nur lesen, ohne Gesundheitsdaten (die Regeln geben sie ihm gar nicht heraus).
 */
@Component({
  selector: 'tk-club',
  imports: [Button, Card, RouterLink],
  templateUrl: './club.html',
  styleUrl: './club.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Club {
  protected readonly overview = inject(ClubAdminOverviewService);
  protected readonly me = inject(SessionService).uid;
  protected readonly teamId = signal<string | null>(null);
  /** Team, für das gerade eine Einladung ausgefüllt wird, und die E-Mail dazu. */
  protected readonly inviting = signal<string | null>(null);
  protected readonly email = signal('');
  protected readonly copied = signal(false);
  /** Rückfrage vor dem Entfernen: `teamId/uid`. */
  protected readonly confirmRemove = signal<string | null>(null);
  protected readonly format = formatInviteCode;
  protected readonly grade = gradeLabel;

  constructor() {
    const subscription = inject(ActivatedRoute).paramMap.subscribe((params) => {
      const teamId = params.get('teamId');
      this.teamId.set(teamId);
      if (teamId) void this.overview.openTeam(teamId);
      else void this.overview.load();
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  protected title(team: Pick<ClubTeamSummary, 'name' | 'label' | 'teamId'>): string {
    return team.name || team.label || team.teamId;
  }

  protected date(iso: string | null | undefined): string {
    return iso ? formatDate(iso) : '–';
  }

  protected day(value: Date | null): string {
    return value ? value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
  }

  protected startInvite(teamId: string): void {
    this.inviting.set(teamId);
    this.email.set('');
    this.copied.set(false);
    this.overview.created.set(null);
    this.overview.error.set('');
  }

  protected async sendInvite(clubId: string, team: ClubTeamSummary): Promise<void> {
    if (await this.overview.inviteTrainer(clubId, team, this.email(), location.origin)) {
      this.inviting.set(null);
      this.email.set('');
    }
  }

  protected async remove(teamId: string, uid: string): Promise<void> {
    if (this.confirmRemove() !== `${teamId}/${uid}`) {
      this.confirmRemove.set(`${teamId}/${uid}`);
      return;
    }
    await this.overview.removeTrainer(teamId, uid);
    this.confirmRemove.set(null);
  }

  protected async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
