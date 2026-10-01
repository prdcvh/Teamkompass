import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SIDEBAR_ITEMS } from '../../core/navigation';
import { SessionService } from '../../core/session.service';
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
  protected readonly items = SIDEBAR_ITEMS;
  protected readonly club = environment.clubName;
  protected readonly team = environment.teamLabel;
  protected readonly season = seasonLabel(new Date());
}

/** Saison beginnt im Juli: Oktober 2026 → „2026 / 27“, März 2027 → „2026 / 27“. */
export function seasonLabel(date: Date): string {
  const start = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start} / ${String(start + 1).slice(2)}`;
}
