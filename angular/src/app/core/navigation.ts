import type { IconName } from '../ui/icon/icon';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly hint?: string;
}

/** Noch nicht gebaute Bereiche: Pfad → Ticket, in dem sie entstehen (Hinweis statt leerer Seite). */
export const PLANNED_IN: Readonly<Record<string, string>> = {
  '/teamanalyse': 'SCRUM-70',
  '/gegneranalyse': 'SCRUM-71',
  '/aufstellung': 'SCRUM-72',
  '/zugaenge': 'SCRUM-73',
  '/trainer-konto': 'SCRUM-73',
  '/medizin-zugang': 'SCRUM-73',
  '/ansicht': 'SCRUM-74',
  '/suche': 'SCRUM-75',
  '/export': 'SCRUM-75',
};

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

/** Verwaltungsbereiche: Quelle für Handy-„Mehr“-Blatt und Desktop-Sidebar, damit beide nicht auseinanderlaufen. */
export const ADMIN_ITEMS: readonly NavItem[] = [
  { path: '/suche', label: 'Suche', icon: 'search', hint: 'Spieler, Events, Gegner' },
  { path: '/zugaenge', label: 'Spieler-Zugänge', icon: 'key', hint: 'Einladungscodes verwalten' },
  { path: '/trainer-konto', label: 'Trainer-Konto anlegen', icon: 'user-plus' },
  { path: '/medizin-zugang', label: 'Medizinischer Lesezugang', icon: 'medical' },
  { path: '/export', label: 'Daten exportieren', icon: 'download', hint: 'Sicherung als Datei' },
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
    items: ADMIN_ITEMS,
  },
];

export const PRIVACY_ITEM: NavItem = { path: '/einstellungen', label: 'Einstellungen & Datenschutz', icon: 'shield' };
