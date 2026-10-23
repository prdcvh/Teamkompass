import { inject } from '@angular/core';
import { type CanActivateChildFn, type CanActivateFn, Router } from '@angular/router';
import { CurrentTeam } from '../team/current-team.service';
import { AuthService } from './auth.service';
import { INVITE_PARAM, inviteCodeFromParam } from './invite-link';
import { homeFor } from './role';
import { SessionService } from './session.service';

/**
 * Seiten nur für Angemeldete. Wartet, bis der Anmeldezustand feststeht – vorher wird nichts gezeigt.
 * Ein Einladungslink der bisherigen App (`/?invite=<code>`) behält beim Weiterleiten seinen Code (SCRUM-169).
 */
export const authGuard: CanActivateFn = async (route) => {
  // inject() nur vor dem ersten await: danach gibt es keinen Injection-Kontext mehr.
  const auth = inject(AuthService);
  const router = inject(Router);
  const invite = inviteCodeFromParam(route?.queryParamMap?.get(INVITE_PARAM));
  await auth.whenResolved();
  if (auth.status() === 'chooseTeam') {
    return router.createUrlTree(['/team-waehlen'], invite ? { queryParams: { [INVITE_PARAM]: invite } } : {});
  }
  if (auth.status() === 'ready') return true;
  return router.createUrlTree(['/anmelden'], invite ? { queryParams: { [INVITE_PARAM]: invite } } : {});
};

/** Anmeldeseite: wer schon angemeldet ist, wird weitergeleitet. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const session = inject(SessionService);
  await auth.whenResolved();
  if (auth.status() === 'chooseTeam') return router.createUrlTree(['/team-waehlen']);
  return auth.status() === 'ready' ? router.createUrlTree([homeFor(session.role())]) : true;
};

/** Teamauswahl (SCRUM-181): nach der Anmeldung mit mehreren Teams oder später zum Wechseln. */
export const teamChoiceGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const team = inject(CurrentTeam);
  await auth.whenResolved();
  if (auth.status() === 'chooseTeam') return true;
  if (auth.status() !== 'ready') return router.createUrlTree(['/anmelden']);
  return team.choices().length > 1 ? true : router.createUrlTree(['/']);
};

/** Trainer-Bereiche. Spieler, Eltern und Medizin gehen zu ihrer einen Ansicht. */
export const trainerGuard: CanActivateChildFn = () => {
  const session = inject(SessionService);
  return session.role() === 'trainer' ? true : inject(Router).createUrlTree(['/ansicht']);
};

/**
 * Die Ansicht für Spieler, Eltern und Medizin. Der Trainer hat sie nicht (kein verknüpftes Profil) und geht zu
 * seiner Übersicht. Welche Daten jemand sieht, entscheiden zusätzlich die Firestore-Regeln.
 */
export const memberViewGuard: CanActivateFn = () => {
  const role = inject(SessionService).role();
  return role === null || role === 'trainer' ? inject(Router).createUrlTree(['/start']) : true;
};
