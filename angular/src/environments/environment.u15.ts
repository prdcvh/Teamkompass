import { firebaseConfig } from './firebase';

// Live-Team U15 (heute outputs/u15). Nur für den Umstieg (SCRUM-76), nicht deployen ohne PO-Freigabe.
export const environment = {
  teamId: 'U15',
  clubName: '1. FC Königstein',
  teamLabel: 'U15',
  teamName: '1. FC Königstein U15',
  firebase: firebaseConfig,
} as const;
