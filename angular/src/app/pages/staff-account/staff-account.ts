import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MIN_PASSWORD_LENGTH, type StaffErrors, type StaffRole, staffAccountSubject, validateStaffDraft } from '../../core/access/access';
import { AccessService } from '../../core/access/access.service';
import { SessionService } from '../../core/auth/session.service';
import { Button } from '../../ui/button/button';
import { Card } from '../../ui/card/card';

/**
 * Trainer-Konto, Scout-Zugang bzw. Medizin-Zugang anlegen (drei Routen, eine Seite: `data.role`). Auth-Konto und
 * Zugang entstehen in einem Schritt; das Passwort liegt nur im Formular und wird nach dem Anlegen geleert.
 */
function staffRoleOf(value: unknown): StaffRole {
  return value === 'medical' || value === 'scout' ? value : 'trainer';
}

const STAFF_TITLES: Readonly<Record<StaffRole, string>> = {
  trainer: 'Trainer-Konto anlegen',
  scout: 'Scout-Zugang anlegen',
  medical: 'Medizin-Zugang anlegen',
};

/** SCRUM-170: Scout und Medizin sind getrennte Zugänge mit klar beschriebenem Umfang. */
const STAFF_INTROS: Readonly<Record<StaffRole, string>> = {
  trainer: 'Legt ein weiteres Trainer-Konto an. Trainer dürfen alle Teamdaten lesen und ändern sowie Zugänge verwalten.',
  scout:
    'Legt ein Konto an, das Kompetenzprofil, Notenverlauf und Statistik nur lesen darf. Verletzungen, Abwesenheitsgründe, Messwerte und Notizen bleiben verborgen.',
  medical:
    'Legt ein Konto für Medizin/Physio an, das Status, Abwesenheiten, Verletzungen und Messwerte nur lesen darf. Bewertungen und interne Notizen bleiben verborgen.',
};

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

  protected readonly role: StaffRole = staffRoleOf(inject(ActivatedRoute).snapshot.data['role']);
  protected readonly isTrainer = computed(() => this.session.role() === 'trainer');
  protected readonly title = STAFF_TITLES[this.role];
  protected readonly intro = STAFF_INTROS[this.role];
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
        this.success.set(`${staffAccountSubject(this.role)} für ${email} wurde angelegt.`);
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
