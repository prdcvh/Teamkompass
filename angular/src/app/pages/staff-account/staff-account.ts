import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MIN_PASSWORD_LENGTH, type StaffErrors, type StaffRole, validateStaffDraft } from '../../core/access/access';
import { AccessService } from '../../core/access/access.service';
import { SessionService } from '../../core/auth/session.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Trainer-Konto bzw. Scout-Zugang anlegen (zwei Routen, eine Seite: `data.role`). Auth-Konto und
 * Zugang entstehen in einem Schritt; das Passwort liegt nur im Formular und wird nach dem Anlegen geleert.
 */
@Component({
  selector: 'app-staff-account',
  imports: [FormsModule, Button, Card],
  templateUrl: './staff-account.html',
  styleUrl: './staff-account.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffAccount {
  private readonly access = inject(AccessService);
  private readonly session = inject(SessionService);

  protected readonly role: StaffRole = inject(ActivatedRoute).snapshot.data['role'] === 'medical' ? 'medical' : 'trainer';
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly title = this.role === 'medical' ? 'Scout-Zugang' : 'Trainer-Konto anlegen';
  protected readonly intro =
    this.role === 'medical'
      ? 'Legt ein Konto an, das Spielerdaten, Abwesenheiten und Messwerte nur lesen darf. Bewertungen und interne Notizen bleiben verborgen.'
      : 'Legt ein weiteres Trainer-Konto an. Trainer dürfen alle Teamdaten lesen und ändern sowie Zugänge verwalten.';
  protected readonly minLength = MIN_PASSWORD_LENGTH;

  protected email = '';
  protected password = '';
  protected repeat = '';
  protected readonly errors = signal<StaffErrors>({});
  protected readonly busy = signal(false);
  protected readonly failure = signal('');
  protected readonly success = signal('');
  protected readonly showPassword = signal(false);

  protected async submit(): Promise<void> {
    if (this.busy() || !this.isTrainer()) return;
    this.success.set('');
    this.failure.set('');
    const errors = validateStaffDraft({ email: this.email, password: this.password, repeat: this.repeat });
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.busy.set(true);
    try {
      const email = this.email.trim();
      const result = await this.access.createStaff(this.role, email, this.password);
      if (result.ok) {
        this.success.set(`${this.role === 'medical' ? 'Der Scout-Zugang' : 'Das Trainer-Konto'} für ${email} wurde angelegt.`);
        this.email = '';
        this.password = '';
        this.repeat = '';
        this.showPassword.set(false);
      } else {
        this.failure.set(result.message);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
