import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TAB_ITEMS } from '../../core/navigation';
import { Icon } from '../../ui/icon/icon';

/** Handy-Navigation (Figma „Tab Bar“): vier Bereiche plus „Mehr“. */
@Component({
  selector: 'tk-tab-bar',
  imports: [RouterLink, RouterLinkActive, Icon],
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabBar {
  /** True, solange ein Bereich aus dem „Mehr“-Sheet aktiv ist. */
  readonly moreActive = input(false);
  readonly moreRequested = output<void>();
  protected readonly items = TAB_ITEMS;
}
