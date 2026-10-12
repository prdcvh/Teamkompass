import { Routes } from '@angular/router';
import { authGuard, guestGuard, memberViewGuard, trainerGuard } from './core/auth.guard';
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
      // Die eine Ansicht für Spieler, Eltern und Medizin (Figma 01c/01d); der Trainer wird zur Übersicht geschickt.
      { path: 'ansicht', canActivate: [memberViewGuard], loadComponent: () => import('./pages/member-view/member-view').then((m) => m.MemberView) },
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
          { path: 'suche', loadComponent: () => import('./pages/search/search').then((m) => m.Search) },
          { path: 'zugaenge', loadComponent: () => import('./pages/access/access').then((m) => m.Access) },
          { path: 'trainer-konto', loadComponent: () => import('./pages/staff-account/staff-account').then((m) => m.StaffAccount), data: { role: 'trainer' } },
          { path: 'medizin-zugang', loadComponent: () => import('./pages/staff-account/staff-account').then((m) => m.StaffAccount), data: { role: 'medical' } },
          { path: 'export', loadComponent: placeholder, data: { title: 'Daten exportieren' } },
          { path: 'einstellungen', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
