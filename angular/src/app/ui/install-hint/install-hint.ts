import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { InstallHintService } from '../../core/device/install-hint.service';
import { Button } from '../button/button';
import { Dialog } from '../dialog/dialog';
import { Icon } from '../icon/icon';

/**
 * Hinweis „Zum Startbildschirm hinzufügen“ für die Startseiten (Trainer und Spieler). Er steht im Seitenfluss
 * (nicht über dem Inhalt), verdeckt also weder Bedienelemente noch die untere Navigation.
 */
@Component({
  selector: 'tk-install-hint',
  imports: [Button, Dialog, Icon],
  templateUrl: './install-hint.html',
  styleUrl: './install-hint.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallHint {
  protected readonly hint = inject(InstallHintService);
  protected readonly steps = signal(false);

  protected later(): void {
    this.steps.set(false);
    this.hint.later();
  }

  protected never(): void {
    this.steps.set(false);
    this.hint.never();
  }
}
