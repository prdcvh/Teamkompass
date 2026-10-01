import { inject } from '@angular/core';
import { type CanActivateChildFn, type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

/** Seiten nur für Angemeldete. Wartet, bis der Anmeldezustand feststeht – vorher wird nichts gezeigt. */
export const authGuard: CanActivateFn = async () => {
  // inject() nur vor dem ersten await: danach gibt es keinen Injection-Kontext mehr.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenResolved();
  return auth.status() === 'ready' ? true : router.createUrlTree(['/anmelden']);
};

/** Anmeldeseite: wer schon angemeldet ist, wird weitergeleitet. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenResolved();
  return auth.status() === 'ready' ? router.createUrlTree(['/']) : true;
};

/** Trainer-Bereiche. Spieler, Eltern und Medizin gehen zu ihrer einen Ansicht. */
export const trainerGuard: CanActivateChildFn = () => {
  const session = inject(SessionService);
  return session.role() === 'trainer' ? true : inject(Router).createUrlTree(['/ansicht']);
};
