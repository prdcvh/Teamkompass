import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { LayoutService } from '../core/shell/layout.service';
import { MORE_GROUPS, PRIVACY_ITEM } from '../core/shell/navigation';
import { showsNavigation } from '../core/auth/role';
import { SessionService } from '../core/auth/session.service';
import { ScoutPublishService } from '../core/scout/scout-publish.service';
import { MoreSheet } from './more-sheet/more-sheet';
import { Sidebar } from './sidebar/sidebar';
import { TabBar } from './tab-bar/tab-bar';

/**
 * Rahmen um alle Seiten. Es gibt genau ein Router-Outlet: Desktop ergänzt eine Sidebar, Handy
 * eine Tab-Leiste mit „Mehr“-Sheet. So bleibt die Seite beim Wechsel der Variante bestehen.
 * Spieler, Eltern, Medizin und Scouts haben keine Navigation (nur ihre eine Ansicht, Figma 01c/01d).
 */
@Component({
  selector: 'tk-shell',
  imports: [RouterOutlet, Sidebar, TabBar, MoreSheet],
  host: { '(document:keydown)': 'onKey($event)' },
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly layout = inject(LayoutService);

  protected readonly moreOpen = signal(false);

  constructor() {
    // Hält als Trainer die Scout-Sicht aktuell (SCRUM-170); für andere Rollen tut der Dienst nichts.
    inject(ScoutPublishService);
  }

  protected readonly variant = computed<'desktop' | 'mobile' | 'focused'>(() => {
    if (!showsNavigation(this.session.role())) return 'focused';
    return this.layout.isMobile() ? 'mobile' : 'desktop';
  });

  /** Strg/⌘ + K öffnet die Suche (nur für Trainer; Spieler, Eltern und Medizin haben keine Suche). */
  protected onKey(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    if (this.session.role() !== 'trainer') return;
    event.preventDefault();
    void this.router.navigateByUrl('/suche');
  }

  /** Aktiv, wenn die aktuelle Seite nur über „Mehr“ erreichbar ist. */
  protected moreActive(): boolean {
    const url = this.router.url;
    return [...MORE_GROUPS.flatMap((group) => group.items), PRIVACY_ITEM].some(
      (item) => url === item.path || url.startsWith(`${item.path}/`),
    );
  }
}
