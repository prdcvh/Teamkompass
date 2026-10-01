import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { Button } from '../../ui/button/button';

type Tab = 'trainer' | 'code';

/** Figma „01 Anmeldung“ / „01b Login Spieler/Eltern“: Trainer-Login und Einladungscode. */
@Component({
  selector: 'app-login',
  imports: [FormsModule, Button],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly tab = signal<Tab>('trainer');
  protected email = '';
  protected password = '';
  protected code = '';
  protected readonly club = environment.clubName;
  protected readonly team = environment.teamLabel;

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.auth.error.set('');
  }

  protected async submitTrainer(): Promise<void> {
    await this.auth.signInTrainer(this.email, this.password);
    await this.leaveIfSignedIn();
  }

  protected async submitCode(): Promise<void> {
    await this.auth.signInWithCode(this.code);
    await this.leaveIfSignedIn();
  }

  private async leaveIfSignedIn(): Promise<void> {
    if (this.auth.status() === 'ready') await this.router.navigateByUrl('/');
  }
}
