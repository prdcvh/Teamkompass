import { Routes } from '@angular/router';
import { authGuard, guestGuard, trainerGuard } from './core/auth.guard';
import { Shell } from './shell/shell';

const placeholder = () => import('./pages/placeholder/placeholder').then((m) => m.Placeholder);

export const routes: Routes = [
  {
    path: 'styleguide',
    loadComponent: () => import('./pages/styleguide/styleguide').then((m) => m.Styleguide),
  },
  {
    path: 'anmelden',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'abmelden',
    loadComponent: () => import('./pages/sign-out/sign-out').then((m) => m.SignOut),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      // Die eine Ansicht für Spieler, Eltern und Medizin (Figma 01c/01d) – folgt als eigenes Ticket.
      { path: 'ansicht', loadComponent: placeholder, data: { title: 'Meine Ansicht' } },
      {
        path: '',
        canActivateChild: [trainerGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'start' },
          { path: 'start', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
          { path: 'kader', loadComponent: () => import('./pages/squad/squad').then((m) => m.Squad) },
          { path: 'events', loadComponent: () => import('./pages/events/events').then((m) => m.Events) },
          { path: 'events/:id', loadComponent: () => import('./pages/event-rating/event-rating').then((m) => m.EventRating) },
          { path: 'profile', loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile) },
          { path: 'profile/:id', loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile) },
          { path: 'teamanalyse', loadComponent: () => import('./pages/team-analysis/team-analysis').then((m) => m.TeamAnalysis) },
          { path: 'gegneranalyse', loadComponent: () => import('./pages/opponents/opponents').then((m) => m.Opponents) },
          { path: 'aufstellung', loadComponent: () => import('./pages/lineup/lineup').then((m) => m.Lineup) },
          { path: 'suche', loadComponent: placeholder, data: { title: 'Suche' } },
          { path: 'zugaenge', loadComponent: placeholder, data: { title: 'Spieler-Zugänge' } },
          { path: 'trainer-konto', loadComponent: placeholder, data: { title: 'Trainer-Konto anlegen' } },
          { path: 'medizin-zugang', loadComponent: placeholder, data: { title: 'Medizinischer Lesezugang' } },
          { path: 'export', loadComponent: placeholder, data: { title: 'Daten exportieren' } },
          { path: 'einstellungen', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
