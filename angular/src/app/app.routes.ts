import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'styleguide',
    loadComponent: () => import('./pages/styleguide/styleguide').then((m) => m.Styleguide),
  },
  { path: '**', redirectTo: '' },
];
