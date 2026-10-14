import { firebaseConfig } from './firebase';

// Standard-Build und Test-Instanz teamkompass-u14 (Daten aus „mein-team“ kopiert).
export const environment = {
  teamId: 'U14',
  clubName: '1. FC Königstein',
  teamLabel: 'U14',
  teamName: '1. FC Königstein U14',
  firebase: firebaseConfig,
} as const;
