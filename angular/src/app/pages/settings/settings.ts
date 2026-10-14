import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { AccountService } from '../../core/auth/account.service';
import { MIN_PASSWORD_LENGTH } from '../../core/access/access';
import { SessionService } from '../../core/auth/session.service';
import { RETENTION_OPTIONS } from '../../core/device/workspace';
import { ThemeService } from '../../core/device/theme.service';
import { WorkspaceService } from '../../core/device/workspace.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

/** Einstellungen & Datenschutz: Darstellung, lokale Aufbewahrung, lokale Daten löschen, Aktivitätsverlauf. */
@Component({
  selector: 'app-settings',
  imports: [Button, Card, Dialog, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  protected readonly workspace = inject(WorkspaceService);
  private readonly account = inject(AccountService);
  /** Nur Konten mit E-Mail und Passwort (Trainer, Medizin) können das Passwort ändern. */
  private readonly session = inject(SessionService);
  protected readonly canChangePassword = computed(() => ['trainer', 'medical'].includes(this.session.role() ?? ''));
  protected readonly passwordMin = MIN_PASSWORD_LENGTH;
  protected current = '';
  protected next = '';
  protected repeat = '';
  protected readonly passwordBusy = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordChanged = signal(false);
  protected readonly retentionOptions = RETENTION_OPTIONS;
  protected readonly confirmClear = signal(false);
  protected readonly cleared = signal(false);

  protected setRetention(event: Event): void {
    this.workspace.setRetention(Number((event.target as HTMLSelectElement).value));
  }

  protected clear(): void {
    this.workspace.clearLocalData();
    this.confirmClear.set(false);
    this.cleared.set(true);
  }

  protected async changePassword(form: NgForm): Promise<void> {
    if (this.passwordBusy()) return;
    this.passwordBusy.set(true);
    this.passwordError.set('');
    this.passwordChanged.set(false);
    try {
      const result = await this.account.changePassword(this.current, this.next, this.repeat);
      if (result.ok) {
        form.resetForm();
        this.passwordChanged.set(true);
      } else {
        this.passwordError.set(result.message);
      }
    } finally {
      this.passwordBusy.set(false);
    }
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('de-DE');
  }
}
