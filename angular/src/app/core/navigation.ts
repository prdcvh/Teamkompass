import type { IconName } from '../ui/icon/icon';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly hint?: string;
}

/** Hauptnavigation des Trainers (Desktop: Sidebar „Mannschaft“). */
export const SIDEBAR_ITEMS: readonly NavItem[] = [
  { path: '/start', label: 'Dashboard', icon: 'grid' },
  { path: '/kader', label: 'Kader', icon: 'users' },
  { path: '/events', label: 'Events', icon: 'calendar' },
  { path: '/profile', label: 'Spielerprofile', icon: 'user' },
  { path: '/teamanalyse', label: 'Teamanalyse', icon: 'chart' },
  { path: '/gegneranalyse', label: 'Gegneranalyse', icon: 'target' },
  { path: '/aufstellung', label: 'Aufstellung', icon: 'diamond' },
];

/** Tab-Leiste am Handy: vier feste Bereiche, „Mehr“ öffnet das Sheet. */
export const TAB_ITEMS: readonly NavItem[] = [
  { path: '/start', label: 'Start', icon: 'grid' },
  { path: '/kader', label: 'Kader', icon: 'users' },
  { path: '/events', label: 'Events', icon: 'calendar' },
  { path: '/profile', label: 'Profile', icon: 'user' },
];

export interface MoreGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/** Inhalt des „Weitere Bereiche“-Sheets (Reihenfolge wie in Figma). */
export const MORE_GROUPS: readonly MoreGroup[] = [
  {
    title: 'Bereiche',
    items: [
      { path: '/gegneranalyse', label: 'Gegneranalyse', icon: 'target', hint: 'Matchplan & Gegnerprofile' },
      { path: '/teamanalyse', label: 'Teamanalyse', icon: 'chart', hint: 'Form, Kennzahlen, Positionen' },
    ],
  },
  {
    title: 'Verwaltung',
    items: [
      { path: '/suche', label: 'Suche', icon: 'search', hint: 'Spieler, Events, Gegner' },
      { path: '/zugaenge', label: 'Spieler-Zugänge', icon: 'key', hint: 'Einladungscodes verwalten' },
      { path: '/trainer-konto', label: 'Trainer-Konto anlegen', icon: 'user-plus' },
      { path: '/medizin-zugang', label: 'Medizinischer Lesezugang', icon: 'medical' },
      { path: '/export', label: 'Daten exportieren', icon: 'download', hint: 'Sicherung als Datei' },
    ],
  },
];

export const PRIVACY_ITEM: NavItem = { path: '/einstellungen', label: 'Datenschutz & lokale Daten', icon: 'shield' };
