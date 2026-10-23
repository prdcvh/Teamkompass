import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MIN_PASSWORD_LENGTH } from '../../core/access/access';
import { AGE_GROUPS, formatInviteCode, normalizeInviteCode, suggestTeamName } from '../../core/registration/registration';
import { RegistrationService } from '../../core/registration/registration.service';
import { Button } from '../../ui/button/button';

/**
 * Registrierung nur mit Einladungscode (SCRUM-181): Konto → E-Mail bestätigen → Verein/Team anlegen → Einstieg.
 * Den Code bekommt ein neuer Verein vom PO (Skript), ein neues Team im bestehenden Verein vom Vereinsadmin.
 */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, Button],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register implements OnDestroy {
  protected readonly reg = inject(RegistrationService);
  private readonly router = inject(Router);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly ageGroups = AGE_GROUPS;
  /** Neues Konto oder „Ich habe schon ein Konto“ (z. B. nach dem Klick auf den Bestätigungslink). */
  protected readonly existing = signal(false);
  protected readonly showPassword = signal(false);

  protected code = '';
  protected email = '';
  protected password = '';
  protected repeat = '';

  protected clubName = '';
  protected readonly ageGroup = signal('');
  protected readonly ownAgeGroup = signal(false);
  protected teamName = '';
  private teamNameTouched = false;

  protected readonly stepNumber = computed(() => ({ account: 1, verify: 2, team: 3, done: 3 })[this.reg.step()]);
  protected readonly formattedCode = computed(() => formatInviteCode(this.reg.invite()?.code ?? ''));

  constructor() {
    this.reg.begin(location.origin);
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.code = formatInviteCode(normalizeInviteCode(params.get('code') ?? '').slice(0, 16));
    // Rücksprung aus der Bestätigungsmail: Konto gibt es schon.
    if (params.get('weiter') === '1') this.existing.set(true);
  }

  ngOnDestroy(): void {
    void this.reg.leave();
  }

  protected toggleExisting(): void {
    this.existing.set(!this.existing());
    this.reg.error.set('');
    this.reg.accountErrors.set({});
  }

  protected async submitAccount(): Promise<void> {
    if (this.existing()) await this.reg.signIn({ code: this.code, email: this.email, password: this.password });
    else await this.reg.createAccount({ code: this.code, email: this.email, password: this.password, repeat: this.repeat });
    this.password = '';
    this.repeat = '';
  }

  protected chooseAgeGroup(value: string): void {
    this.ownAgeGroup.set(value === 'other');
    this.ageGroup.set(value === 'other' ? '' : value);
    this.suggest();
  }

  protected setOwnAgeGroup(value: string): void {
    this.ageGroup.set(value);
    this.suggest();
  }

  protected suggest(): void {
    if (this.teamNameTouched) return;
    const club = this.reg.invite()?.kind === 'club' ? this.clubName : this.reg.clubName();
    this.teamName = suggestTeamName(club, this.ageGroup());
  }

  protected touchTeamName(): void {
    this.teamNameTouched = true;
  }

  protected async submitTeam(): Promise<void> {
    const done = await this.reg.createTeam({ clubName: this.clubName, ageGroup: this.ageGroup(), teamName: this.teamName });
    if (done) await this.router.navigateByUrl('/willkommen');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }
}
