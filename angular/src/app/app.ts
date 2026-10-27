import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { AppUpdateService } from './core/device/app-update.service';
import { InstallHintService } from './core/device/install-hint.service';
import { LiveOutboxService } from './core/live/live-outbox.service';
import { Button } from './ui/button/button';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Button],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly update = inject(AppUpdateService);
  // Früh erzeugen, damit `beforeinstallprompt` nicht verpasst wird.
  private readonly installHint = inject(InstallHintService);
  // Früh erzeugen: schickt beim Öffnen der App noch offene Live-Punkte erneut (Funkloch, SCRUM-216).
  private readonly liveOutbox = inject(LiveOutboxService);
}
