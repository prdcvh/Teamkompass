import { firebaseConfig } from './firebase';

// Live-Team U15 (echte Daten teams/U15): seit SCRUM-210 auf Hosting-Ziel u15 (teamkompass-u15.web.app) live.
// Rückweg auf die alte App outputs/u15: FIREBASE_SETUP.md §11.
export const environment = {
  teamId: 'U15',
  clubName: '1. FC Königstein',
  teamLabel: 'U15',
  teamName: '1. FC Königstein U15',
  firebase: firebaseConfig,
} as const;
