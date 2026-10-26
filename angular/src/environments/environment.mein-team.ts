import { firebaseConfig } from './firebase';

// Haupt-Team (U14, echte Daten teams/mein-team): seit SCRUM-208 auf Hosting-Ziel main (teamkompass-b8aac.web.app) live.
// Rückweg auf die alte App outputs/team-manager: FIREBASE_SETUP.md §11.
export const environment = {
  teamId: 'mein-team',
  clubName: '1. FC Königstein',
  teamLabel: 'U14',
  teamName: '1. FC Königstein U14',
  firebase: firebaseConfig,
} as const;
