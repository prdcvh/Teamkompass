import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MORE_GROUPS, PRIVACY_ITEM } from '../../core/navigation';
import { ThemeService } from '../../core/theme.service';
import { Dialog } from '../../ui/dialog/dialog';
import { Icon } from '../../ui/icon/icon';

/** Figma „07 Mehr (Overlay)“: weitere Bereiche, Verwaltung und App-Einstellungen. */
@Component({
  selector: 'tk-more-sheet',
  imports: [Dialog, Icon, RouterLink],
  templateUrl: './more-sheet.html',
  styleUrl: './more-sheet.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreSheet {
  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly theme = inject(ThemeService);
  protected readonly groups = MORE_GROUPS;
  protected readonly privacy = PRIVACY_ITEM;
}
