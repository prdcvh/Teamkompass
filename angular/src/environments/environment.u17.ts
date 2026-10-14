import { firebaseConfig } from './firebase';

// Live-Team U17 (heute outputs/u17). Nur für den Umstieg (SCRUM-76), nicht deployen ohne PO-Freigabe.
export const environment = {
  teamId: 'U17',
  clubName: '1. FC Königstein',
  teamLabel: 'U17',
  teamName: '1. FC Königstein U17',
  firebase: firebaseConfig,
} as const;
