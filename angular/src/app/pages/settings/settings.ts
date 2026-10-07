import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RETENTION_OPTIONS } from '../../core/workspace';
import { ThemeService } from '../../core/theme.service';
import { WorkspaceService } from '../../core/workspace.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';
import { Dialog } from '../../ui/dialog/dialog';

/** Einstellungen & Datenschutz: Darstellung, lokale Aufbewahrung, lokale Daten löschen, Aktivitätsverlauf. */
@Component({
  selector: 'app-settings',
  imports: [Button, Card, Dialog],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly theme = inject(ThemeService);
  protected readonly workspace = inject(WorkspaceService);
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

  protected time(iso: string): string {
    return new Date(iso).toLocaleString('de-DE');
  }
}
