import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { LayoutService } from '../core/layout.service';
import { MORE_GROUPS, PRIVACY_ITEM } from '../core/navigation';
import { showsNavigation } from '../core/role';
import { SessionService } from '../core/session.service';
import { MoreSheet } from './more-sheet/more-sheet';
import { Sidebar } from './sidebar/sidebar';
import { TabBar } from './tab-bar/tab-bar';

/**
 * Rahmen um alle Seiten. Es gibt genau ein Router-Outlet: Desktop ergänzt eine Sidebar, Handy
 * eine Tab-Leiste mit „Mehr“-Sheet. So bleibt die Seite beim Wechsel der Variante bestehen.
 * Spieler, Eltern und Medizin haben keine Navigation (nur ihre eine Ansicht, Figma 01c/01d).
 */
@Component({
  selector: 'tk-shell',
  imports: [RouterOutlet, Sidebar, TabBar, MoreSheet],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly layout = inject(LayoutService);

  protected readonly moreOpen = signal(false);

  protected readonly variant = computed<'desktop' | 'mobile' | 'focused'>(() => {
    if (!showsNavigation(this.session.role())) return 'focused';
    return this.layout.isMobile() ? 'mobile' : 'desktop';
  });

  /** Aktiv, wenn die aktuelle Seite nur über „Mehr“ erreichbar ist. */
  protected moreActive(): boolean {
    const url = this.router.url;
    return [...MORE_GROUPS.flatMap((group) => group.items), PRIVACY_ITEM].some(
      (item) => url === item.path || url.startsWith(`${item.path}/`),
    );
  }
}
