import { firebaseConfig } from './firebase';

// Live-Team U17: seit SCRUM-169 auf Hosting-Ziel u17 (teamkompass-u17.web.app) live, echte Daten teams/U17.
// Rückweg auf die alte App outputs/u17: FIREBASE_SETUP.md §9.
export const environment = {
  teamId: 'U17',
  clubName: '1. FC Königstein',
  teamLabel: 'U17',
  teamName: '1. FC Königstein U17',
  firebase: firebaseConfig,
} as const;
