import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CurrentTeam } from '../../core/team/current-team.service';
import { ADMIN_ITEMS, PRIVACY_ITEM, SIDEBAR_ITEMS } from '../../core/shell/navigation';
import { SessionService } from '../../core/auth/session.service';
import { ThemeService } from '../../core/device/theme.service';
import { seasonStartYear } from '../../core/shared/season';
import { Icon } from '../../ui/icon/icon';

/** Desktop-Navigation (Figma „Sidebar“, 240 px). */
@Component({
  selector: 'tk-sidebar',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly items = SIDEBAR_ITEMS;
  protected readonly adminItems = ADMIN_ITEMS;
  protected readonly privacy = PRIVACY_ITEM;
  /** Verein, Team und Logo kommen aus der Datenbank (SCRUM-181); bis dahin die Angaben des Builds. */
  protected readonly team = inject(CurrentTeam);
  protected readonly season = seasonLabel(new Date());
}

/** Saison beginnt im Juli: Oktober 2026 → „2026 / 27“, März 2027 → „2026 / 27“. */
export function seasonLabel(date: Date): string {
  const start = seasonStartYear(date);
  return `${start} / ${String(start + 1).slice(2)}`;
}
