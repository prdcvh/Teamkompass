import { Routes } from '@angular/router';
import { Shell } from './shell/shell';

const placeholder = () => import('./pages/placeholder/placeholder').then((m) => m.Placeholder);

export const routes: Routes = [
  {
    path: 'styleguide',
    loadComponent: () => import('./pages/styleguide/styleguide').then((m) => m.Styleguide),
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'start' },
      { path: 'start', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
      { path: 'kader', loadComponent: placeholder, data: { title: 'Kader' } },
      { path: 'events', loadComponent: placeholder, data: { title: 'Events' } },
      { path: 'profile', loadComponent: placeholder, data: { title: 'Spielerprofile' } },
      { path: 'teamanalyse', loadComponent: placeholder, data: { title: 'Teamanalyse' } },
      { path: 'gegneranalyse', loadComponent: placeholder, data: { title: 'Gegneranalyse' } },
      { path: 'aufstellung', loadComponent: placeholder, data: { title: 'Aufstellung' } },
      { path: 'suche', loadComponent: placeholder, data: { title: 'Suche' } },
      { path: 'zugaenge', loadComponent: placeholder, data: { title: 'Spieler-Zugänge' } },
      { path: 'trainer-konto', loadComponent: placeholder, data: { title: 'Trainer-Konto anlegen' } },
      { path: 'medizin-zugang', loadComponent: placeholder, data: { title: 'Medizinischer Lesezugang' } },
      { path: 'export', loadComponent: placeholder, data: { title: 'Daten exportieren' } },
      { path: 'einstellungen', loadComponent: placeholder, data: { title: 'Datenschutz & lokale Daten' } },
      { path: 'abmelden', loadComponent: placeholder, data: { title: 'Abmelden' } },
    ],
  },
  { path: '**', redirectTo: '' },
];
