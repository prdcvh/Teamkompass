import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** „Abmelden“ aus Navigation und Mehr-Sheet: meldet ab, leert lokale Daten und geht zur Anmeldung. */
@Component({
  selector: 'app-sign-out',
  template: '<p>Du wirst abgemeldet …</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignOut {
  constructor() {
    const router = inject(Router);
    void inject(AuthService)
      .signOut()
      .then(() => router.navigateByUrl('/anmelden'));
  }
}
