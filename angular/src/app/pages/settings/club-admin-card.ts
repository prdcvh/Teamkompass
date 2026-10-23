import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ClubAdminService } from '../../core/registration/club-admin.service';
import { formatInviteCode } from '../../core/registration/registration';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Einstellungen → „Verein“ (nur für Vereinsadmins, SCRUM-181): Trainer für ein neues Team im Verein einladen. Der
 * Vereinsadmin sieht dabei keine Spieler- oder Teamdaten (Regeln: nur Verwaltung).
 */
@Component({
  selector: 'tk-club-admin-card',
  imports: [Button, Card],
  templateUrl: './club-admin-card.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubAdminCard implements OnInit {
  protected readonly admin = inject(ClubAdminService);
  protected readonly email = signal('');
  protected readonly copied = signal(false);
  protected readonly format = formatInviteCode;

  ngOnInit(): void {
    void this.admin.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async create(clubId: string): Promise<void> {
    this.copied.set(false);
    if (await this.admin.createInvite(clubId, this.email(), location.origin)) this.email.set('');
  }

  protected async copy(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected date(value: Date | null): string {
    return value ? value.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
  }
}
